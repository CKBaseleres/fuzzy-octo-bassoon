# The Image Translation result screen

Type: prototype
Status: resolved
Blocked by: 02
Map: ../map.md

## Question

How should the Image Translation result screen look and behave? The original Image and the extracted, translated text are shown side-by-side, and hovering a text block highlights its region on the Image. Build a rough prototype against the region data the chosen Azure service actually returns, to react to.

Constraint from [How file handling works](05-file-handling.md): the original Image is shown from browser memory (an object URL) and is never fetched back from the server. A refresh abandons the Translation.

## Assets

- Prototype (throwaway, double-click to open): [prototypes/image-result-PROTOTYPE.html](../prototypes/image-result-PROTOTYPE.html). Variants `?variant=A|B|C`, sample Images `?scenario=menu|notice|empty`.

## Answer

**Variant A: Image beside the text cards.** Chosen by the user over B (numbered pins + table) and C (focus inspector).

- **Layout:** two columns. The original Image is on the left and stays in place (sticky) while the page scrolls; on the right is a list with one card per Document Intelligence paragraph, in reading order.
- **Card:** the translation is in large text, with the original text muted underneath. A "Show original" toggle at the top of the list hides the originals, which are shown by default.
- **Linking in both directions:** hovering or focusing a card highlights its polygon on the Image (brand fill and outline) and dims every other region. Hovering a region highlights its card and scrolls it into view. Cards are keyboard-focusable, and focus behaves like hover.
- **Highlights:** an SVG overlay sits on the `<img>` with `viewBox` set to `page.width × page.height` and `preserveAspectRatio="none"`. This means the pixel polygons from `prebuilt-read` are drawn as they are, with no scaling in code. Translations are matched to paragraphs by array index.
- **Header bar:** the file name, "<source> (detected) → English", Ready, the number of text blocks, and a warning chip when `styles[].isHandwritten` is set. The actions are **Copy translated text**, which copies the paragraphs separated by blank lines, and **New Translation**. Images have no download.
- **No text found:** the Image is still shown on the left, and a message on the right takes the place of the list. The wording belongs to the error-handling fog.
- **Rejected:** B's always-on numbered pins clutter dense Images. C's one-block-at-a-time view hides the full text and needs an extra step for every block.

The prototype stays at [prototypes/image-result-PROTOTYPE.html](../prototypes/image-result-PROTOTYPE.html) as the primary source. Open it with `?variant=A`. It could not go on a throwaway branch because the repo is not a git repository yet.

_Amended by [Accessibility and responsive bar](11-accessibility-and-responsive-bar.md): a stacked layout below 768 px with the Image pinned at up to 40% of the screen height, a tap/click selection model alongside hover, a two-layer high-contrast outline, and a region overlay hidden from screen readers._
