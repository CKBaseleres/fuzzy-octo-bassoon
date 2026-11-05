# 09: Failures, part 1: Document errors, retries and timeouts

Spec: [../spec.md](../spec.md) (Error classification; Status, errors and accessibility)

**What to build:** When a Document Translation goes wrong, the staff member sees one clear message with at most one action and a reference code, and can recover without picking the file again. Brief Azure hiccups are retried silently. Operators can trace any reference code to its cause, and can see which Azure errors no rule matched yet.

**Blocked by:** [04: Document Translation: happy path](04-document-translation-happy-path.md)

**Status:** ready-for-agent

- [ ] **The classifier:** one pure, table-driven module. Input: `(service, httpStatus, error.code, innerError.code, job/document status)`. Output: `{ category, reason?, ruleId }`. The API returns only `category` and `reason`.
- [ ] **Batch and Translator rules** as in the spec:
  - document `Failed` with `InvalidRequest`/`InvalidArgument` → 4
  - document `Failed` with `ServiceUnavailable`/`InternalServerError`/`RequestRateTooHigh` → 6
  - `Unauthorized`/`ResourceNotFound` and submit `400`/`401`/`403`/`404` → 6 at error level
  - `ValidationFailed` → the document's error, otherwise 6
  - unexpected `Cancelled` → 6
  - `Succeeded` with 0 characters charged → Completed
- [ ] **Fallback:** anything unmatched → 6, except a document `Failed` with `InvalidRequest`/`InvalidArgument` and an unknown inner code → 4 generic
- [ ] **Retries:** the backend retries Azure 429/5xx 3 times with exponential backoff, within each `/api` request's 45-second budget. The SPA tolerates 3 failed polls in a row.
- [ ] **Document timeout:** 15 minutes from start (an app setting). On timeout the backend cancels the job, and the user sees category 6.
- [ ] **SPA:** a Fluent `MessageBar` replaces the status area, with focus moved to it, and shows "Reference: <first 8 characters of the GUID>".
  - Category 2, Upload failed: Try again re-uploads the in-memory file with a new SAS and GUID
  - Category 4: the generic text, or the reason text for `passwordProtected` or `damaged`; action Choose another file
  - Category 6, Service problem: Try again re-runs the whole Translation with the same file and language
- [ ] **Download failed:** the Translation stays Ready, with "Download failed. Try again" fetching a new SAS. Only a successful save triggers `DELETE`.
- [ ] After any failure after upload, the SPA calls `DELETE` at once on a best-effort basis
- [ ] **Error logs** carry the GUID, category, `ruleId`, service, HTTP status, `error.code`, `innerError.code`, job and document status, Azure request id and `mapped`, plus Azure's `message` truncated to 300 characters with SAS parameters scrubbed. They never carry filenames or content.
- [ ] Bicep or the runbook adds a saved Log Analytics query, "Unmapped Azure errors (7 days)"
- [ ] Seam 1 tests cover every rule (the fake returns the error, and the test asserts on the poll's category, reason and `ruleId`), the retries, the timeout and cancellation, and the log fields. Seam 2 tests cover each `MessageBar`, its action, the reference code and focus.
