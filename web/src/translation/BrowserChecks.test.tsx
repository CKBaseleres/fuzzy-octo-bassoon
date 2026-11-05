import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockApi } from '../test/mockApi';
import { renderWithProviders } from '../test/render';
import { DocumentTranslation, PDF_NOTE } from './DocumentTranslation';
import encryptedDocx from '../test/fixtures/encrypted.docx?inline';
import encryptedPdf from '../test/fixtures/encrypted.pdf?inline';
import plainDocx from '../test/fixtures/plain.docx?inline';
import plainPdf from '../test/fixtures/plain.pdf?inline';
import tinyPng from '../test/fixtures/tiny-40x40.png?inline';
import photoPng from '../test/fixtures/photo-200x120.png?inline';
import panoramaJpg from '../test/fixtures/panorama-12000x800.jpg?inline';
import photoJpg from '../test/fixtures/photo-640x480.jpg?inline';
import stripBmp from '../test/fixtures/strip-30x-400.bmp?inline';
import scanTif from '../test/fixtures/scan-20000x300.tif?inline';
import iconHeic from '../test/fixtures/icon-48x48.heic?inline';
import photoHeic from '../test/fixtures/photo-4032x3024.heic?inline';

const PROTECTED = 'This file is password-protected or encrypted. Remove the protection and try again.';
const BAD_DIMENSIONS = 'This image is too small or too large to read.';

/** A fixture (imported as a base64 data URL) as the File a staff member picks. */
function fixture(dataUrl: string, name: string) {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new File([bytes], name);
}

async function pick(file: File) {
  mockApi.languages([{ code: 'fr', name: 'French' }]);
  const requests = mockApi.recordRequests();
  renderWithProviders(<DocumentTranslation pollIntervalMs={1} />);
  const user = userEvent.setup({ applyAccept: false });
  await user.upload(screen.getByLabelText('File to translate'), file);
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Translate into' }),
    await screen.findByRole('option', { name: 'French' }),
  );
  return { user, requests };
}

describe('Browser checks: password-protected files', () => {
  it('rejects a .docx that is an OLE container rather than a ZIP, before any upload', async () => {
    const { user, requests } = await pick(fixture(encryptedDocx, 'Payroll.docx'));

    expect(await screen.findByText(PROTECTED)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Translate' }));
    expect(requests.map((r) => r.url)).toEqual(['/api/languages']);
  });

  it.each(['Payroll.xlsx', 'Payroll.pptx'])('rejects an encrypted %s the same way', async (name) => {
    await pick(fixture(encryptedDocx, name));

    expect(await screen.findByText(PROTECTED)).toBeInTheDocument();
  });

  it('rejects a PDF with /Encrypt in its trailer, before any upload', async () => {
    const { user, requests } = await pick(fixture(encryptedPdf, 'Contract.pdf'));

    expect(await screen.findByText(PROTECTED)).toBeInTheDocument();
    expect(screen.queryByText(PDF_NOTE)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Translate' }));
    expect(requests.map((r) => r.url)).toEqual(['/api/languages']);
  });

  it.each([
    [plainDocx, 'Letter.docx'],
    [plainPdf, 'Letter.pdf'],
  ])('lets an unprotected file through to upload (%#)', async (data, name) => {
    mockApi.createUpload();
    mockApi.blobUpload();
    mockApi.startTranslation({ id: 'tr-1' });
    mockApi.translationStatus({ status: 'translating' });
    const { user, requests } = await pick(fixture(data, name));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Translate' })).toBeEnabled());
    expect(screen.queryByText(PROTECTED)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Translate' }));
    await waitFor(() => expect(requests.map((r) => r.url)).toContain('/api/translations/uploads'));
  });
});

describe('Browser checks: Image dimensions', () => {
  it.each([
    [tinyPng, 'Sticker.png'],
    [panoramaJpg, 'Panorama.jpg'],
    [stripBmp, 'Strip.bmp'],
    [scanTif, 'Scan.tif'],
    [iconHeic, 'Icon.heic'],
  ])('rejects an Image under 50 px or over 10,000 px on a side, before any upload (%#)', async (data, name) => {
    const { user, requests } = await pick(fixture(data, name));

    expect(await screen.findByText(BAD_DIMENSIONS)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Translate' }));
    expect(requests.map((r) => r.url)).toEqual(['/api/languages']);
  });

  it.each([
    [photoPng, 'Photo.png'],
    [photoJpg, 'Photo.jpg'],
    [photoHeic, 'Photo.heic'],
  ])('lets an Image within 50–10,000 px through to upload (%#)', async (data, name) => {
    mockApi.createUpload();
    mockApi.blobUpload();
    mockApi.startTranslation({ id: 'tr-1' });
    mockApi.translationStatus({ status: 'translating' });
    const { user, requests } = await pick(fixture(data, name));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Translate' })).toBeEnabled());
    expect(screen.queryByText(BAD_DIMENSIONS)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Translate' }));
    await waitFor(() => expect(requests.map((r) => r.url)).toContain('/api/translations/uploads'));
  });
});
