# 01: Verify against real Azure

Spec: [../spec.md](../spec.md) (Further Notes → open risk)

**What to build:** Confirm, against real Azure resources in West Europe, the facts the spec took from documentation alone. This is HITL: it needs a subscription, and the user runs it by hand. Reuse the checklist and batch runner in `../research/azure-spike/`. Save the raw responses in the repo so that [13: Refine error rules and timeouts from real Azure](13-refine-error-rules-and-timeouts.md) can turn them into classifier rules.

**Blocked by:** None (can start immediately)

**Status:** ready-for-human

- [ ] Batch latency (submit → `Succeeded`) recorded for a small docx, the 2-page sample PDF and a large pptx
- [ ] Confirmed that West Europe offers Flex Consumption, Translator batch and Document Intelligence v4.0 (or Sweden Central chosen instead, with the reason)
- [ ] Real status, `error.code`, `innerError.code` and message captured for each of: password-protected docx, xlsx, pptx and PDF; a renamed `.exe` saved as `.docx`; a truncated PDF; a 40×40 PNG; a blank photo
- [ ] A mixed scanned/digital PDF run through batch, with the outcome recorded (confirming it reports no error)
- [ ] `prebuilt-read` run on a chalkboard photo and a handwritten photo, recording whether the text and paragraph regions are usable
- [ ] Image pipeline timing (analyze → translated paragraphs) recorded, to tune the 3-minute timeout
- [ ] Findings summarised in one results file with links to the raw responses; no file contents or real filenames in what is committed
