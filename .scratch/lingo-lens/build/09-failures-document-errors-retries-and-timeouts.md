# 09: Failures, part 1: Document errors, retries and timeouts

Spec: [../spec.md](../spec.md) (Error classification; Status, errors and accessibility)

**What to build:** When a Document Translation goes wrong, the staff member sees one clear message with at most one action and a reference code, and can recover without picking the file again. Brief Azure hiccups are retried silently. Operators can trace any reference code to its cause, and can see which Azure errors no rule matched yet.

**Blocked by:** [04: Document Translation: happy path](04-document-translation-happy-path.md)

**Status:** ready-for-agent

- [x] **The classifier:** one pure, table-driven module. Input: `(service, httpStatus, error.code, innerError.code, job/document status)`. Output: `{ category, reason?, ruleId }`. The API returns only `category` and `reason`.
- [x] **Batch and Translator rules** as in the spec:
  - document `Failed` with `InvalidRequest`/`InvalidArgument` → 4
  - document `Failed` with `ServiceUnavailable`/`InternalServerError`/`RequestRateTooHigh` → 6
  - `Unauthorized`/`ResourceNotFound` and submit `400`/`401`/`403`/`404` → 6 at error level
  - `ValidationFailed` → the document's error, otherwise 6
  - unexpected `Cancelled` → 6
  - `Succeeded` with 0 characters charged → Completed
- [x] **Fallback:** anything unmatched → 6, except a document `Failed` with `InvalidRequest`/`InvalidArgument` and an unknown inner code → 4 generic
- [x] **Retries:** the backend retries Azure 429/5xx 3 times with exponential backoff, within each `/api` request's 45-second budget. The SPA tolerates 3 failed polls in a row.
- [x] **Document timeout:** 15 minutes from start (an app setting). On timeout the backend cancels the job, and the user sees category 6.
- [x] **SPA:** a Fluent `MessageBar` replaces the status area, with focus moved to it, and shows "Reference: <first 8 characters of the GUID>".
  - Category 2, Upload failed: Try again re-uploads the in-memory file with a new SAS and GUID
  - Category 4: the generic text, or the reason text for `passwordProtected` or `damaged`; action Choose another file
  - Category 6, Service problem: Try again re-runs the whole Translation with the same file and language
- [x] **Download failed:** the Translation stays Ready, with "Download failed. Try again" fetching a new SAS. Only a successful save triggers `DELETE`.
- [x] After any failure after upload, the SPA calls `DELETE` at once on a best-effort basis
- [x] **Error logs** carry the GUID, category, `ruleId`, service, HTTP status, `error.code`, `innerError.code`, job and document status, Azure request id and `mapped`, plus Azure's `message` truncated to 300 characters with SAS parameters scrubbed. They never carry filenames or content.
- [x] Bicep or the runbook adds a saved Log Analytics query, "Unmapped Azure errors (7 days)"
- [x] Seam 1 tests cover every rule (the fake returns the error, and the test asserts on the poll's category, reason and `ruleId`), the retries, the timeout and cancellation, and the log fields. Seam 2 tests cover each `MessageBar`, its action, the reference code and focus.

## Comments

Built on branch `ticket-09` (code only; nothing ran against Azure). Every box is ticked because each behaviour is built and tested at Seam 1/Seam 2; what only real Azure can confirm is listed here for ticket 13 (Verify against real Azure).

- **Classifier** `api/src/translations/classifier.ts`: `RULES` then `FALLBACKS` (rows of `{ id, when, category, reason?, level? }`; first match wins; a fallback match logs `mapped: false`). Rule ids: `azure.busy`, `document.timeout`, `image.timeout`, `batch.document.invalidRequest`, `batch.document.serviceBusy`, `batch.accessFailed`, `batch.request.rejected`, `batch.validationFailed`, `batch.cancelled`, `fallback.document.invalidRequest`, `fallback`. No `innerError.code` -> reason rows yet: the codes are undocumented, so `passwordProtected`/`damaged` from Translator wait for real payloads (capture checklist in issue 13). The SPA already renders both reasons.
- **Submit rules** (`startBatch` 400/401/403/404 and 429/5xx after retries) are tested through `POST /api/translations`, not the poll: the submit has no poll. It answers **502** with a `FailedTranslationResponse` body and deletes the Source file.
- **Poll 404** is Expired (ticket 07's rule runs first), so `batch.request.rejected` covers 400/401/403 on the status call.
- **Retries**: `api/src/azure/retries.ts` wraps the port in `index.ts` (and in the Seam 1 harness): 429/5xx/no response retried 3 times at 1 s, 2 s, 4 s, skipped when the wait plus another attempt as slow as the last would pass the request's 45 s (per-request budget via an `app.hook.preInvocation` + AsyncLocalStorage). Blob and Table Storage are left to their SDKs' own retry policies (`blobAdapter.ts` sets 4 tries, 1-4 s, 8 s per try). Real-Azure check: the preInvocation hook runs on Flex Consumption.
- **Error logs**: `translation.failed` via `context.warn`/`context.error`. `requestId` comes from `apim-request-id`/`X-RequestId` (Translator) and `x-ms-request-id` (Blob); not yet seen on real responses.
- **Saved query** `infra/modules/monitoring.bicep` (`lingolens-unmapped-azure-errors`, category "Lingo Lens"): it parses the fields out of `AppTraces.Message`, assuming the Node worker writes `translation.failed { ... mapped: false ... }` as one message. Check against real rows and adjust the `extract` patterns if App Insights stores the object differently (e.g. in `Properties`).
- **Not in this ticket**: the Image timeout (3 min; `image.timeout` row is ready) and the Document Intelligence/Translator text rules are ticket 10's.

