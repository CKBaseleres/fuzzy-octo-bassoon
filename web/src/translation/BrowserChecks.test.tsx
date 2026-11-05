import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockApi } from '../test/mockApi';
import { renderWithProviders } from '../test/render';
import { DocumentTranslation, PDF_NOTE } from './DocumentTranslation';
import encryptedDocx from '../test/fixtures/encrypted.docx?inline';
import encryptedPdf from '../test/fixtures/encrypted.pdf?inline';
import plainDocx from '../test/fixtures/plain.docx?inline';
import plainPdf from '../test/fixtures/plain.pdf?inline';

const PROTECTED = 'This file is password-protected or encrypted. Remove the protection and try again.';

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
