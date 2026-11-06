import type { TranslationStatusResponse } from '@lingo-lens/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import photoPng from '../test/fixtures/photo-200x120.png?inline';
import { mockApi, type RecordedRequest } from '../test/mockApi';
import { renderWithProviders } from '../test/render';
import { TranslationScreen } from './TranslationScreen';
import { BAD_DIMENSIONS_MESSAGE } from './sourceFile';

/** A real 200 x 120 PNG, so it passes every browser check. */
function photo(name = 'Whiteboard.png') {
  const base64 = photoPng.slice(photoPng.indexOf(',') + 1);
  return new File([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], name, { type: 'image/png' });
}

function captureObjectUrls() {
  const made: Blob[] = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    made.push(blob as Blob);
    return `blob:image/${made.length}`;
  });
  const revoked: string[] = [];
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => void revoked.push(url));
  return { made, revoked };
}

function arrangeImage(outcome: TranslationStatusResponse) {
  mockApi.languages([{ code: 'fr', name: 'French' }]);
  mockApi.createUpload();
  mockApi.blobUpload();
  mockApi.startTranslation({ id: 'tr-img' });
  mockApi.translationStatus({ status: 'translating' }, outcome);
  mockApi.deleteTranslation();
  renderWithProviders(<TranslationScreen pollIntervalMs={1} />);
}

async function translate(file: File) {
  const user = userEvent.setup({ applyAccept: false });
  await user.upload(screen.getByLabelText('File to translate'), file);
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Translate into' }),
    await screen.findByRole('option', { name: 'French' }),
  );
  await waitFor(() => expect(screen.getByRole('button', { name: 'Translate' })).toBeEnabled());
  await user.click(screen.getByRole('button', { name: 'Translate' }));
  return user;
}

/** The failure MessageBar, found by its text. */
const findFailure = async (text: string | RegExp) => (await screen.findByText(text)).closest<HTMLElement>('[role="group"]')!;

const deletes = (requests: RecordedRequest[]) => requests.filter((r) => r.method === 'DELETE').map((r) => r.url);

const HINT = 'Try a sharper, straighter photo. Some handwriting and languages can’t be read.';

describe('Image Translation: No text found', () => {
  it('still shows the Image, with a warning in place of the cards, the hint, a reference and Choose another file', async () => {
    const urls = captureObjectUrls();
    arrangeImage({ status: 'failed', category: 'noTextFound' });
    const requests = mockApi.recordRequests();
    const file = photo();

    await translate(file);

    const bar = await findFailure(HINT);
    expect(bar).toHaveTextContent('No text found');
    expect(bar).toHaveTextContent('Reference: 3f2b8c1e');
    await waitFor(() => expect(bar).toHaveFocus());
    expect(screen.getByRole('heading', { level: 2, name: 'Whiteboard.png' })).toBeInTheDocument();
    const image = screen.getByRole('img', { name: 'Whiteboard.png, no text found' });
    expect(image).toHaveAttribute('src', 'blob:image/1');
    expect(urls.made).toEqual([file]);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Show original' })).not.toBeInTheDocument();
    expect(screen.queryByText('Ready')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Choose another file']);
    await waitFor(() => expect(deletes(requests)).toEqual(['/api/translations/tr-img']));
  });

  it('Choose another file goes back to the picker and lets go of the Image', async () => {
    const urls = captureObjectUrls();
    arrangeImage({ status: 'failed', category: 'noTextFound' });
    const user = await translate(photo());
    await findFailure(HINT);

    await user.click(screen.getByRole('button', { name: 'Choose another file' }));

    expect(screen.getByLabelText('File to translate')).toBeEnabled();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(urls.revoked).toEqual(['blob:image/1']);
  });
});

describe("Image Translation: Can't translate", () => {
  it.each([
    ['badDimensions', BAD_DIMENSIONS_MESSAGE],
    ['damaged', 'This file looks damaged or isn’t a real PNG file.'],
  ] as const)('reason %s: says why, and offers Choose another file', async (reason, sentence) => {
    arrangeImage({ status: 'failed', category: 'cantTranslate', reason });

    await translate(photo());

    const bar = await findFailure(sentence);
    expect(bar).toHaveTextContent('Reference: 3f2b8c1e');
    await waitFor(() => expect(bar).toHaveFocus());
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Choose another file']);
  });

  it('a badDimensions refusal at the start says the same as the browser check', async () => {
    mockApi.languages([{ code: 'fr', name: 'French' }]);
    mockApi.createUpload();
    mockApi.blobUpload();
    mockApi.startTranslationFails(502, { status: 'failed', category: 'cantTranslate', reason: 'badDimensions' });
    renderWithProviders(<TranslationScreen pollIntervalMs={1} />);

    await translate(photo());

    expect(await screen.findByText(BAD_DIMENSIONS_MESSAGE)).toBeInTheDocument();
  });
});
