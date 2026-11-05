# 08: Quotas, kill switch and guardrails

Spec: [../spec.md](../spec.md) (Limits and guardrails)

**What to build:** The public URL can't run up unbounded cost. Each IP gets a limited number of Translations per hour, the whole service a limited number per UTC day, and the owner can switch new Translations off without a redeploy. Staff who hit a limit are told plainly how long to wait.

**Blocked by:** [04: Document Translation: happy path](04-document-translation-happy-path.md)

**Status:** ready-for-agent

- [ ] **Counters** in Table Storage (in the existing storage account, created by Bicep) for a daily quota per UTC day and a per-IP hourly limit, using the client IP from `X-Forwarded-For`. They hold counts only.
- [ ] Quotas are app settings: prod 300/day and 20/hour per IP; dev 50/day and 10/hour per IP
- [ ] A Translation counts when `POST /api/translations` starts it (failures count too); rejections before upload and upload failures don't count
- [ ] **Kill switch:** `TRANSLATIONS_ENABLED`, a Bicep parameter, refuses new Translations when false. A runbook note covers flipping it in the portal and then committing the parameter.
- [ ] Refusals return 429 with `Retry-After`. The SPA shows "You've reached the hourly limit. Try again in N minutes." or "Lingo Lens has reached today's limit. Try again tomorrow." in a `MessageBar` with no action.
- [ ] **Server-side size check:** before starting, the backend checks the uploaded blob's real size (40 MB for Documents, 20 MB for Images) and deletes an oversized blob at once
- [ ] **Search engines:** `X-Robots-Tag: noindex` on every response and a `robots.txt` that disallows everything
- [ ] **Budgets** in Bicep: prod $100/month and dev $25/month. Alerts fire at 50%, 80% and 100% of actual spend and at 100% of forecast, with recipients as a parameter.
- [ ] Seam 1 tests cover both quotas across the clock boundaries, the kill switch, `Retry-After` values and the size check. Seam 2 tests cover both Refused messages.
