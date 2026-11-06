# 07: Retention: 1-hour sweep and Expired

Spec: [../spec.md](../spec.md) (Files and retention)

**What to build:** Nothing a staff member leaves behind outlives about an hour. If they come back after the sweep, they see that the Translation expired and can translate again in one click with the same file and language. Refreshing or closing the tab abandons the Translation.

**Blocked by:** [04: Document Translation: happy path](04-document-translation-happy-path.md)

**Status:** resolved

- [ ] A timer-triggered Function runs every 5 minutes. It deletes every blob older than 60 minutes (measured from upload) and cancels any batch job still running for those blobs.
- [x] Bicep sets a Blob lifecycle rule that deletes anything older than 1 day (the backstop), and turns off soft delete, versioning and point-in-time restore
- [x] When the poll or file request finds the Translation's blobs gone, the API reports Expired, and the SPA shows "expired, please start again" with **Translate again** (same in-memory file and target language), moving focus to the message
- [x] A refresh or closed tab abandons the Translation, with nothing in `sessionStorage` or `localStorage`; the sweep cleans up
- [x] Seam 1 tests use the injected clock to cover the sweep's deletions, job cancellation and the Expired response. Seam 2 tests cover the Expired message and Translate again.

## Comments

Built on branch `ticket-07` (code only: nothing was deployed or run against Azure).

- **Timer sweep (unticked):** `api/src/functions/sweep.ts`, registered as `retentionSweep` (`0 */5 * * * *`) in `index.ts`, tested at Seam 1. It deletes every blob under `source/` and `target/` created more than 60 minutes ago (generic, so it covers Images too). It also cancels every batch job still `NotStarted`/`Running` that was created more than 60 minutes ago. A job is created after its upload, so those are the jobs of swept blobs; a job created inside the window whose blob is swept now is cancelled by the next run. Still to confirm against real Azure: the timer fires on Flex Consumption with identity-based host storage, and the new `listActiveBatches` adapter call (Get Translations Status with `statuses=NotStarted,Running&createdDateTimeUtcEnd=...`, following `@nextLink`) accepts that filter format on `2026-03-01`. The adapter re-checks status and creation time itself, so an ignored filter only costs more paging.
- **Bicep:** `managementPolicies` in `modules/storage.bicep` deletes block blobs under `source/` and `target/` more than 1 day after creation. Soft delete, versioning and point-in-time restore were already off in `modules/blobService.bicep` (ticket 04). Compiled and linted, not deployed.
- **Expired:** the poll reports `{status:'failed', category:'expired'}` when Translator answers 404 for the job, or when no blob is left under `source/<guid>/` and `target/<guid>/` and the job did not end `Failed`/`ValidationFailed`. The file request answers **410** `{error:'expired'}` when every blob is gone (still 404 while the job may yet write the Translated file).
- **Abandon:** the SPA keeps nothing in `sessionStorage`/`localStorage` (asserted in a Seam 2 test); the sweep cleans up.

Notes for later tickets are in the build's conventions note ("Ticket 07").

- 2026-11-06: resolved on `lingo-lens-mvp` (code complete, all tests green). The unticked criteria above need real Azure or GitHub and are verified in [01: Verify against real Azure](01-verify-against-real-azure.md) and [14: Prod environment and first release](14-prod-environment-and-first-release.md).
