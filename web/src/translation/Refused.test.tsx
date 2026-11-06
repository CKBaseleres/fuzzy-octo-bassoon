import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockApi } from '../test/mockApi';
import { renderWithProviders } from '../test/render';
import { TranslationScreen } from './TranslationScreen';

// Ticket 08: quota and kill-switch refusals (429 + Retry-After).

function renderScreen() {
  mockApi.languages([{ code: 'fr', name: 'French' }]);
  return renderWithProviders(<TranslationScreen pollIntervalMs={1} />);
}

async function translate() {
  const user = userEvent.setup();
  await user.upload(screen.getByLabelText('File to translate'), new File(['x'], 'Report.pdf'));
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Translate into' }),
    await screen.findByRole('option', { name: 'French' }),
  );
  await user.click(screen.getByRole('button', { name: 'Translate' }));
}

/** The MessageBar that holds `text`. */
async function messageBar(text: string) {
  const body = await screen.findByText(text);
  const bar = body.closest<HTMLElement>('.fui-MessageBar');
  expect(bar).not.toBeNull();
  return bar!;
}

describe('Document Translation: refused', () => {
  it('tells staff how many minutes to wait when their hourly limit is reached, with no action', async () => {
    renderScreen();
    mockApi.createUploadRefused('hourly', 12 * 60 + 30);
    const requests = mockApi.recordRequests();

    await translate();

    const bar = await messageBar('You’ve reached the hourly limit. Try again in 13 minutes.');
    expect(within(bar).queryByRole('button')).not.toBeInTheDocument();
    expect(requests.filter((r) => r.method === 'PUT')).toHaveLength(0);
  });

  it('says "1 minute" when less than a minute is left', async () => {
    renderScreen();
    mockApi.createUploadRefused('hourly', 20);

    await translate();

    await messageBar('You’ve reached the hourly limit. Try again in 1 minute.');
  });

  it('tells staff to come back tomorrow when the daily limit is reached or Translations are switched off', async () => {
    renderScreen();
    mockApi.createUploadRefused('daily', 5 * 3600);

    await translate();

    const bar = await messageBar('Lingo Lens has reached today’s limit. Try again tomorrow.');
    expect(within(bar).queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows the same refusal when the limit was reached between upload and start', async () => {
    renderScreen();
    mockApi.createUpload();
    mockApi.blobUpload();
    mockApi.startTranslationRefused('hourly', 59 * 60);

    await translate();

    await messageBar('You’ve reached the hourly limit. Try again in 59 minutes.');
  });

  it('keeps the form, so staff can try again later', async () => {
    renderScreen();
    mockApi.createUploadRefused('hourly', 600);

    await translate();

    await messageBar('You’ve reached the hourly limit. Try again in 10 minutes.');
    expect(screen.getByRole('button', { name: 'Translate' })).toBeEnabled();
  });
});
