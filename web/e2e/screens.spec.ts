import type { FailedTranslationResponse } from '@lingo-lens/shared';
import { expect, test, type Page } from '@playwright/test';
import { BAD_DIMENSIONS_MESSAGE, PROTECTED_MESSAGE } from '../src/translation/sourceFile';
import { expectAccessibleAtEveryWidth } from './a11y';
import { fakeApi, type FakeApi } from './fakeApi';
import { encryptedPdf, photoPng, plainPdf, type PickedFile } from './files';

/** `PDF_NOTE` in TranslationScreen.tsx (not imported: that module pulls in React and Fluent). */
const PDF_NOTE = 'Scanned pages in mixed PDFs may stay untranslated.';

/**
 * Every screen state of the spec, checked with axe at 320 / 768 / desktop
 * (ticket 12). Each test drives the real SPA into one state through the UI,
 * with only the network faked.
 */

const LANGUAGES = [
  { code: 'de', name: 'German' },
  { code: 'fr', name: 'French' },
];

let api: FakeApi;

test.beforeEach(async ({ page }) => {
  api = fakeApi(page);
  await api.languages(LANGUAGES);
});

async function open(page: Page) {
  await page.goto('/');
  await expect(page.getByLabel('Translate into').getByRole('option', { name: 'French' })).toBeAttached();
}

/** Picks a file and a language, as staff do, without pressing Translate. */
async function pick(page: Page, file: PickedFile, language = 'fr') {
  await open(page);
  await page.getByLabel('File to translate').setInputFiles(file);
  await page.getByLabel('Translate into').selectOption(language);
}

async function translate(page: Page, file: PickedFile) {
  await pick(page, file);
  await page.getByRole('button', { name: 'Translate', exact: true }).click();
}

test('empty', async ({ page }) => {
  await open(page);
  await expectAccessibleAtEveryWidth(page);
});

