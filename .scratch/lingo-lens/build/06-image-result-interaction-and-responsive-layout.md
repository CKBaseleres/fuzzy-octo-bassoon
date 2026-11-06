# 06: Image result interaction and responsive layout

Spec: [../spec.md](../spec.md) (Image result screen; Status, errors and accessibility). Prototype: [../prototypes/image-result-PROTOTYPE.html](../prototypes/image-result-PROTOTYPE.html), opened with `?variant=A`.

**What to build:** On any device and with any input method, a staff member can link text to its place on the Image: hover, focus or tap a card to see its region, or tap a region to find its card. The screen works down to 320 px, and a screen-reader user hears the text cleanly.

**Blocked by:** [05: Image Translation: pipeline and result screen](05-image-translation-pipeline-and-result-screen.md)

**Status:** resolved

- [x] Hovering or focusing a card previews its region (highlighted, with the other regions dimmed)
- [x] A persistent **selected block**: tap, click, Enter or Space on a card selects it; tapping it again or tapping outside clears it
- [x] Hovering or tapping a region highlights or selects its card and scrolls it into view
- [x] Cards are in the Tab order, with no custom shortcuts
- [x] **Show original** at the top of the list hides or shows the originals (shown by default)
- [x] **Highlight:** a two-layer outline (dark outer and white inner, each at least 2 px) with a light fill, keeping 3:1 non-text contrast over any photo
- [x] **Below 768 px:** the layout stacks, with the Image pinned at the top at up to 40% of the screen height and the cards scrolling underneath; it works at 320 CSS px; zoom is never blocked
- [x] **Screen readers:** the overlay is `aria-hidden`; the card list is a list whose items hold the translation and the original; the Image's alt text is "<file name>, N text blocks found"; translations carry `lang="<target>"` and originals `lang="<detected source>"`
- [x] Seam 2 tests cover the selection model, linking in both directions, the toggle, keyboard operation and the accessibility attributes
