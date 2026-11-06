import type { TranslationStatusResponse } from '@lingo-lens/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockApi } from '../test/mockApi';
import { renderWithProviders } from '../test/render';
import { TranslationScreen } from './TranslationScreen';

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
];

const CAFE_SIGN: TranslationStatusResponse = {
  status: 'ready',
  kind: 'image',
  page: { width: 1024, height: 768 },
  paragraphs: [
    {
      polygon: [102, 88, 470, 92, 469, 142, 101, 138],
      original: 'Plat du jour',
      translation: 'Dish of the day',
      detectedLanguage: 'fr',
    },
    {
      polygon: [96, 190, 610, 196, 608, 252, 95, 246],
      original: "Soupe à l'oignon 6 €",
      translation: 'Onion soup €6',
      detectedLanguage: 'fr',
    },
  ],
  detectedLanguage: 'fr',
  isHandwritten: false,
};

function fileOf(name: string, size = 1024, type = '') {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

function renderScreen() {
  mockApi.languages(LANGUAGES);
  return renderWithProviders(<TranslationScreen pollIntervalMs={1} />);
}

const fileInput = () => screen.getByLabelText('File to translate');

function arrangeImage(result: TranslationStatusResponse = CAFE_SIGN) {
  mockApi.createUpload();
  mockApi.blobUpload();
  mockApi.startTranslation({ id: 'tr-img' });
  mockApi.translationStatus({ status: 'translating' }, result);
}

/** The object URL the screen shows the Image through (jsdom has none of its own). */
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

async function translateImage(file = fileOf('Cafe_Sign.jpg', 2048, 'image/jpeg'), language = 'English') {
  const user = userEvent.setup();
  await user.upload(fileInput(), file);
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Translate into' }),
    await screen.findByRole('option', { name: language }),
  );
  await user.click(screen.getByRole('button', { name: 'Translate' }));
  await screen.findByRole('heading', { level: 2, name: file.name });
  return user;
}

describe('Image Translation: picking', () => {
  it('accepts JPEG, PNG, BMP, TIFF and HEIF Images at the picker', async () => {
    renderScreen();

    const accept = fileInput().getAttribute('accept')!.split(',');
    expect(accept).toEqual(expect.arrayContaining(['.jpg', '.jpeg', '.png', '.bmp', '.tif', '.tiff', '.heif', '.heic']));
    await screen.findByRole('option', { name: 'French' });
  });

  it('rejects an Image over 20 MB before uploading', async () => {
    renderScreen();
    const user = userEvent.setup();

    await user.upload(fileInput(), fileOf('Huge.png', 20 * 1024 * 1024 + 1));

    expect(await screen.findByText(/This Image is larger than 20 MB/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Translate' })).toBeDisabled();
  });

  it('uploads an Image of exactly 20 MB the same direct way as a Document', async () => {
    renderScreen();
    captureObjectUrls();
    arrangeImage();
    const requests = mockApi.recordRequests();

    await translateImage(fileOf('Big.heic', 20 * 1024 * 1024));

    expect(requests.map((r) => `${r.method} ${r.url.split('?')[0]}`)).toEqual([
      'POST /api/translations/uploads',
      expect.stringMatching(/^PUT https:\/\/fake\.blob\.core\.windows\.net\/source\//),
      'POST /api/translations',
      'GET /api/translations/tr-img',
      'GET /api/translations/tr-img',
    ]);
    const start = requests.find((r) => r.method === 'POST' && r.url === '/api/translations')!;
    expect(JSON.parse(start.body)).toMatchObject({ extension: 'heic', targetLanguage: 'en' });
  });
});

describe('Image Translation: result screen', () => {
  it('shows the Image from browser memory, never downloading it back', async () => {
    renderScreen();
    const { made } = captureObjectUrls();
    arrangeImage();
    const requests = mockApi.recordRequests();
    const file = fileOf('Cafe_Sign.jpg', 2048, 'image/jpeg');

    await translateImage(file);

    const image = screen.getByRole('img', { name: /Cafe_Sign\.jpg/ });
    expect(image).toHaveAttribute('src', 'blob:image/1');
    expect(made).toEqual([file]);
    expect(requests.filter((r) => r.method === 'GET' && r.url.startsWith('https://'))).toEqual([]);
    expect(requests.some((r) => r.url.endsWith('/file'))).toBe(false);
  });

  it('shows one card per paragraph, in reading order, with the translation and the original underneath', async () => {
    renderScreen();
    captureObjectUrls();
    arrangeImage();

    await translateImage();

    const cards = within(screen.getByRole('list', { name: 'Translated text' })).getAllByRole('listitem');
    expect(cards.map((c) => c.textContent)).toEqual(['Dish of the dayPlat du jour', "Onion soup €6Soupe à l'oignon 6 €"]);
    expect(within(cards[0]!).getByText('Dish of the day')).toHaveAttribute('lang', 'en');
    expect(within(cards[0]!).getByText('Plat du jour')).toHaveAttribute('lang', 'fr');
  });

  it('draws every region in an SVG sized to the page in pixels, with no scaling in code', async () => {
    renderScreen();
    captureObjectUrls();
    arrangeImage();

    await translateImage();

    const overlay = document.querySelector('svg[data-overlay]')!;
    expect(overlay).toHaveAttribute('viewBox', '0 0 1024 768');
    expect(overlay).toHaveAttribute('preserveAspectRatio', 'none');
    expect(overlay).toHaveAttribute('aria-hidden', 'true');
    const points = [...overlay.querySelectorAll('polygon')].map((p) => p.getAttribute('points'));
    expect(points).toEqual(['102,88 470,92 469,142 101,138', '96,190 610,196 608,252 95,246']);
  });

  it('heads the result with the file name, detected source → target, Ready and the number of text blocks', async () => {
    renderScreen();
    captureObjectUrls();
    arrangeImage();

    await translateImage();

    const heading = screen.getByRole('heading', { level: 2, name: 'Cafe_Sign.jpg' });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getByText('French (detected) → English')).toBeInTheDocument();
    expect(screen.getByText('2 text blocks')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Ready');
    expect(screen.queryByText(/Handwriting/)).not.toBeInTheDocument();
  });

  it('shows a handwriting chip when some text was handwritten', async () => {
    renderScreen();
    captureObjectUrls();
    arrangeImage({ ...CAFE_SIGN, isHandwritten: true });

    await translateImage();

    expect(screen.getByText('Handwriting detected: check the translation')).toBeInTheDocument();
  });

  it('copies all the translated paragraphs, separated by blank lines', async () => {
    renderScreen();
    captureObjectUrls();
    arrangeImage();
    const user = await translateImage();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();

    await user.click(screen.getByRole('button', { name: 'Copy translated text' }));

    expect(writeText).toHaveBeenCalledWith('Dish of the day\n\nOnion soup €6');
    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });

  it('offers no download for an Image', async () => {
    renderScreen();
    captureObjectUrls();
    arrangeImage();

    await translateImage();

    expect(screen.queryByRole('button', { name: /save|download/i })).not.toBeInTheDocument();
  });

  it('starts again on New Translation, letting go of the Image', async () => {
    renderScreen();
    const { revoked } = captureObjectUrls();
    arrangeImage();
    const user = await translateImage();

    await user.click(screen.getByRole('button', { name: 'New Translation' }));

    expect(screen.queryByRole('img', { name: /Cafe_Sign/ })).not.toBeInTheDocument();
    expect(revoked).toEqual(['blob:image/1']);
    expect(fileInput()).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Translate' })).toBeInTheDocument();
  });
});
