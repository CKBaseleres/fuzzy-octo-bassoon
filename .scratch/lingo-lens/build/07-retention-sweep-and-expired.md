# 07: Retention: 1-hour sweep and Expired

Spec: [../spec.md](../spec.md) (Files and retention)

**What to build:** Nothing a staff member leaves behind outlives about an hour. If they come back after the sweep, they see that the Translation expired and can translate again in one click with the same file and language. Refreshing or closing the tab abandons the Translation.

**Blocked by:** [04: Document Translation: happy path](04-document-translation-happy-path.md)

**Status:** ready-for-agent

- [ ] A timer-triggered Function runs every 5 minutes. It deletes every blob older than 60 minutes (measured from upload) and cancels any batch job still running for those blobs.
- [ ] Bicep sets a Blob lifecycle rule that deletes anything older than 1 day (the backstop), and turns off soft delete, versioning and point-in-time restore
- [ ] When the poll or file request finds the Translation's blobs gone, the API reports Expired, and the SPA shows "expired, please start again" with **Translate again** (same in-memory file and target language), moving focus to the message
- [ ] A refresh or closed tab abandons the Translation, with nothing in `sessionStorage` or `localStorage`; the sweep cleans up
- [ ] Seam 1 tests use the injected clock to cover the sweep's deletions, job cancellation and the Expired response. Seam 2 tests cover the Expired message and Translate again.
