import type { TranslationStatusResponse } from '@lingo-lens/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FAKE_BLOB_ORIGIN, mockApi, type RecordedRequest } from '../test/mockApi';
import { renderWithProviders } from '../test/render';
import { captureSaves } from '../test/saves';
import { DocumentTranslation } from './DocumentTranslation';

const GUID = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b';
const SECOND_GUID = '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a';
const READY: TranslationStatusResponse = { status: 'ready', kind: 'document' };

function fileOf(name: string) {
  return new File(['source bytes'], name);
}

function renderScreen() {
  mockApi.languages([{ code: 'fr', name: 'French' }]);
  return renderWithProviders(<DocumentTranslation pollIntervalMs={1} />);
}

/** Everything up to the polls answers successfully; the test arranges the rest. */
function arrangeUploadAndStart() {
  mockApi.createUpload({}, SECOND_GUID);
  mockApi.blobUpload();
  mockApi.startTranslation({ id: 'tr-1' });
  mockApi.deleteTranslation();
}

async function translate(file = fileOf('Report.pdf')) {
  const user = userEvent.setup();
  await user.upload(screen.getByLabelText('File to translate'), file);
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Translate into' }),
    await screen.findByRole('option', { name: 'French' }),
  );
  await user.click(screen.getByRole('button', { name: 'Translate' }));
  return user;
}

/** The failure MessageBar, found by its sentence. */
const findFailure = async (sentence: string | RegExp) => {
  const text = await screen.findByText(sentence);
  return text.closest<HTMLElement>('[role="group"]')!;
};

const deletes = (requests: RecordedRequest[]) => requests.filter((r) => r.method === 'DELETE').map((r) => r.url);

describe('Document Translation failures: Service problem', () => {
  it('replaces the status area with one message, a reference code and Try again, moves focus to it, and deletes at once', async () => {
    renderScreen();
    arrangeUploadAndStart();
    mockApi.translationStatus({ status: 'translating' }, { status: 'failed', category: 'serviceProblem' });
    const requests = mockApi.recordRequests();

    await translate();

    const bar = await findFailure('Lingo Lens is busy, try again in a minute.');
    expect(bar).toHaveTextContent('Reference: 3f2b8c1e');
    expect(bar).not.toHaveTextContent(GUID);
    await waitFor(() => expect(bar).toHaveFocus());
    expect(screen.getByRole('status')).toHaveTextContent('');
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Try again']);
    await waitFor(() => expect(deletes(requests)).toEqual(['/api/translations/tr-1']));
  });
});

describe('Document Translation failures: retrying', () => {
  it('Try again after a Service problem runs the whole Translation again with the same file and language', async () => {
    renderScreen();
    arrangeUploadAndStart();
    mockApi.translationStatus({ status: 'failed', category: 'serviceProblem' });
    const requests = mockApi.recordRequests();
    const saves = captureSaves();
    const user = await translate(fileOf('Report.pdf'));
    await findFailure('Lingo Lens is busy, try again in a minute.');
    mockApi.translationStatus({ status: 'translating' }, READY);
    mockApi.translatedFile();
    mockApi.blobDownload('translated bytes');

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(saves.map((s) => s.name)).toEqual(['Report.fr.pdf']));
    // (jsdom's File does not reach MSW as bytes, so the PUTs are compared by target.)
    const puts = requests.filter((r) => r.method === 'PUT');
    expect(puts.map((r) => r.url.split('?')[0])).toEqual([
      `${FAKE_BLOB_ORIGIN}/source/${GUID}/file.bin`,
      `${FAKE_BLOB_ORIGIN}/source/${SECOND_GUID}/file.bin`,
    ]);
    const starts = requests.filter((r) => r.method === 'POST' && r.url === '/api/translations');
    expect(starts.map((r) => JSON.parse(r.body) as unknown)).toEqual([
      { uploadId: GUID, extension: 'pdf', targetLanguage: 'fr' },
      { uploadId: SECOND_GUID, extension: 'pdf', targetLanguage: 'fr' },
    ]);
  });

  it('shows Upload failed when the PUT to Blob Storage fails, and Try again re-uploads the in-memory file with a new SAS and GUID', async () => {
    renderScreen();
    arrangeUploadAndStart();
    mockApi.blobUpload(500, 201);
    mockApi.translationStatus({ status: 'translating' });
    const requests = mockApi.recordRequests();
    const user = await translate(fileOf('Report.pdf'));

    const bar = await findFailure('The upload didn’t finish. Check your connection and try again.');
    expect(bar).toHaveTextContent('Reference: 3f2b8c1e');
    await waitFor(() => expect(bar).toHaveFocus());
    expect(deletes(requests)).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    await screen.findByText('Translating…');
    const puts = requests.filter((r) => r.method === 'PUT');
    expect(puts.map((r) => r.url.split('?')[0])).toEqual([
      `${FAKE_BLOB_ORIGIN}/source/${GUID}/file.bin`,
      `${FAKE_BLOB_ORIGIN}/source/${SECOND_GUID}/file.bin`,
    ]);
    expect(screen.getByRole('status')).toHaveTextContent('Translating…');
  });

  it('keeps polling through 3 failed polls in a row', async () => {
    renderScreen();
    arrangeUploadAndStart();
    mockApi.translationStatus({ httpStatus: 503 }, { httpStatus: 500 }, { httpStatus: 502 }, READY);
    mockApi.translatedFile();
    mockApi.blobDownload();
    const saves = captureSaves();

    await translate();

    await screen.findByRole('heading', { name: 'Your translation is ready' });
    await waitFor(() => expect(saves).toHaveLength(1));
  });

  it('shows Service problem, and deletes, on the 4th failed poll in a row', async () => {
    renderScreen();
    arrangeUploadAndStart();
    mockApi.translationStatus({ httpStatus: 503 }, { httpStatus: 503 }, { httpStatus: 503 }, { httpStatus: 503 }, READY);
    const requests = mockApi.recordRequests();

    await translate();

    await findFailure('Lingo Lens is busy, try again in a minute.');
    await waitFor(() => expect(deletes(requests)).toEqual(['/api/translations/tr-1']));
    expect(requests.filter((r) => r.method === 'GET' && r.url === '/api/translations/tr-1')).toHaveLength(4);
  });

  it('shows the category the API reports when Azure refuses the start, with nothing to delete', async () => {
    renderScreen();
    arrangeUploadAndStart();
    mockApi.startTranslationFails(502, { status: 'failed', category: 'serviceProblem' });
    const requests = mockApi.recordRequests();

    await translate();

    const bar = await findFailure('Lingo Lens is busy, try again in a minute.');
    expect(bar).toHaveTextContent('Reference: 3f2b8c1e');
    expect(deletes(requests)).toEqual([]);
  });
});

