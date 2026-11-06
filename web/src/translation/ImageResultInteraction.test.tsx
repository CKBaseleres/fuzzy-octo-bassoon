import type { ImageParagraph, TranslationStatusResponse } from '@lingo-lens/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockApi } from '../test/mockApi';
import { renderWithProviders } from '../test/render';
import { TranslationScreen } from './TranslationScreen';

/**
 * Ticket 06: linking the cards and the regions on the Image, both ways, with
 * any input method, plus Show original and the accessibility attributes.
 *
 * The overlay is a visual aid hidden from assistive technology, so the tests
 * read each region's state from its `data-state` ("active", "dimmed" or none).
 */

const PARAGRAPHS: ImageParagraph[] = [
  { polygon: [102, 88, 470, 92, 469, 142, 101, 138], original: 'Plat du jour', translation: 'Dish of the day', detectedLanguage: 'fr' },
  { polygon: [96, 190, 610, 196, 608, 252, 95, 246], original: "Soupe à l'oignon", translation: 'Onion soup', detectedLanguage: 'fr' },
  { polygon: [96, 300, 610, 300, 610, 350, 96, 350], original: 'Tarte Tatin', translation: 'Upside-down apple tart', detectedLanguage: 'fr' },
];

const MENU: TranslationStatusResponse = {
  status: 'ready',
  kind: 'image',
  page: { width: 1024, height: 768 },
  paragraphs: PARAGRAPHS,
  detectedLanguage: 'fr',
  isHandwritten: false,
};

async function showImageResult(result: TranslationStatusResponse = MENU, fileName = 'Menu.jpg') {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:image/1');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  const scrolled: Element[] = [];
  Element.prototype.scrollIntoView = vi.fn(function (this: Element) {
    scrolled.push(this);
  });
  mockApi.languages([
    { code: 'en', name: 'English' },
    { code: 'fr', name: 'French' },
  ]);
  mockApi.createUpload();
  mockApi.blobUpload();
  mockApi.startTranslation({ id: 'tr-img' });
  mockApi.translationStatus(result);
  renderWithProviders(<TranslationScreen pollIntervalMs={1} />);

  const user = userEvent.setup();
  await user.upload(screen.getByLabelText('File to translate'), new File(['x'], fileName, { type: 'image/jpeg' }));
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Translate into' }),
    await screen.findByRole('option', { name: 'English' }),
  );
  await user.click(screen.getByRole('button', { name: 'Translate' }));
  await screen.findByRole('heading', { level: 2, name: fileName });
  return { user, scrolled };
}

const cards = () => within(screen.getByRole('list', { name: 'Translated text' })).getAllByRole('listitem');
const card = (i: number) => cards()[i]!;
const regions = () => [...document.querySelectorAll('svg[data-overlay] polygon')];
const region = (i: number) => regions()[i]!;
const regionStates = () => regions().map((r) => r.getAttribute('data-state'));

describe('Image result: previewing a region from its card', () => {
  it('highlights the hovered card’s region and dims the others, until the pointer leaves', async () => {
    const { user } = await showImageResult();
    expect(regionStates()).toEqual([null, null, null]);

    await user.hover(card(1));
    expect(regionStates()).toEqual(['dimmed', 'active', 'dimmed']);

    await user.unhover(card(1));
    expect(regionStates()).toEqual([null, null, null]);
  });
});

describe('Image result: keyboard', () => {
  it('puts every card in the Tab order after Show original, and focus previews like hover', async () => {
    const { user } = await showImageResult();
    screen.getByRole('switch', { name: 'Show original' }).focus();

    await user.tab();
    expect(card(0)).toHaveFocus();
    expect(regionStates()).toEqual(['active', 'dimmed', 'dimmed']);

    await user.tab();
    expect(card(1)).toHaveFocus();
    expect(regionStates()).toEqual(['dimmed', 'active', 'dimmed']);

    await user.tab({ shift: true });
    await user.tab({ shift: true });
    expect(screen.getByRole('switch', { name: 'Show original' })).toHaveFocus();
    expect(regionStates()).toEqual([null, null, null]);
  });
});

