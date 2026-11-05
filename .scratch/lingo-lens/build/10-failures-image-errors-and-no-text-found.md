# 10: Failures, part 2: Image errors and No text found

Spec: [../spec.md](../spec.md) (Error classification; Image result screen)

**What to build:** When an Image can't be read, the staff member still sees their Image, with a warning that no text was found and a hint on what to try. A damaged or wrongly sized Image gets a specific reason, and a failure partway through translation fails the whole Image rather than showing partial results.

**Blocked by:** [05: Image Translation: pipeline and result screen](05-image-translation-pipeline-and-result-screen.md), [09: Failures, part 1: Document errors, retries and timeouts](09-failures-document-errors-retries-and-timeouts.md)

**Status:** ready-for-agent

- [x] Document Intelligence `InvalidContent` or `UnsupportedContent` → 4 `damaged`; `InvalidContentDimensions` → 4 `badDimensions` ("This image is too small or too large to read")
- [x] OCR `succeeded` but no paragraph contains a letter or digit → 5 No text found. The Image still shows on the left, and a warning `MessageBar` takes the place of the card list: "Try a sharper, straighter photo. Some handwriting and languages can't be read." Action: Choose another file.
- [x] Translator `400050`/`400077` → 6, logged as our bug; any other Translator 4xx → 6 at error level
- [x] If any Translator call still fails after retries, the whole Image is Failed (6), with no partial result
- [x] **Image timeout:** 3 minutes from start (an app setting) → 6
- [x] Delete Analyze Result and blob deletion still run on every failure path
- [x] Seam 1 tests cover each new rule and the timeout. Seam 2 tests cover the No text found state and the `badDimensions` and `damaged` messages.

## Comments

- Built on branch `ticket-10`. All criteria are met against the fakes (Seam 1: `api/src/functions/imageTranslation.failures.test.ts`; Seam 2: `web/src/translation/ImageTranslation.failures.test.tsx`).
- Not verified against real Azure (ticket 13): where Document Intelligence puts `InvalidContent`/`UnsupportedContent`/`InvalidContentDimensions` (top-level `code` or `innererror.code`; the rules match either through `anyCode`), and whether a URL-source analyze reports them on the POST (502 at start) or on the result (failed poll). Both paths are handled. The adapter now reads DI's lower-case `innererror` and turns Translator's numeric codes (`400050`) into strings.