describe("Document Translation failures: Can't translate", () => {
  it.each([
    [
      undefined,
      'Lingo Lens couldn’t translate this file. It may be damaged, protected, or not the format its name suggests. Check it opens normally and try another file.',
    ],
    ['passwordProtected', 'This file is password-protected or encrypted. Remove the protection and try again.'],
    ['damaged', 'This file looks damaged or isn’t a real PDF file.'],
  ] as const)('reason %s: says why, and offers Choose another file', async (reason, sentence) => {
    renderScreen();
    arrangeUploadAndStart();
    mockApi.translationStatus({ status: 'failed', category: 'cantTranslate', ...(reason ? { reason } : {}) });
    const requests = mockApi.recordRequests();

    await translate();

    const bar = await findFailure(sentence);
    expect(bar).toHaveTextContent('Reference: 3f2b8c1e');
    await waitFor(() => expect(bar).toHaveFocus());
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Choose another file']);
    await waitFor(() => expect(deletes(requests)).toEqual(['/api/translations/tr-1']));
  });

  it('Choose another file goes back to the picker', async () => {
    renderScreen();
    arrangeUploadAndStart();
    mockApi.translationStatus({ status: 'failed', category: 'cantTranslate' });
    const user = await translate();
    await findFailure(/couldn’t translate this file/);

    await user.click(screen.getByRole('button', { name: 'Choose another file' }));

    expect(screen.getByLabelText('File to translate')).toBeEnabled();
    expect(screen.queryByText(/couldn’t translate this file/)).not.toBeInTheDocument();
  });
});

describe('Document Translation failures: Download failed', () => {
  it('stays Ready with "Download failed. Try again", which fetches a new SAS; only the successful save deletes', async () => {
    renderScreen();
    arrangeUploadAndStart();
    mockApi.translationStatus(READY);
    mockApi.translatedFile({});
    mockApi.blobDownload({ httpStatus: 403 }, 'translated bytes');
    const requests = mockApi.recordRequests();
    const saves = captureSaves();
    const user = await translate();

    await screen.findByText('Download failed.');
    expect(screen.getByRole('heading', { name: 'Your translation is ready' })).toBeInTheDocument();
    expect(saves).toEqual([]);
    expect(deletes(requests)).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(saves.map((s) => s.name)).toEqual(['Report.fr.pdf']));
    await waitFor(() => expect(deletes(requests)).toEqual(['/api/translations/tr-1']));
    expect(requests.filter((r) => r.url === '/api/translations/tr-1/file')).toHaveLength(2);
    expect(screen.queryByText('Download failed.')).not.toBeInTheDocument();
  });
});
