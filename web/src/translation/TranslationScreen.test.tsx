import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockApi } from '../test/mockApi';
import { renderWithProviders } from '../test/render';
import { captureSaves } from '../test/saves';
import { TranslationScreen } from './TranslationScreen';

const LANGUAGES = [
  { code: 'zh-Hans', name: 'Chinese Simplified' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
];

function fileOf(name: string, size = 1024, type = '') {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

function renderScreen() {
  mockApi.languages(LANGUAGES);
  return renderWithProviders(<TranslationScreen pollIntervalMs={1} />);
}

/** Lets a test pick files the `accept` filter would hide (drag and drop, "All files"). */
const anyFileUser = () => userEvent.setup({ applyAccept: false });

const fileInput = () => screen.getByLabelText('File to translate');
const languageSelect = () => screen.getByRole('combobox', { name: 'Translate into' });
const translateButton = () => screen.getByRole('button', { name: 'Translate' });

function arrangeHappyPath({ extension = 'pdf' } = {}) {
  mockApi.createUpload();
  mockApi.blobUpload();
  mockApi.startTranslation({ id: 'tr-1' });
  mockApi.translationStatus({ status: 'translating' }, { status: 'translating' }, { status: 'ready', kind: 'document' });
  mockApi.translatedFile({ extension });
  mockApi.blobDownload('translated bytes');
  mockApi.deleteTranslation();
}

async function translate(file: File, language = 'French') {
  const user = userEvent.setup();
  await user.upload(fileInput(), file);
  await user.selectOptions(languageSelect(), await screen.findByRole('option', { name: language }));
  await user.click(translateButton());
  return user;
}

describe('Document Translation: picking', () => {
  it('states the size limits up front', async () => {
    renderScreen();

    expect(screen.getByText('Documents up to 40 MB · Images up to 20 MB')).toBeInTheDocument();
    await screen.findByRole('option', { name: 'French' });
  });

  it('accepts every batch Document format at the picker', async () => {
    renderScreen();

    const accept = fileInput().getAttribute('accept')!.split(',');
    expect(accept).toEqual(
      expect.arrayContaining(['.pdf', '.docx', '.doc', '.xlsx', '.pptx', '.odt', '.rtf', '.md', '.html', '.mht', '.msg', '.txt', '.csv', '.tsv', '.tab', '.xlf']),
    );
    await screen.findByRole('option', { name: 'French' });
  });

  it('offers every Translator target language, with no source language to pick', async () => {
    renderScreen();

    await screen.findByRole('option', { name: 'French' });
    const names = screen.getAllByRole('option').map((o) => o.textContent);
    expect(names).toEqual(expect.arrayContaining(['Chinese Simplified', 'French', 'German']));
    expect(screen.queryByRole('combobox', { name: /from|source/i })).not.toBeInTheDocument();
  });

  it.each([
    ['a file of the wrong type', fileOf('setup.exe'), 'This file type isn’t supported.'],
    ['a Document over 40 MB', fileOf('Huge.pdf', 40 * 1024 * 1024 + 1), 'This Document is larger than 40 MB.'],
    ['an empty file', fileOf('Empty.docx', 0), 'This file is empty.'],
  ])('rejects %s inline, before any upload', async (_case, file, message) => {
    renderScreen();
    const user = anyFileUser();
    await user.selectOptions(languageSelect(), await screen.findByRole('option', { name: 'French' }));

    await user.upload(fileInput(), file);

    expect(screen.getByText(message, { exact: false })).toBeInTheDocument();
    expect(translateButton()).toBeDisabled();
  });

  it('accepts a Document of exactly 40 MB', async () => {
    renderScreen();
    const user = userEvent.setup();
    await user.selectOptions(languageSelect(), await screen.findByRole('option', { name: 'French' }));

    await user.upload(fileInput(), fileOf('Big.pdf', 40 * 1024 * 1024));

    expect(translateButton()).toBeEnabled();
  });

  it('shows a standing note for PDFs only', async () => {
    renderScreen();
    const user = userEvent.setup();
    const note = 'Scanned pages in mixed PDFs may stay untranslated';

    await user.upload(fileInput(), fileOf('Report.pdf'));
    expect(screen.getByText(note, { exact: false })).toBeInTheDocument();

    await user.upload(fileInput(), fileOf('Report.docx'));
    expect(screen.queryByText(note, { exact: false })).not.toBeInTheDocument();
    await screen.findByRole('option', { name: 'French' });
  });
});

describe('Document Translation: translating', () => {
  it('uploads straight to Blob Storage and starts the Translation without the filename ever leaving the browser', async () => {
    renderScreen();
    arrangeHappyPath();
    captureSaves();
    const requests = mockApi.recordRequests();

    await translate(fileOf('Quarterly Report.pdf'));
    await screen.findByText('Ready');

    const upload = requests.find((r) => r.method === 'PUT');
    expect(upload?.url).toMatch(/^https:\/\/fake\.blob\.core\.windows\.net\/source\//);
    expect(upload?.headers.get('x-ms-blob-type')).toBe('BlockBlob');
    const start = requests.find((r) => r.method === 'POST' && r.url === '/api/translations');
    expect(JSON.parse(start!.body)).toEqual({
      translationGuid: '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b',
      extension: 'pdf',
      targetLanguage: 'fr',
    });
    const createUpload = requests.find((r) => r.url === '/api/translations/uploads');
    expect(JSON.parse(createUpload!.body)).toEqual({ extension: 'pdf' });
    for (const r of requests.filter((r) => r.url.startsWith('/api'))) {
      expect(`${r.url} ${r.body}`).not.toContain('Quarterly');
    }
  });

  it('announces uploading, translating and ready in a polite live region', async () => {
    renderScreen();
    arrangeHappyPath();
    captureSaves();
    const announced: string[] = [];

    const user = userEvent.setup();
    await user.upload(fileInput(), fileOf('Report.pdf'));
    await user.selectOptions(languageSelect(), await screen.findByRole('option', { name: 'French' }));
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    const observer = new MutationObserver(() => {
      const text = status.textContent ?? '';
      if (text && announced.at(-1) !== text) announced.push(text);
    });
    observer.observe(status, { childList: true, subtree: true, characterData: true });
    await user.click(translateButton());
    await screen.findByText('Ready');
    observer.disconnect();

    expect(announced).toEqual(['Uploading…', 'Translating…', 'Ready']);
  });

  it('moves focus to the result heading when ready', async () => {
    renderScreen();
    arrangeHappyPath();
    captureSaves();

    await translate(fileOf('Report.pdf'));

    const heading = await screen.findByRole('heading', { name: 'Your translation is ready' });
    await waitFor(() => expect(heading).toHaveFocus());
  });
});

describe('Document Translation: saving', () => {
  it('saves the Translated file as <name>.<target>.<ext>, and only then deletes it from Azure', async () => {
    renderScreen();
    arrangeHappyPath();
    const requests = mockApi.recordRequests();
    const deletesAtSave: number[] = [];
    const saves = captureSaves(() => deletesAtSave.push(requests.filter((r) => r.method === 'DELETE').length));

    await translate(fileOf('Report.pdf'));

    await waitFor(() => expect(requests.filter((r) => r.method === 'DELETE')).toHaveLength(1));
    expect(saves.map((s) => s.name)).toEqual(['Report.fr.pdf']);
    expect(await saves[0]!.blob.text()).toBe('translated bytes');
    expect(deletesAtSave).toEqual([0]);
    expect(requests.find((r) => r.method === 'DELETE')?.url).toBe('/api/translations/tr-1');
  });

  it('names the file after the format Translator returned (legacy formats come back converted)', async () => {
    renderScreen();
    arrangeHappyPath({ extension: 'docx' });
    const saves = captureSaves();

    await translate(fileOf('Minutes.2026.doc'), 'German');

    await waitFor(() => expect(saves.map((s) => s.name)).toEqual(['Minutes.2026.de.docx']));
  });

  it('can save again from memory while the page stays open, without calling Azure', async () => {
    renderScreen();
    arrangeHappyPath();
    const requests = mockApi.recordRequests();
    const saves = captureSaves();
    const user = await translate(fileOf('Report.pdf'));
    await waitFor(() => expect(requests.filter((r) => r.method === 'DELETE')).toHaveLength(1));
    const before = requests.length;

    await user.click(screen.getByRole('button', { name: 'Save again' }));

    expect(saves.map((s) => s.name)).toEqual(['Report.fr.pdf', 'Report.fr.pdf']);
    expect(await saves[1]!.blob.text()).toBe('translated bytes');
    expect(requests).toHaveLength(before);
  });
});

describe('Document Translation: expired', () => {
  const EXPIRED_TEXT = 'This translation has expired, please start again.';

  it('shows the expired message with Translate again when a poll finds the Translation expired, and moves focus to it', async () => {
    renderScreen();
    arrangeHappyPath();
    mockApi.translationStatus({ status: 'translating' }, { status: 'failed', category: 'expired' });

    await translate(fileOf('Report.pdf'));

    const message = await screen.findByText(EXPIRED_TEXT);
    expect(screen.getByRole('button', { name: 'Translate again' })).toBeInTheDocument();
    await waitFor(() => expect(message.closest('[tabindex="-1"]')).toHaveFocus());
  });

  it('shows the expired message when the Translated file is already gone', async () => {
    renderScreen();
    arrangeHappyPath();
    mockApi.translatedFileExpired();
    const saves = captureSaves();

    await translate(fileOf('Report.pdf'));

    expect(await screen.findByText(EXPIRED_TEXT)).toBeInTheDocument();
    expect(saves).toHaveLength(0);
  });

  it('translates again with the same in-memory file and target language, without picking it again', async () => {
    renderScreen();
    arrangeHappyPath();
    mockApi.translationStatus({ status: 'failed', category: 'expired' });
    const saves = captureSaves();
    const requests = mockApi.recordRequests();
    const user = await translate(fileOf('Report.pdf'), 'German');
    await screen.findByText(EXPIRED_TEXT);
    mockApi.translationStatus({ status: 'ready', kind: 'document' });

    await user.click(screen.getByRole('button', { name: 'Translate again' }));

    await waitFor(() => expect(saves.map((s) => s.name)).toEqual(['Report.de.pdf']));
    const starts = requests.filter((r) => r.method === 'POST' && r.url === '/api/translations');
    expect(starts.map((r) => (JSON.parse(r.body) as { targetLanguage: string }).targetLanguage)).toEqual(['de', 'de']);
    expect(requests.filter((r) => r.method === 'PUT')).toHaveLength(2);
  });

  it('keeps nothing in sessionStorage or localStorage, so a refresh abandons the Translation', async () => {
    renderScreen();
    arrangeHappyPath();
    mockApi.translationStatus({ status: 'translating' });
    sessionStorage.clear();
    localStorage.clear();

    await translate(fileOf('Report.pdf'));
    await screen.findByText('Translating…');

    expect(sessionStorage).toHaveLength(0);
    expect(localStorage).toHaveLength(0);
  });
});
