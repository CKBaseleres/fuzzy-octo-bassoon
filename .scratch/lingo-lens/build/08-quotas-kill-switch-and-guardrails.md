# 08: Quotas, kill switch and guardrails

Spec: [../spec.md](../spec.md) (Limits and guardrails)

**What to build:** The public URL can't run up unbounded cost. Each IP gets a limited number of Translations per hour, the whole service a limited number per UTC day, and the owner can switch new Translations off without a redeploy. Staff who hit a limit are told plainly how long to wait.

**Blocked by:** [04: Document Translation: happy path](04-document-translation-happy-path.md)

**Status:** ready-for-agent

- [ ] **Counters** in Table Storage (in the existing storage account, created by Bicep) for a daily quota per UTC day and a per-IP hourly limit, using the client IP from `X-Forwarded-For`. They hold counts only.
- [x] Quotas are app settings: prod 300/day and 20/hour per IP; dev 50/day and 10/hour per IP
- [x] A Translation counts when `POST /api/translations` starts it (failures count too); rejections before upload and upload failures don't count
- [x] **Kill switch:** `TRANSLATIONS_ENABLED`, a Bicep parameter, refuses new Translations when false. A runbook note covers flipping it in the portal and then committing the parameter.
- [x] Refusals return 429 with `Retry-After`. The SPA shows "You've reached the hourly limit. Try again in N minutes." or "Lingo Lens has reached today's limit. Try again tomorrow." in a `MessageBar` with no action.
- [x] **Server-side size check:** before starting, the backend checks the uploaded blob's real size (40 MB for Documents, 20 MB for Images) and deletes an oversized blob at once
- [x] **Search engines:** `X-Robots-Tag: noindex` on every response and a `robots.txt` that disallows everything
- [ ] **Budgets** in Bicep: prod $100/month and dev $25/month. Alerts fire at 50%, 80% and 100% of actual spend and at 100% of forecast, with recipients as a parameter.
- [x] Seam 1 tests cover both quotas across the clock boundaries, the kill switch, `Retry-After` values and the size check. Seam 2 tests cover both Refused messages.

## Comments

Built on branch `ticket-08` (code only: nothing was deployed or run against Azure).

Left unticked because they can only be confirmed against real Azure (ticket 01):
- **Counters:** the quota logic is built and tested at Seam 1 (both quotas, UTC day/hour boundaries, X-Forwarded-For parsing, what counts). The `quotacounters` Table is in `modules/storage.bicep`, and the real adapter (`api/src/azure/countersAdapter.ts`, `@azure/data-tables`, managed identity, ETag optimistic concurrency) is not exercised. Still to confirm: the Function identity's existing Storage Table Data Contributor reaches the Table, and SWA's `X-Forwarded-For` really carries the client IP first (with or without a port; both are handled).
- **Budgets:** `modules/budget.bicep` is built and its compiled template tested (Monthly, Cost, 50/80/100% Actual + 100% Forecasted, dev 25 / prod 100). It is deployed only once `budgetAlertEmails` is filled in (both `.bicepparam` files have `[]`: the recipients are still to be named). Still to confirm: the deploy identity (Contributor on the RG) can create it, and the subscription offer supports budgets. The start date defaults to the current month (`utcNow`), as in the AVM module.

Design notes:
- The kill switch shows the daily message ("Try again tomorrow"), with `Retry-After` to the next UTC midnight.
- Quotas are checked (read only) before the upload SAS, and checked again and counted at start. A refusal at start deletes the uploaded Source file. Oversized files get 413 `{ error: 'tooLarge', maxBytes }` and are deleted; they are not counted.
- The per-IP counter is keyed by a truncated SHA-256 of the IP, so the Table holds no addresses. Old counter rows are not cleaned up (one tiny row per day plus one per active IP per hour).
- `X-Robots-Tag: noindex` is set on static files by `web/public/staticwebapp.config.json` and on every API response by a `postInvocation` hook in `api/src/index.ts`, because SWA `globalHeaders` don't apply to API responses. An unhandled exception (host 500) does not get the header.
- A missing or invalid quota app setting fails safe to 0 (every Translation refused). `TRANSLATIONS_ENABLED` must be exactly `true` (case-insensitive) to allow Translations.
