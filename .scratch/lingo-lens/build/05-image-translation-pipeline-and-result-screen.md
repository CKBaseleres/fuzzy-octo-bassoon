# 05: Image Translation: pipeline and result screen

Spec: [../spec.md](../spec.md) (Translation pipelines; API contract; Image result screen). Prototype: [../prototypes/image-result-PROTOTYPE.html](../prototypes/image-result-PROTOTYPE.html), opened with `?variant=A`.

**What to build:** On a desktop, a staff member picks an Image and a target language and sees variant A: the original Image (sticky) beside one card per paragraph, each showing the translation with the original text muted underneath, with region outlines drawn on the Image. They can copy all the translated text or start a New Translation. Azure keeps nothing.

**Blocked by:** [04: Document Translation: happy path](04-document-translation-happy-path.md)

**Status:** ready-for-agent

- [x] The picker also accepts Images (JPEG, PNG, BMP, TIFF, HEIF), up to 20 MB, using the same direct upload as Documents
- [ ] `POST /api/translations` for an Image starts a Document Intelligence `prebuilt-read` (v4.0 `2024-11-30`) analyze through a 5-minute read-only SAS URL
- [x] The first poll that sees OCR `succeeded` sends the paragraph texts to Translator text (NMT, auto-detected source). Calls are split to stay within Translator's documented request limits, and results are matched to paragraphs by index. The poll then deletes the Image blob, calls Delete Analyze Result, and returns the page width and height, the paragraphs (polygon, original, translation, detected language) and the handwriting flag.
- [x] The SPA shows the Image from browser memory (an object URL); it is never downloaded back
- [x] **SVG overlay:** `viewBox` set to the page's pixel width × height and `preserveAspectRatio="none"`, so polygons are drawn as returned with no scaling in code
- [x] **Header:** the file name, "<source> (detected) → <target>", Ready, the number of text blocks, and a handwriting chip when `isHandwritten` is set
- [x] **Copy translated text** copies the paragraphs separated by blank lines. **New Translation** resets the screen. There is no download for Images.
- [x] Seam 1 tests cover the Image pipeline end to end (index alignment across split calls, Delete Analyze Result, blob deletion). Seam 2 tests cover rendering the cards, the overlay polygons, the header and both actions.

## Comments

Built on branch `ticket-05` (code only: nothing was deployed or run against Azure).

Left unticked because it can only be confirmed against real Azure (ticket 01):
- **`POST /api/translations` for an Image starts `prebuilt-read` through a 5-minute read-only SAS:** built and tested at Seam 1 (the SAS is `r`, expires 5 minutes after the start). The real adapter (`api/src/azure/imageAdapters.ts`) POSTs `{ urlSource }` to `documentintelligence/documentModels/prebuilt-read:analyze?api-version=2024-11-30&pages=1`. Still to confirm: Document Intelligence can fetch a user delegation SAS URL from our storage account (no storage firewall in the way), and that `heic` uploads are accepted as HEIF.

Also confirm in 01 (the Seam 1 tests pass, but the real adapters are unexercised): Translator text v3 on the custom-domain endpoint (`translator/text/v3.0/translate?api-version=3.0&to=<target>`) with the MI token, the `operation-location` parsing for the analyze result id, Delete Analyze Result answering 204, and the paragraph/page/styles shape of a real `prebuilt-read` result (only page 1 is used, paragraphs keep their first bounding region on that page).

Design notes:
- The Translation id now carries the target language for Images (`t` in the wire format; `TranslationRef.targetLanguage`), because the poll that sees OCR finish is the one that calls Translator.
- The ready Image response also carries a top-level `detectedLanguage` (the most common one across paragraphs) for the header.
- The SPA does not call `DELETE` after an Image result: the ready poll already deleted the Image blob and the analyze result. `DELETE` still handles Images (Delete Analyze Result + blobs) for ticket 09's best-effort cleanup after a failure.
- Zero paragraphs currently comes back as `ready` with an empty list (no Translator call); ticket 10 maps it to No text found.

Notes for later tickets are in the build's conventions note ("Ticket 05").
