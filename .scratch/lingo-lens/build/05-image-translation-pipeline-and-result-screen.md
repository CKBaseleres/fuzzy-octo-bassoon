# 05: Image Translation: pipeline and result screen

Spec: [../spec.md](../spec.md) (Translation pipelines; API contract; Image result screen). Prototype: [../prototypes/image-result-PROTOTYPE.html](../prototypes/image-result-PROTOTYPE.html), opened with `?variant=A`.

**What to build:** On a desktop, a staff member picks an Image and a target language and sees variant A: the original Image (sticky) beside one card per paragraph, each showing the translation with the original text muted underneath, with region outlines drawn on the Image. They can copy all the translated text or start a New Translation. Azure keeps nothing.

**Blocked by:** [04: Document Translation: happy path](04-document-translation-happy-path.md)

**Status:** ready-for-agent

- [ ] The picker also accepts Images (JPEG, PNG, BMP, TIFF, HEIF), up to 20 MB, using the same direct upload as Documents
- [ ] `POST /api/translations` for an Image starts a Document Intelligence `prebuilt-read` (v4.0 `2024-11-30`) analyze through a 5-minute read-only SAS URL
- [ ] The first poll that sees OCR `succeeded` sends the paragraph texts to Translator text (NMT, auto-detected source). Calls are split to stay within Translator's documented request limits, and results are matched to paragraphs by index. The poll then deletes the Image blob, calls Delete Analyze Result, and returns the page width and height, the paragraphs (polygon, original, translation, detected language) and the handwriting flag.
- [ ] The SPA shows the Image from browser memory (an object URL); it is never downloaded back
- [ ] **SVG overlay:** `viewBox` set to the page's pixel width × height and `preserveAspectRatio="none"`, so polygons are drawn as returned with no scaling in code
- [ ] **Header:** the file name, "<source> (detected) → <target>", Ready, the number of text blocks, and a handwriting chip when `isHandwritten` is set
- [ ] **Copy translated text** copies the paragraphs separated by blank lines. **New Translation** resets the screen. There is no download for Images.
- [ ] Seam 1 tests cover the Image pipeline end to end (index alignment across split calls, Delete Analyze Result, blob deletion). Seam 2 tests cover rendering the cards, the overlay polygons, the header and both actions.
