# Limits, cost and abuse guardrails

Type: grilling
Status: resolved
Blocked by: 01, 02
Map: ../map.md

## Question

What limits does the MVP enforce on a Translation (max file size, max pages or characters), and are there quotas to cap Azure spend? The MVP has no sign-in, so there is no user identity: quotas can only be global or per client (e.g. per IP), and nothing stops anyone who can reach the app. Is the app restricted at the network level (corporate network/VPN only, IP allow-list), rate-limited, or both? What does the user see when they hit a limit?

Constraint from [Backend and hosting architecture](04-backend-and-hosting-architecture.md): a linked SWA backend cannot be IP-restricted or network-isolated, so any network restriction must sit on SWA itself (`allowedIpRanges` with CIDR blocks or service tags, or a private endpoint). The API is reachable only through the SWA proxy.

## Answer

Decided with the user on 2026-11-05 (grilling).

- **Network reach: public.** No IP allow-list and no private endpoint. The user chose this knowingly: anyone with the URL can use Lingo Lens, and cost exposure is bounded only by the quotas below. An IP allow-list (SWA `allowedIpRanges`) can be added later in config alone, with no code change.
- **File size:** **Documents ≤ 40 MB** (the Translator batch cap) and **Images ≤ 20 MB**. The SPA checks before requesting an upload SAS. The backend checks the uploaded blob's actual size before starting the Translation, because a SAS cannot cap upload size, and deletes oversized blobs at once.
- **No page or character cap.** Azure documents none, and characters charged are only known after translation.
- **One Translation at a time** per browser tab.
- **Global daily quota:** 300 Translations per UTC day (an app setting). Refused after that until midnight UTC.
- **Per-IP rate limit:** 20 Translations per client IP per hour (an app setting), using the IP from SWA's `X-Forwarded-For`. Staff behind one office NAT share it.
- **Counter storage:** both quotas use counters in **Azure Table Storage in the existing storage account**. The counters hold counts only, never content or filenames. This amends "no database" in [Backend and hosting architecture](04-backend-and-hosting-architecture.md): Translations themselves stay stateless.
- No Front Door WAF and no CAPTCHA in the MVP.
- **Spend controls:**
  - An **Azure Budget** on the resource group emails the owners at 50%, 80% and 100% of a monthly amount. It alerts only; it cannot stop spending.
  - A **kill-switch app setting** (`TRANSLATIONS_ENABLED=false`) refuses new Translations without a redeploy.
  - The Flex Consumption **maximum instance count is capped at 10**.
  - The monthly amount and the alert recipients are deployment inputs for [Deployment and CI](10-deployment-and-ci.md).
- **What the user sees:**

  | Situation | Message |
  | --- | --- |
  | Upload area | "Documents up to 40 MB · Images up to 20 MB"; a file that's too big is rejected inline before upload |
  | Per-IP limit | "You've reached the hourly limit. Try again in N minutes." |
  | Daily quota used, or kill switch on | "Lingo Lens has reached today's limit. Try again tomorrow." |
  | Azure 429 | "Lingo Lens is busy, try again in a minute." |

  Quota refusals return **429 with `Retry-After`**.
- **Search engines:** `X-Robots-Tag: noindex` and a `robots.txt` that disallows everything.
