# 10: Failures, part 2: Image errors and No text found

Spec: [../spec.md](../spec.md) (Error classification; Image result screen)

**What to build:** When an Image can't be read, the staff member still sees their Image, with a warning that no text was found and a hint on what to try. A damaged or wrongly sized Image gets a specific reason, and a failure partway through translation fails the whole Image rather than showing partial results.

**Blocked by:** [05: Image Translation: pipeline and result screen](05-image-translation-pipeline-and-result-screen.md), [09: Failures, part 1: Document errors, retries and timeouts](09-failures-document-errors-retries-and-timeouts.md)

**Status:** ready-for-agent

- [ ] Document Intelligence `InvalidContent` or `UnsupportedContent` → 4 `damaged`; `InvalidContentDimensions` → 4 `badDimensions` ("This image is too small or too large to read")
- [ ] OCR `succeeded` but no paragraph contains a letter or digit → 5 No text found. The Image still shows on the left, and a warning `MessageBar` takes the place of the card list: "Try a sharper, straighter photo. Some handwriting and languages can't be read." Action: Choose another file.
- [ ] Translator `400050`/`400077` → 6, logged as our bug; any other Translator 4xx → 6 at error level
- [ ] If any Translator call still fails after retries, the whole Image is Failed (6), with no partial result
- [ ] **Image timeout:** 3 minutes from start (an app setting) → 6
- [ ] Delete Analyze Result and blob deletion still run on every failure path
- [ ] Seam 1 tests cover each new rule and the timeout. Seam 2 tests cover the No text found state and the `badDimensions` and `damaged` messages.