test('picking: a PDF and a language chosen', async ({ page }) => {
  await pick(page, plainPdf());
  await expect(page.getByText(PDF_NOTE)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Translate', exact: true })).toBeEnabled();
  await expectAccessibleAtEveryWidth(page);
});

const sized = (name: string, mimeType: string, bytes: number): PickedFile => ({ name, mimeType, buffer: Buffer.alloc(bytes) });

const REJECTIONS: { name: string; file: () => PickedFile; message: string }[] = [
  {
    name: 'unsupported type',
    file: () => sized('photos.zip', 'application/zip', 10),
    message: 'This file type isn’t supported',
  },
  { name: 'empty file', file: () => sized('empty.docx', 'application/octet-stream', 0), message: 'This file is empty' },
  {
    name: 'Document over 40 MB',
    file: () => sized('huge.pdf', 'application/pdf', 41 * 1024 * 1024),
    message: 'This Document is larger than 40 MB',
  },
  {
    name: 'Image over 20 MB',
    file: () => sized('huge.png', 'image/png', 21 * 1024 * 1024),
    message: 'This Image is larger than 20 MB',
  },
  { name: 'password-protected', file: encryptedPdf, message: PROTECTED_MESSAGE },
  { name: 'Image too small', file: () => photoPng(40, 40, 'icon.png'), message: BAD_DIMENSIONS_MESSAGE },
];

for (const rejection of REJECTIONS) {
  test(`rejection: ${rejection.name}`, async ({ page }) => {
    await pick(page, rejection.file());
    await expect(page.getByText(rejection.message)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Translate', exact: true })).toBeDisabled();
    await expectAccessibleAtEveryWidth(page);
  });
}

test('uploading', async ({ page }) => {
  await api.createUpload();
  await api.blobUploadHangs();
  await translate(page, plainPdf());
  await expect(page.getByRole('status')).toHaveText('Uploading…');
  await expectAccessibleAtEveryWidth(page);
});

test('translating', async ({ page }) => {
  await api.createUpload();
  await api.blobUpload();
  await api.startTranslation();
  await api.translationStatus({ status: 'translating' });
  await translate(page, plainPdf());
  await expect(page.getByRole('status')).toHaveText('Translating…');
  await expectAccessibleAtEveryWidth(page);
});

/** Arranges a Document Translation that ends Ready, up to the file request. */
async function arrangeDocumentReady() {
  await api.createUpload();
  await api.blobUpload();
  await api.startTranslation();
  await api.translationStatus({ status: 'ready', kind: 'document' });
}

test('Document ready (saved)', async ({ page }) => {
  await arrangeDocumentReady();
  await api.translatedFile();
  await api.blobDownload();
  await translate(page, plainPdf());
  await expect(page.getByRole('heading', { name: 'Your translation is ready' })).toBeFocused();
  await expect(page.getByText(/^Saved as /)).toBeVisible();
  await expectAccessibleAtEveryWidth(page);
});

test('Document ready, download failed', async ({ page }) => {
  await arrangeDocumentReady();
  await api.translatedFile();
  await api.blobDownload({ httpStatus: 500 });
  await translate(page, plainPdf());
  await expect(page.getByText('Download failed.')).toBeVisible();
  await expectAccessibleAtEveryWidth(page);
});

const PARAGRAPHS = [
  { polygon: [64, 20, 576, 20, 576, 50, 64, 50], original: 'Ausgang', translation: 'Sortie', detectedLanguage: 'de' },
  {
    polygon: [64, 100, 576, 100, 576, 130, 64, 130],
    original: 'Bitte die Tür geschlossen halten',
    translation: 'Merci de garder la porte fermée',
    detectedLanguage: 'de',
  },
  {
    polygon: [64, 180, 576, 180, 576, 210, 64, 210],
    original: 'Notausgang nur im Brandfall benutzen. Der Alarm wird ausgelöst.',
    translation: 'Sortie de secours à n’utiliser qu’en cas d’incendie. L’alarme se déclenchera.',
    detectedLanguage: 'de',
  },
];

test('Image result with a block selected', async ({ page }) => {
  await api.createUpload();
  await api.blobUpload();
  await api.startTranslation();
  await api.translationStatus({
    status: 'ready',
    kind: 'image',
    page: { width: 640, height: 480 },
    paragraphs: PARAGRAPHS,
    detectedLanguage: 'de',
    isHandwritten: true,
  });
  // A long file name, as phones produce, must wrap rather than widen the page.
  await translate(page, photoPng(640, 480, 'fire-door-sign-photographed-in-the-east-stairwell.png'));
  await expect(page.getByRole('heading', { name: /fire-door-sign/ })).toBeFocused();
  const card = page.getByRole('listitem').filter({ hasText: 'Merci de garder' });
  await card.click();
  await expect(card).toHaveAttribute('aria-current', 'true');
  await expectAccessibleAtEveryWidth(page);

  // At 320 px the long badges wrap inside their outline instead of spilling out of it.
  await page.setViewportSize({ width: 320, height: 640 });
  const spilled = await page
    .locator('.fui-Badge')
    .evaluateAll((badges) => badges.filter((b) => b.scrollHeight > b.clientHeight + 1).map((b) => b.textContent));
  expect(spilled).toEqual([]);
});

test('No text found (Image kept on screen)', async ({ page }) => {
  await api.createUpload();
  await api.blobUpload();
  await api.startTranslation();
  await api.translationStatus({ status: 'failed', category: 'noTextFound' });
  await translate(page, photoPng(640, 480, 'blank-wall.png'));
  await expect(page.getByText('No text found')).toBeVisible();
  await expectAccessibleAtEveryWidth(page);
});

test('failure: Upload failed', async ({ page }) => {
  await api.createUpload();
  await api.blobUpload(500);
  await translate(page, plainPdf());
  await expect(page.getByText('The upload didn’t finish.', { exact: false })).toBeVisible();
  await expectAccessibleAtEveryWidth(page);
});

const POLLED_FAILURES: { name: string; failure: FailedTranslationResponse; text: string }[] = [
  { name: 'Can’t translate (generic)', failure: { status: 'failed', category: 'cantTranslate' }, text: 'couldn’t translate this file' },
  {
    name: 'Can’t translate (damaged)',
    failure: { status: 'failed', category: 'cantTranslate', reason: 'damaged' },
    text: 'looks damaged',
  },
  {
    name: 'Can’t translate (password-protected)',
    failure: { status: 'failed', category: 'cantTranslate', reason: 'passwordProtected' },
    text: PROTECTED_MESSAGE,
  },
  {
    name: 'Can’t translate (bad dimensions)',
    failure: { status: 'failed', category: 'cantTranslate', reason: 'badDimensions' },
    text: BAD_DIMENSIONS_MESSAGE,
  },
  { name: 'Service problem', failure: { status: 'failed', category: 'serviceProblem' }, text: 'Something went wrong on our side' },
  {
    name: 'Service problem (Azure busy)',
    failure: { status: 'failed', category: 'serviceProblem', reason: 'busy' },
    text: 'Lingo Lens is busy',
  },
];

for (const { name, failure, text } of POLLED_FAILURES) {
  test(`failure: ${name}`, async ({ page }) => {
    await api.createUpload();
    await api.blobUpload();
    await api.startTranslation();
    await api.translationStatus(failure);
    await translate(page, plainPdf());
    await expect(page.getByText(text, { exact: false })).toBeVisible();
    await expectAccessibleAtEveryWidth(page);
  });
}

test('failure: Can’t translate reported at submit (502)', async ({ page }) => {
  await api.createUpload();
  await api.blobUpload();
  await api.startTranslationFails(502, { status: 'failed', category: 'cantTranslate', reason: 'damaged' });
  await translate(page, plainPdf());
  await expect(page.getByText('looks damaged', { exact: false })).toBeVisible();
  await expectAccessibleAtEveryWidth(page);
});

test('Expired', async ({ page }) => {
  await arrangeDocumentReady();
  await api.translatedFileExpired();
  await translate(page, plainPdf());
  await expect(page.getByText('This translation has expired, please start again.')).toBeVisible();
  await expectAccessibleAtEveryWidth(page);
});

for (const limit of ['hourly', 'daily'] as const) {
  test(`Refused (${limit})`, async ({ page }) => {
    await api.createUploadRefused(limit, 1200);
    await translate(page, plainPdf());
    await expect(page.getByText(limit === 'daily' ? 'today’s limit' : 'hourly limit', { exact: false })).toBeVisible();
    await expectAccessibleAtEveryWidth(page);
  });
}