describe('Image result: the selected block', () => {
  it('selects a card on click, keeps its region highlighted after the pointer leaves, and clears it on a second click', async () => {
    const { user } = await showImageResult();

    await user.click(card(2));
    await user.unhover(card(2));
    expect(card(2)).toHaveAttribute('aria-current', 'true');
    expect(regionStates()).toEqual(['dimmed', 'dimmed', 'active']);

    await user.click(card(2));
    await user.unhover(card(2));
    expect(card(2)).not.toHaveAttribute('aria-current');
    expect(regionStates()).toEqual([null, null, null]);
  });

  it('moves the selection to another card, which a hover previews over without losing it', async () => {
    const { user } = await showImageResult();
    await user.click(card(0));

    await user.hover(card(1));
    expect(regionStates()).toEqual(['dimmed', 'active', 'dimmed']);
    await user.unhover(card(1));
    expect(regionStates()).toEqual(['active', 'dimmed', 'dimmed']);

    await user.click(card(1));
    expect(cards().map((c) => c.getAttribute('aria-current'))).toEqual([null, 'true', null]);
  });

  it('clears the selection on a click outside the cards and the Image', async () => {
    const { user } = await showImageResult();
    await user.click(card(1));

    await user.click(screen.getByRole('heading', { level: 2, name: 'Menu.jpg' }));

    expect(card(1)).not.toHaveAttribute('aria-current');
    expect(regionStates()).toEqual([null, null, null]);
  });

  it('selects and clears with Enter and Space on a focused card', async () => {
    const { user } = await showImageResult();
    card(1).focus();

    await user.keyboard('{Enter}');
    expect(card(1)).toHaveAttribute('aria-current', 'true');
    await user.keyboard(' ');
    expect(card(1)).not.toHaveAttribute('aria-current');
    await user.keyboard(' ');
    expect(card(1)).toHaveAttribute('aria-current', 'true');

    await user.tab({ shift: true });
    expect(card(0)).toHaveFocus();
    expect(card(1)).toHaveAttribute('aria-current', 'true');
    expect(regionStates()).toEqual(['active', 'dimmed', 'dimmed']);
  });

  it('on a touch screen, a second tap on the selected card clears its highlight', async () => {
    const { user } = await showImageResult();
    const tap = (target: Element) => user.pointer([{ keys: '[TouchA]', target }]);

    await tap(card(1));
    expect(card(1)).toHaveAttribute('aria-current', 'true');
    expect(regionStates()).toEqual(['dimmed', 'active', 'dimmed']);

    await tap(card(1));
    expect(card(1)).not.toHaveAttribute('aria-current');
    expect(regionStates()).toEqual([null, null, null]);
  });
});

describe('Image result: finding a card from its region', () => {
  it('highlights the hovered region’s card and scrolls it into view', async () => {
    const { user, scrolled } = await showImageResult();

    await user.hover(region(2));

    expect(card(2)).toHaveAttribute('data-state', 'active');
    expect(regionStates()).toEqual(['dimmed', 'dimmed', 'active']);
    expect(scrolled).toEqual([card(2)]);

    await user.unhover(region(2));
    expect(card(2)).not.toHaveAttribute('data-state');
  });

  it('selects the tapped region’s card and scrolls to it', async () => {
    const { user, scrolled } = await showImageResult();

    await user.pointer([{ keys: '[TouchA]', target: region(1) }]);

    expect(card(1)).toHaveAttribute('aria-current', 'true');
    expect(regionStates()).toEqual(['dimmed', 'active', 'dimmed']);
    expect(scrolled).toEqual([card(1)]);
  });
});

describe('Image result: Show original', () => {
  it('shows the originals by default and hides or shows them from the switch at the top of the list', async () => {
    const { user } = await showImageResult();
    const toggle = screen.getByRole('switch', { name: 'Show original' });
    expect(toggle).toBeChecked();
    expect(card(0)).toHaveTextContent('Dish of the dayPlat du jour');

    await user.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(cards().map((c) => c.textContent)).toEqual(['Dish of the day', 'Onion soup', 'Upside-down apple tart']);

    await user.click(toggle);
    expect(card(0)).toHaveTextContent('Dish of the dayPlat du jour');
  });
});

describe('Image result: screen readers', () => {
  it('describes the Image by file name and block count and hides the overlay', async () => {
    await showImageResult(MENU, 'Notice board.png');

    expect(screen.getByRole('img', { name: 'Notice board.png, 3 text blocks found' })).toBeInTheDocument();
    expect(document.querySelector('svg[data-overlay]')).toHaveAttribute('aria-hidden', 'true');
  });

  it('says "1 text block" for a single block', async () => {
    await showImageResult({ ...MENU, paragraphs: PARAGRAPHS.slice(0, 1) });

    expect(screen.getByRole('img', { name: 'Menu.jpg, 1 text block found' })).toBeInTheDocument();
  });

  it('lists each block as an item holding the translation in the target language and the original in its detected language', async () => {
    await showImageResult({
      ...MENU,
      paragraphs: [
        { polygon: [0, 0, 1, 0, 1, 1, 0, 1], original: 'Ausgang', translation: 'Exit', detectedLanguage: 'de' },
        { polygon: [0, 2, 1, 2, 1, 3, 0, 3], original: 'Sortie', translation: 'Way out' },
      ],
    });

    expect(cards()).toHaveLength(2);
    expect(within(card(0)).getByText('Exit')).toHaveAttribute('lang', 'en');
    expect(within(card(0)).getByText('Ausgang')).toHaveAttribute('lang', 'de');
    expect(within(card(1)).getByText('Sortie')).toHaveAttribute('lang', 'fr');
  });
});
