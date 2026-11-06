import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockApi } from '../test/mockApi';
import { renderWithProviders } from '../test/render';
import { captureSaves } from '../test/saves';
import { TranslationScreen } from './TranslationScreen';

// Ticket 12: every message bar is a named group (its message is its name), and
// a message that ends a Translation takes focus so a screen reader reads it.

function renderScreen() {
  mockApi.languages([{ code: 'fr', name: 'French' }]);
  return renderWithProviders(<TranslationScreen pollIntervalMs={1} />);
}

async function translate(file = new File(['source bytes'], 'Report.pdf')) {
  const user = userEvent.setup();
  await user.upload(screen.getByLabelText('File to translate'), file);
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Translate into' }),
    await screen.findByRole('option', { name: 'French' }),
  );
  await user.click(screen.getByRole('button', { name: 'Translate' }));
}

describe('Message bars: names and focus', () => {
  it('names a failure message by its sentence', async () => {
    renderScreen();
    mockApi.createUpload();
    mockApi.blobUpload();
    mockApi.startTranslation({ id: 'tr-1' });
    mockApi.deleteTranslation();
    mockApi.translationStatus({ status: 'failed', category: 'serviceProblem' });

    await translate();

    const bar = await screen.findByRole('group', { name: /Something went wrong on our side\. Try again\./ });
    await waitFor(() => expect(bar).toHaveFocus());
  });

  it('names the PDF note by its text', async () => {
    renderScreen();
    const user = userEvent.setup();
    await user.upload(screen.getByLabelText('File to translate'), new File(['%PDF-1.7'], 'Report.pdf'));

    expect(await screen.findByRole('group', { name: 'Scanned pages in mixed PDFs may stay untranslated.' })).toBeVisible();
  });

  it('moves focus to a refusal, named by its message', async () => {
    renderScreen();
    mockApi.createUploadRefused('hourly', 600);

    await translate();

    const bar = await screen.findByRole('group', { name: 'You’ve reached the hourly limit. Try again in 10 minutes.' });
    await waitFor(() => expect(bar).toHaveFocus());
  });

  it('moves focus to "Download failed." rather than the ready heading', async () => {
    renderScreen();
    mockApi.createUpload();
    mockApi.blobUpload();
    mockApi.startTranslation({ id: 'tr-1' });
    mockApi.deleteTranslation();
    mockApi.translationStatus({ status: 'ready', kind: 'document' });
    mockApi.translatedFile({});
    mockApi.blobDownload({ httpStatus: 403 });
    captureSaves();

    await translate();

    const bar = await screen.findByRole('group', { name: 'Download failed.' });
    await waitFor(() => expect(bar).toHaveFocus());
  });
});
