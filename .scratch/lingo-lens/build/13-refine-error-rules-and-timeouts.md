# 13: Refine error rules and timeouts from real Azure

Spec: [../spec.md](../spec.md) (Further Notes → open risk; Error classification)

**What to build:** The error mapping and timeouts reflect what Azure really does, not just what the docs say. Staff see a specific reason wherever Azure reports one, and timeouts fit the measured latency.

**Blocked by:** [01: Verify against real Azure](01-verify-against-real-azure.md), [10: Failures, part 2: Image errors and No text found](10-failures-image-errors-and-no-text-found.md), [11: Browser checks for protected files and Image dimensions](11-browser-checks-protected-files-and-image-dimensions.md)

**Status:** ready-for-agent

- [ ] Each payload captured in ticket 01 has a classifier rule with a Seam 1 test (for example, the real code for password-protected files mapped to 4 `passwordProtected`)
- [ ] The Document and Image timeouts are set from the measured latency, with headroom, in the dev and prod app settings
- [ ] The browser encryption checks are kept or removed, with the reason noted: removed only if Azure reports protected files clearly in every format
- [ ] **Batch-only vs hybrid:** the decision is recorded from the measured batch latency. If hybrid is needed, a new ticket is opened rather than doing it here.
- [ ] The region choice is confirmed in the Bicep parameters
