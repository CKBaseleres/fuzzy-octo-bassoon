# Spec: Lingo Lens MVP

Status: ready-for-agent
Map: [map.md](map.md)

Domain vocabulary follows `GLOSSARY.md`: **Source file**, **Document**, **Image**, **Translation**, **Translated file**, and the ways a Translation ends: **Completed**, **Failed**, **Expired**, **Abandoned**. Every decision below comes from a resolved ticket on the map. Each section links to its ticket, which holds the full reasoning.

## Problem Statement

Staff often get files in a language they can't read: contracts, reports, spreadsheets, slide decks, and photos of notices, whiteboards or signs. They want to read them in their own language without retyping anything, without losing the layout of a Document, and without sending the file to an unvetted public translation site. Today there's no approved tool. People either do without, or paste content into consumer services the organisation has no control over.

## Solution

Lingo Lens is a web app. A person picks one Source file and one target language, and gets one of two results:

- **For a Document** (any format Azure Document Translation's batch API supports, including PDF), a Translated file in the same format with its layout kept. It is saved straight to their device; there is no in-browser preview.
- **For an Image**, a result screen with the original Image beside the extracted text, one card per paragraph. Each card shows the translation, with the original text available. Hovering, focusing or tapping a card highlights where that text sits on the Image, and the reverse works too.

The source language is detected automatically, and every Translator language can be a target. Status is shown simply (uploading → translating → ready). Nothing is kept: files are deleted as soon as the Translated file is saved, or after one hour at most. Lingo Lens needs no sign-in. It is publicly reachable, bounded by quotas and spend controls. It runs entirely on Azure AI services, using keyless managed identities.

## User Stories

### Choosing a file and language

1. As a staff member, I want to drop or pick a single file, so that I can start a Translation with as little effort as possible.
2. As a staff member on a phone, I want the file picker to offer "Take photo", so that I can translate a sign or notice in front of me without a separate camera app.
3. As a staff member, I want to choose any target language Translator supports, so that I can read the file in my own language.
4. As a staff member, I want the source language detected automatically, so that I don't need to know what language the file is in.
5. As a staff member, I want the upload area to say "Documents up to 40 MB · Images up to 20 MB", so that I know the limits before I try.
6. As a staff member, I want a file of the wrong type to be rejected at once at the picker, so that I don't wait for an upload that will fail.
7. As a staff member, I want an over-sized or empty file rejected at the picker, so that I understand the problem straight away.
8. As a staff member, I want a password-protected or encrypted Office file or PDF to be rejected at the picker with "This file is password-protected or encrypted. Remove the protection and try again.", so that I know exactly what to fix.
9. As a staff member, I want an Image that is smaller than 50 px or larger than 10,000 px on a side rejected at the picker, so that I don't use up quota on an Image that can't be read.
10. As a staff member uploading a PDF, I want a standing note that scanned pages in mixed PDFs may stay untranslated, so that partial output doesn't surprise me.
11. As a staff member, I want rejections before upload not to count towards any quota, so that a mistake costs me nothing.

### Translating

12. As a staff member, I want to see the status move through uploading → translating → ready, so that I know Lingo Lens is working.
13. As a screen-reader user, I want each status change announced politely, so that I can follow progress without hunting for it.
14. As a staff member, I want only one Translation at a time in a tab, so that the screen stays simple and unambiguous.
15. As a staff member, I want the file to upload straight to storage, so that large Documents aren't cut off by a short request limit.
16. As a staff member, I want my file's name never to leave my browser, so that nothing personal in the name is stored or logged.

### Document results

17. As a staff member, I want the Translated file saved to my device when it's ready, so that I can open it in its own application with the layout kept.
18. As a staff member, I want the saved file named after the original with the target language added (for example `Report.fr.pdf`), so that I can tell the two apart.
19. As a staff member, I want to save the Translated file again while the page is still open, so that I don't lose it if the first save went wrong.
20. As a staff member, I want "Download failed. Try again" to keep my Translation ready rather than end it, so that a network blip doesn't waste the Translation.
21. As a staff member, I want a scanned PDF to be translated, so that paper documents that were scanned still work.

### Image results

22. As a staff member, I want the original Image beside a list of translated paragraph cards, so that I can read the translation in context.
23. As a staff member, I want each card to show the translation large, with the original text muted underneath, so that I can compare them.
24. As a staff member, I want a "Show original" toggle, so that I can hide the originals when I only want the translation.
25. As a staff member on a desktop, I want hovering a card to highlight its region on the Image and dim the others, so that I can see where the text came from.
26. As a staff member, I want hovering or tapping a region on the Image to highlight its card and scroll to it, so that I can go from the picture to the text.
27. As a staff member on a touch screen, I want tapping a card to select it and keep its region highlighted until I tap again or tap elsewhere, so that touch works without hover.
28. As a keyboard user, I want the cards in the Tab order, with focus previewing like hover and Enter/Space selecting, so that I can use the screen without a mouse.
29. As a staff member, I want the highlight to stay visible over any photo, dark or light, so that I can always see which region is selected.
30. As a staff member on a narrow screen, I want the Image pinned at the top (up to 40% of the screen height) with the cards scrolling underneath, so that the layout works on a phone.
31. As a staff member, I want the header to show the file name, the detected source language → target language, the number of text blocks, and a chip when handwriting was found, so that I can judge how reliable the result is.
32. As a staff member, I want a "Copy translated text" action that copies all the paragraphs separated by blank lines, so that I can paste the translation elsewhere.
33. As a staff member, I want a "New Translation" action, so that I can start again quickly.
34. As a staff member, I want "No text found" shown beside my Image with the hint "Try a sharper, straighter photo. Some handwriting and languages can't be read.", so that I know what to try next.
35. As a screen-reader user, I want the card list to be the accessible content, with the region overlay hidden from assistive technology, so that I hear the text and not a pile of shapes.
36. As a screen-reader user, I want the Image's alt text to say the file name and the number of text blocks found, so that I know what the picture is.
37. As a screen-reader user, I want translations and originals marked with their language, so that my screen reader pronounces each one correctly.

### When things go wrong

38. As a staff member, I want any failure after upload to replace the status area with one clear message and at most one action, so that I'm never left guessing.
39. As a keyboard or screen-reader user, I want focus to move to the error message when something fails, and to the result heading when it's ready, so that I land where the news is.
40. As a staff member whose upload failed, I want "Try again" to re-upload the same file without picking it again, so that I recover in one click.
41. As a staff member, I want the hourly limit message to tell me how many minutes to wait, so that I know when I can try again.
42. As a staff member, I want "Lingo Lens has reached today's limit. Try again tomorrow." when the daily quota is used or the service is switched off, so that I understand it isn't my fault.
43. As a staff member, I want "Lingo Lens is busy, try again in a minute." when Azure throttles, so that I know a short wait will fix it.
44. As a staff member whose file Azure couldn't translate, I want the reason named when it's known (password-protected, damaged, or Image dimensions), so that I can fix the file.
45. As a staff member whose file failed for an unknown reason, I want "Lingo Lens couldn't translate this file. It may be damaged, protected, or not the format its name suggests. Check it opens normally and try another file.", so that I have something to try.
46. As a staff member hit by a service problem, I want "Try again" to run the whole Translation again with the same file and language, so that I don't have to start over.
47. As a staff member who left the page open too long, I want "expired, please start again" with a "Translate again" action using the same file and language, so that I can get the result quickly.
48. As a staff member, I want each error after upload to show a short reference code, so that support can find what happened in the logs.
49. As a staff member, I want brief Azure hiccups retried silently, so that I only see an error when something is really wrong.

### Privacy and data handling

50. As a staff member, I want my Source file and Translated file deleted as soon as I've saved the result, so that no copy of my document lingers.
51. As a staff member, I want anything I leave behind deleted within about an hour, so that refreshing or walking away doesn't leave my data stored.
52. As a staff member, I want my Image and its OCR results purged from Document Intelligence as soon as they've been read, so that Azure doesn't keep them for 24 hours.
53. As a staff member, I want files deleted at once when a Translation fails, so that failed files don't linger either.
54. As a staff member, I want logs never to record file contents, filenames, extracted text or translations, so that diagnostics can't leak what I translated.
55. As a staff member, I want refreshing or closing the tab to abandon the Translation rather than resume it, so that nothing is held in my browser either.

### Operator and owner

56. As the service owner, I want a global daily quota (300 in prod, 50 in dev) and a per-IP hourly limit (20 in prod, 10 in dev), so that a public URL can't run up unbounded cost.
57. As the service owner, I want quota refusals returned as 429 with `Retry-After`, so that the SPA can show an accurate wait.
58. As the service owner, I want failed Translations to count towards quota, so that repeated bad files can't be used to bypass the limits.
59. As the service owner, I want a kill switch that refuses new Translations without a redeploy, so that I can stop spending in an emergency.
60. As the service owner, I want Budget alerts at 50%, 80% and 100% of actual spend and 100% of forecast ($100 prod, $25 dev), so that cost surprises reach me early.
61. As the service owner, I want the Function App capped at 10 instances, so that a burst can't scale cost without limit.
62. As the service owner, I want the backend to check the uploaded file's real size before translating, so that a tampered upload can't get past the size limit.
63. As the service owner, I want the backend reachable only through the Static Web App proxy, so that the API can't be called around the front end.
64. As the service owner, I want no keys or stored secrets anywhere (managed identities and OIDC only), so that there is nothing to leak or rotate.
65. As the service owner, I want the site kept out of search engines, so that the public URL isn't easy to stumble on.
66. As an operator, I want every error log to carry the Translation GUID, category, rule id, service, HTTP status, Azure error codes, job and document status, Azure's request id and a `mapped` flag, so that I can trace any reference code to its cause.
67. As an operator, I want a saved query listing unmapped Azure errors from the last 7 days, so that I can refine the error mapping from real traffic.
68. As a developer, I want the Azure-error-to-category mapping to be one table with a test for each rule, so that a refinement is a one-line change plus a test.
69. As a developer, I want a merge to `main` to deploy to dev automatically and the same build to go to prod after approval, so that what reaches prod is exactly what was tested.
70. As a developer, I want every pull request to lint, typecheck, test, build, run axe and preview the Bicep changes against dev, so that mistakes are caught before merge.
71. As a developer, I want all infrastructure in Bicep (dev and prod parameter files) with a one-off bootstrap for the deploy identities, so that environments are reproducible.

## Implementation Decisions

### Platform and hosting
_[Backend and hosting architecture](issues/04-backend-and-hosting-architecture.md), [Deployment and CI](issues/10-deployment-and-ci.md)_

- **Azure Static Web Apps (Standard)** serves the React SPA. A **linked Azure Functions app (Flex Consumption, TypeScript on Node, Functions v4 programming model)** serves `/api`. Linking adds the "Azure Static Web Apps (Linked)" identity provider, so the API accepts only requests proxied through SWA. There is no app-level API key.
- **Front end:** React with Fluent UI React v9.
- **One region:** West Europe for every resource, with Sweden Central as the fallback. Two environments, dev and prod, each a separate resource group in one subscription with a full, unshared set of resources. SWA preview environments are off. Prod uses a custom domain; dev uses the default SWA hostname.
- **One repo with npm workspaces:** `web` (the SPA), `api` (the Function App), `shared` (request and response types used by both) and `infra` (Bicep).
- **Keyless:**
  - The Function App's system-assigned managed identity gets Cognitive Services User on Translator and Document Intelligence, and Storage Blob Data Contributor on the storage account.
  - Translator's own system-assigned managed identity gets Storage Blob Data Contributor, so batch requests use plain container URLs.
  - Storage account key access is disabled, and there is no Key Vault.
- **Resources:** a single-service Translator (S1, custom-domain endpoint), Document Intelligence, one storage account (blobs plus a quota Table), Application Insights and a Budget.

### Translation pipelines
_[Azure Document Translation: sync vs async API](issues/01-azure-document-translation-api.md), [PDF support and translation mode](issues/08-pdf-support-and-translation-mode.md), [Azure options for Image Translation](issues/02-azure-image-translation-options.md)_

- **Documents:** every Document goes through the **batch Document Translation API** (GA `2026-03-01`, standard NMT). Accepted formats are pdf, doc/docx, xls/xlsx, ppt/pptx, odt/ods/odp, rtf, md, html/htm, mhtml/mht, msg, txt, csv, tsv/tab and xlf. `translateTextWithinImage` is off. LLM and preview features are not used. Hybrid sync+batch is the documented fallback if batch latency proves poor.
- **Images:**
  - **Document Intelligence `prebuilt-read` (v4.0 `2024-11-30`)** reads the Image through a 5-minute read-only SAS URL.
  - Each paragraph's text is then sent to **Translator text** (NMT, source auto-detected) as one array element. Translations are matched to paragraphs and polygons by array index.
  - The backend splits Translator calls to stay within the documented request limits.
  - Accepted Image formats are JPEG, PNG, BMP, TIFF and HEIF.

### API contract (shared types)
_[Backend and hosting architecture](issues/04-backend-and-hosting-architecture.md), [How file handling works](issues/05-file-handling.md)_

The backend is **stateless** (apart from the quota counters). The Translation id the SPA holds is an opaque token combining our GUID and Azure's operation id.

| Endpoint | Purpose |
|---|---|
| `POST /api/translations/uploads` | Checks quotas and the kill switch, then returns a GUID plus a **user delegation SAS** for one blob (write-only, 10-minute expiry). |
| `POST /api/translations` | Checks the uploaded blob's real size (and deletes it if oversized), counts the Translation towards quota, and starts the batch job (Document) or the `prebuilt-read` analyze (Image). Returns the Translation id. |
| `GET /api/translations/{id}` | Polls Azure and maps the result to `translating`, `ready` or `failed` (with `category` and an optional `reason`). For an Image, the first poll that sees OCR `succeeded` runs Translator text, deletes the Image blob, calls **Delete Analyze Result**, and returns the page width and height, plus the paragraphs (polygon, original text, translation, detected language) and the handwriting flag. The first poll that sees a batch job in a terminal state deletes the Source file blob. |
| `GET /api/translations/{id}/file` | Returns a read-only SAS (5-minute expiry) for the Translated file. |
| `DELETE /api/translations/{id}` | Removes every blob for the Translation. Cancels a running job. |

- Each `/api` request stays within SWA's 45-second limit. The backend retries Azure 429/5xx up to 3 times with exponential backoff inside that budget.
- Blobs are named by GUID only (source and target paths keep the extension so Translator can detect the format). Filenames never leave the browser; the SPA builds the download name itself.

### Error classification
_[Error handling: user-facing behaviour](issues/12-error-handling-user-facing-behaviour.md), [Error handling: mapping Azure errors to categories](issues/13-error-handling-azure-error-mapping.md)_

- **Seven failure categories:**
  1. Rejected before upload
  2. Upload failed
  3. Refused
  4. Can't translate
  5. No text found
  6. Service problem
  7. Expired

  A mixed PDF with untranslated scanned pages is **Completed**, not an error.
- **The classifier:** one pure, table-driven module in the backend. Its input is `(service, httpStatus, error.code, innerError.code, job/document status)` and its output is `{ category, reason?, ruleId }`. The API returns only `category` and `reason` (`passwordProtected`, `damaged` or `badDimensions`), and the SPA owns all the wording.
- **Rules:**
  - Batch document `Failed` with `InvalidRequest` or `InvalidArgument` → 4.
  - Batch document `Failed` with `ServiceUnavailable`, `InternalServerError` or `RequestRateTooHigh` → 6 (no automatic resubmit).
  - `Unauthorized`, `ResourceNotFound`, and submit `400`/`401`/`403`/`404` → 6, logged at error level as our fault.
  - Job `ValidationFailed` → the document's error if there is one, otherwise 6.
  - An unexpected `Cancelled` → 6. `Succeeded` with 0 characters charged → Completed.
  - Document Intelligence `InvalidContent` or `UnsupportedContent` → 4 `damaged`. `InvalidContentDimensions` → 4 `badDimensions`.
  - OCR `succeeded` but no paragraph contains a letter or digit → 5.
  - Translator `400050`/`400077` → 6 (our bug). Any other Translator 4xx → 6, error level.
  - 429/5xx from any service after retries → 6.
  - If any part of an Image's Translator calls fails, the whole Image fails (6). There are no partial results.
- **Fallback:** anything unmatched → 6, except a document `Failed` with top-level `InvalidRequest`/`InvalidArgument` and an unknown inner code → 4 generic.
- **Timeouts:** 15 minutes for a Document and 3 minutes for an Image, both from the start, held as app settings. On timeout the backend cancels the job, and the user sees 6. The SPA tolerates 3 failed polls in a row before showing 6.
- **Cleanup on failure:** after any failure after upload, the SPA calls `DELETE` at once on a best-effort basis. The timer sweep is the backstop.

### Files and retention
_[How file handling works](issues/05-file-handling.md)_

- The browser uploads straight to Blob Storage. The storage account's CORS rule allows only its own environment's origin.
- **Download:** the SPA fetches the Translated file through the 5-minute SAS into memory, saves it via an object URL, and only after a successful save calls `DELETE`. It can save again from memory while the page stays open.
- **The hour runs from upload.** A timer-triggered Function runs **every 5 minutes**. It deletes blobs older than 60 minutes and cancels their running jobs. A 1-day Blob lifecycle rule is the backstop. Soft delete, versioning and point-in-time restore are off.
- **Refresh or close:** the Translation is Abandoned, with no resume. Images are shown from browser memory.
- **Logs** record only GUIDs, format, size, languages, durations and error codes. Azure's error `message` is logged truncated to 300 characters, with SAS parameters scrubbed.

### Limits and guardrails
_[Limits, cost and abuse guardrails](issues/06-limits-and-cost-guardrails.md)_

- **Public reach:** no IP allow-list (it can be added later in SWA config) and no WAF or CAPTCHA.
- **Size limits:** Documents ≤ 40 MB and Images ≤ 20 MB, checked in the browser and again on the blob. There is no page or character cap.
- **Quotas** are held as counters in **Table Storage**, which stores counts only:
  - a global daily quota per UTC day
  - a per-IP hourly limit, using the client IP from `X-Forwarded-For`

  Failed Translations count; rejections before upload and upload failures do not, because counting happens at Translation start.
- **Kill switch:** the `TRANSLATIONS_ENABLED` app setting. It is a Bicep parameter, flipped in the portal in an emergency and then committed.
- **Instances:** Flex Consumption max 10.
- **Search engines:** `X-Robots-Tag: noindex` and a `robots.txt` that disallows everything.

### Browser checks (category 1)
_[Error handling: mapping Azure errors to categories](issues/13-error-handling-azure-error-mapping.md)_

- The type is on the accepted list, the size is within its limit, and the file isn't empty.
- **OOXML encryption:** a `.docx`, `.xlsx` or `.pptx` whose first bytes are the OLE signature `D0 CF 11 E0` rather than a ZIP's `PK` is rejected as password-protected.
- **PDF encryption:** `/Encrypt` found in the last ~64 KB is rejected as password-protected.
- **Image dimensions:** an Image must be 50–10,000 px on each side.

### Image result screen
_[The Image Translation result screen](issues/07-image-translation-result-screen.md), [Accessibility and responsive bar](issues/11-accessibility-and-responsive-bar.md); the prototype is at [prototypes/image-result-PROTOTYPE.html](prototypes/image-result-PROTOTYPE.html), opened with `?variant=A`_

- **Layout:** two columns. The original Image is sticky; the paragraph cards are in reading order. Below 768 px the layout stacks, with the Image pinned at up to 40% of the screen height.
- **Highlights:** an SVG overlay on the `<img>` with its `viewBox` set to the page's pixel width × height and `preserveAspectRatio="none"`, so the `prebuilt-read` polygons are drawn without scaling in code. The highlight is a two-layer outline (dark outer and white inner, each at least 2 px) with a light fill, and the other regions are dimmed. The overlay is `aria-hidden`.
- **Interaction:** hover and focus preview. A persistent **selected block** is set by tap, click, Enter or Space and cleared by tapping again or tapping outside. Linking works in both directions, with the card scrolled into view when its region is chosen.
- **Header:** the file name, "<source> (detected) → <target>", Ready, the number of text blocks, and a handwriting chip when `isHandwritten` is set. Actions: Copy translated text and New Translation. Images have no download.
- **No text found:** a warning `MessageBar` takes the place of the card list, with the Image still shown.

### Status, errors and accessibility
_[Error handling: user-facing behaviour](issues/12-error-handling-user-facing-behaviour.md), [Accessibility and responsive bar](issues/11-accessibility-and-responsive-bar.md)_

- **Accessibility bar:** WCAG 2.2 AA, layouts down to 320 CSS px, and current evergreen browsers including iOS Safari and Android Chrome. Zoom is never blocked. The interface is English only, with `lang` set on translations and originals.
- **Status:** shown in a polite live region. Focus moves to the result heading on ready, and to the error message on failure.
- **Error presentation:** categories 2–7 replace the status area with a Fluent `MessageBar` (error intent, or warning for No text found). It shows one sentence and at most one action, plus "Reference: <first 8 characters of the GUID>". The Source file stays in memory so a retry never needs the file picked again.

### Infrastructure and CI
_[Deployment and CI](issues/10-deployment-and-ci.md)_

- **Bicep:** one main template with dev and prod parameter files. It owns the CORS rule, the lifecycle rule, the retention settings, the quota Table, the app settings (quotas, timeouts, kill switch), the instance cap, the role assignments, Application Insights and the Budget.
- **Bootstrap:** a one-off template at subscription scope, run once by an admin, creates the resource groups, the per-environment user-assigned deploy identities, their federated credentials (scoped to GitHub Environments) and their role assignments. The deploy identities have Contributor plus a conditioned RBAC Administrator role that can assign only Cognitive Services User and Storage Blob Data Contributor.
- **GitHub Actions with OIDC, no stored secrets:**
  - a PR workflow: lint, typecheck, unit tests, build, axe, and Bicep what-if against dev
  - an infra workflow: Bicep deploy on infra changes
  - an app workflow: builds once, deploys to dev on merge to `main`, then promotes the same artifacts to prod through the `prod` GitHub Environment with a required reviewer

  The SWA deployment token is fetched during the run.
- **Inputs to fill in before the first prod deploy:** the Budget alert recipients, the prod approvers and the prod custom domain.

## Testing Decisions

- **What a good test is:** it exercises external behaviour through a public seam and asserts on what a caller or user observes: HTTP responses and side effects on faked Azure for the backend, and rendered output, focus, announcements and network calls for the SPA. Tests never assert on internal functions, private state or call order. A refactor that keeps behaviour unchanged must not break a test.
- **Seam 1: the `/api` contract.**
  - Backend tests call the Function handlers with HTTP requests and assert on responses typed by the shared contract.
  - All Azure dependencies (Translator batch, Document Intelligence, Translator text, Blob, Table counters) sit behind **one Azure services port**, replaced in tests by an in-memory fake that can be scripted with statuses and error payloads. A **clock** is injected.
  - This seam covers:
    - quotas, the kill switch and `Retry-After`
    - the blob size check
    - status mapping during polling
    - the Image pipeline (OCR → split Translator calls → index alignment → Delete Analyze Result → blob deletion)
    - early Source file deletion
    - `DELETE`
    - the 5-minute timer sweep and job cancellation
    - timeouts
    - **every error-classifier rule**: the fake returns the Azure error and the poll is asserted to report the expected category, reason and `ruleId`
    - the structured log fields, including `mapped` and the absence of filenames and content
- **Seam 2: the SPA against the same contract.**
  - Component and flow tests use React Testing Library, with the API faked at the network boundary (MSW) using the shared types.
  - This seam covers:
    - the browser checks (type, size, empty, OOXML and PDF encryption sniffing, Image dimensions)
    - status and live-region announcements
    - focus moves
    - each category's `MessageBar`, action and reference code
    - retry re-using the in-memory file
    - the download → save → `DELETE` sequence and "Download failed. Try again"
    - the Image result screen (selection model, linking in both directions, Show original, Copy translated text, the handwriting chip, the no-text state, the stacked layout)
    - axe checks
- **Not a test seam:** real Azure is exercised by hand in the **Verify against real Azure** build ticket (see Further Notes), not in CI.
- **Prior art:** none. The repo has no code yet, so these seams set the pattern for every later ticket.

## Out of Scope

- Sign-in and access control (Entra ID tenant, guests, groups, roles). This is a later effort; see [Who can sign in](issues/03-who-can-sign-in.md).
- Comparing Azure with other vendors.
- Painting translated text back onto Images, and Document Translation's repainted-image output.
- Translating text inside images embedded in Documents (`translateTextWithinImage`).
- Detecting untranslated scanned pages in mixed PDFs (covered by a UI note instead).
- In-browser preview of Translated files, and side-by-side Document view with synced scroll.
- Translating several Source files at once, or into several target languages at once.
- Translation history, accounts, or resuming after a refresh.
- A "layout preserved %" score or layout map.
- Localising Lingo Lens's own interface (it is English only).
- A "behind the scenes" pipeline panel.
- An IP allow-list, WAF, CAPTCHA or private networking (an allow-list can be added later in config).
- LLM translation and any Azure preview features.
- SWA pull-request preview environments.
- A formal external accessibility audit.

## Further Notes

- **Open risk: Verify against real Azure.** This must be the first build ticket. The planning spike was skipped ([Azure spike: latency, error payloads, OCR quality](issues/09-azure-spike.md)), so these facts are taken from documentation and need confirming against real resources. The checklist and batch runner in `research/azure-spike/` can be reused.
  - **Batch latency** for a small docx, the sample PDF and a large pptx. If it is poor, switch to the hybrid sync+batch fallback.
  - **Region:** West Europe offers Flex Consumption and Translator batch. Otherwise use Sweden Central.
  - **Real error payloads.** Submit a password-protected docx, xlsx, pptx and PDF, a renamed `.exe` saved as `.docx`, a truncated PDF, a 40×40 PNG and a blank photo. Add classifier rules for the real codes. Drop the browser encryption checks if Azure reports these files clearly.
  - **OCR quality** on chalkboard and handwritten photos (an accepted risk; No text found covers bad reads).
  - **Tune the timeouts** (15 minutes for a Document, 3 minutes for an Image) from the measured latency.
  - Link the "Unmapped Azure errors (7 days)" saved query from this ticket.
- **Before the first prod deploy:** fill in the Budget alert recipients, the prod approvers and the prod custom domain. Do a manual keyboard and screen-reader pass (NVDA + Edge, VoiceOver + Safari).
- **The repo isn't a git repository yet.** The CI and OIDC setup assumes a GitHub repo, so creating it is part of the bootstrap.
- **Research:** [research/azure-document-translation.md](research/azure-document-translation.md) and [research/azure-image-translation.md](research/azure-image-translation.md) hold the source citations behind the pipeline decisions.
