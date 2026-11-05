# Error handling: user-facing behaviour

Type: grilling
Status: resolved
Map: ../map.md

## Question

What does Lingo Lens do when a Translation can't go ahead or fails? Decide the **failure categories** and, for each one: what the user sees (message intent, where it appears), whether they can retry (and what a retry re-uses), what happens to any files already in Blob Storage, and what is logged (with no content or filenames, per [How file handling works](05-file-handling.md)).

Candidate categories to confirm, merge or split:

- **Rejected in the browser before upload:** wrong format, over the size limit (Documents ≤ 40 MB, Images ≤ 20 MB), or an empty file.
- **Upload failed:** network drop, SAS expired mid-upload, or a CORS or storage error.
- **Over quota or switched off:** the 429 + `Retry-After` messages and kill switch from [Limits, cost and abuse guardrails](06-limits-and-cost-guardrails.md) are already decided; confirm only how they look on screen.
- **Azure rejected the file:** password-protected or encrypted, corrupt, unsupported despite its extension, or batch `ValidationFailed` / document `Failed`.
- **No text found in an Image:** OCR found nothing, or found text in a language OCR cannot read. The screen state already exists in [The Image Translation result screen](07-image-translation-result-screen.md); decide its wording and whether to suggest anything.
- **Azure busy or down:** 429 or 5xx from Translator or Document Intelligence, or a batch stuck in `NotStarted` too long. Decide whether the backend retries silently, and the client-side timeout.
- **Translation expired:** the 1-hour sweep deleted the files before download, or the tab was left open.
- **Mixed PDF partial output:** already decided as a standing UI note in [PDF support and translation mode](08-pdf-support-and-translation-mode.md); confirm only that it is not treated as an error.

Out of this ticket: which exact Azure status or error codes fall into which category. That waits on real payloads, in [Error handling: mapping Azure errors to categories](13-error-handling-azure-error-mapping.md).

## Answer

Decided with the user on 2026-11-05 (grilling). The user accepted every recommendation.

**How a Translation ends** (added to `GLOSSARY.md`): **Completed**, **Failed**, **Expired** or **Abandoned**. "Ready" is an interface status only: the Translated file can be saved.

**Failure categories.** A mixed PDF with untranslated scanned pages is *not* an error: it is Completed, with the standing note from [PDF support and translation mode](08-pdf-support-and-translation-mode.md).

| # | Category | Shown | Action | Counts towards quota? |
|---|---|---|---|---|
| 1 | **Rejected before upload** (wrong type, too big, empty) | Inline at the file picker; nothing is uploaded | Choose another file | No |
| 2 | **Upload failed** | Status area | **Try again**: re-uploads the same in-memory file with a new SAS and GUID | No (the quota counts at Translation start) |
| 3 | **Refused** (per-IP limit, daily quota, kill switch) | Status area, with the fixed messages from [Limits, cost and abuse guardrails](06-limits-and-cost-guardrails.md) | None; the message gives the wait | No |
| 4 | **Can't translate this file** (Azure rejected it) | Status area; names the reason when known, e.g. "This file is password-protected. Remove the password and try again." | Choose another file | Yes |
| 5 | **No text found** (Images only) | Status area (warning intent); hint: "Try a sharper, straighter photo. Some handwriting and languages can't be read." | Choose another file | Yes |
| 6 | **Service problem** (Azure busy or down, or timed out) | Status area | **Try again**: runs the whole Translation again with the same file | Yes |
| 7 | **Expired** | Status area: "expired, please start again" | **Translate again**: same file and target language | Yes (the original run) |

- **Presentation:** categories 2–7 take the place of the status area with a Fluent `MessageBar` (error intent, or warning for No text found). It shows one sentence and at most one action, and focus moves to it (see [Accessibility and responsive bar](11-accessibility-and-responsive-bar.md)). A retry never needs the file to be picked again: the Source file stays in browser memory while the tab is open.
- **Download failed** (Q9): the Translation stays Ready and shows "Download failed. Try again"; the retry asks for a new 5-minute SAS. Only a successful save triggers the DELETE. If the hour runs out first, the Translation is Expired.
- **Silent retries and timeouts:**
  - The backend retries Azure 429 and 5xx up to 3 times with exponential backoff, within one `/api` request's 45-second budget.
  - The SPA keeps polling through up to 3 failed polls in a row before showing Service problem.
  - Overall timeouts are **15 minutes for a Document and 3 minutes for an Image**, both from the start. On timeout the backend cancels the batch job and the user sees Service problem.
  - The timeouts are app settings, to be checked against the latency measured in [Azure spike: latency, error payloads, OCR quality](09-azure-spike.md).
- **Cleanup on failure:** after any failure after upload, the SPA calls `DELETE /api/translations/{id}` at once on a best-effort basis. The 5-minute timer sweep is the backstop.
- **Reference code:** every error after upload shows "Reference: <first 8 characters of the GUID>". The full GUID is logged with the category, Azure error code, format and size. No filename or content is logged.
- **Handed on to [Error handling: mapping Azure errors to categories](13-error-handling-azure-error-mapping.md):** which Azure codes are categories 4 and 6, the known-reason wording for category 4 beyond password-protected, and how unrecognised errors fall back (probably to category 6).
