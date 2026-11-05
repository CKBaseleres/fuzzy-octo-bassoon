# Map: Lingo Lens MVP

Type: map

## Destination

A build-ready spec for the Lingo Lens MVP at `.scratch/lingo-lens/spec.md`, with every decision made, ready to hand to `/to-tickets`. Lingo Lens is an internal React SPA (no sign-in in the MVP) that translates Documents (formats Azure Document Translation supports natively) and Images (side-by-side extracted text) using Azure AI.

## Notes

- Domain: see `GLOSSARY.md` (Source file, Document, Image, Translation, Translated file). Use those terms.
- Reference prototype: `/Users/carlbaseleres/Code/claude-prototype/translator-pitch.html` ("Lingo Lens"), with canned data and Fluent UI web components.
- Standing decisions from charting:
  - Azure is the committed platform; comparing vendors is out of scope.
  - Front end: React with Fluent UI React v9 (`@fluentui/react-components`).
  - Built for organisation staff, but **publicly reachable with no sign-in** (see [Limits, cost and abuse guardrails](issues/06-limits-and-cost-guardrails.md)): anyone with the URL can use it, bounded by quotas.
  - Documents: download-only, with no in-browser preview of the Translated file.
  - Images: extracted text shown side-by-side with the original Image, with regions highlighted.
  - One Source file into one target language per Translation. All Translator languages, source auto-detected.
  - Nothing is kept: files are deleted on download or after a 1-hour timeout (the mechanism is to be decided).
  - The UI shows a simple status (uploading → translating → ready).
- **Spec must carry an open risk, "Verify against real Azure"** (the skipped spike's checks; see [Azure spike: latency, error payloads, OCR quality](issues/09-azure-spike.md)), so `/to-tickets` makes it the first build ticket. It carries the error-capture checklist from [Error handling: mapping Azure errors to categories](issues/13-error-handling-azure-error-mapping.md).
- Skills: grilling tickets use `/grilling` + `/domain-modeling`. Research tickets use `/research`.

## Decisions so far

- [Azure options for Image Translation](issues/02-azure-image-translation-options.md): Document Intelligence `prebuilt-read` (GA) for OCR polygons, then Translator text translation per paragraph, kept aligned by array index; Vision 4.0 Read is deprecated (retires 2028-09-25) and Document Translation image files return a repainted Image with no regions.
- [Azure Document Translation: sync vs async API](issues/01-azure-document-translation-api.md): use the sync API (`2026-03-01` GA, no Blob Storage, Translated file in the response, ≤10 MB, docx/xlsx/pptx/msg/html/mhtml/txt/csv/tsv/xlf); sync has no PDF, so PDF support (drop, hybrid with batch, or all-batch) is an open product decision.

- [PDF support and translation mode](issues/08-pdf-support-and-translation-mode.md): PDF is in; every Document goes through the batch API (Blob Storage, NMT, all batch formats except images); mixed-PDF partial output accepted with a UI note; hybrid sync+batch is the fallback if batch latency is poor.
- [Backend and hosting architecture](issues/04-backend-and-hosting-architecture.md): SWA Standard + linked Flex Consumption Function App (TypeScript); keyless Managed Identity everywhere (Translator's own MI reaches Blob, no SAS, no Key Vault); API reachable only via the SWA proxy; stateless polling with no database; one region.
- [How file handling works](issues/05-file-handling.md): browser uploads straight to Blob with a single-blob user delegation SAS; GUID-only blob names, filenames stay in the browser; SPA fetches the Translated file via a 5-min SAS then calls DELETE; Source file deleted when the batch ends; 5-minute timer sweeps anything over 1 hour (lifecycle rule as backstop, soft delete off); Document Intelligence results purged via Delete Analyze Result; no content or filenames in logs.
- [Limits, cost and abuse guardrails](issues/06-limits-and-cost-guardrails.md): public (no IP allow-list); Documents ≤ 40 MB, Images ≤ 20 MB; no page/char cap; one Translation per tab; 300/day global and 20/hour per IP via Table Storage counters; Budget alerts, a kill-switch setting and max 10 instances; 429 + `Retry-After` with fixed messages; noindex.
- [The Image Translation result screen](issues/07-image-translation-result-screen.md): variant A. The sticky original Image sits beside a list of paragraph cards (translation, with the original shown underneath behind a toggle). Hover and focus link each card to its polygon in both directions, using an SVG overlay with a pixel viewBox. Actions are Copy translated text and New Translation; a handwriting chip and a no-text state are included.
- [Deployment and CI](issues/10-deployment-and-ci.md): West Europe (Sweden Central as fallback). Dev and prod resource groups in one subscription, no SWA preview environments, lower quotas on dev, and a custom domain for prod only. One repo with npm workspaces and Bicep (a one-off bootstrap for the deploy identities). GitHub Actions authenticates with OIDC through per-environment managed identities and no stored secrets. Main deploys to dev, then the same build goes to prod after approval. The kill switch is a Bicep parameter. Budgets are $100 (prod) and $25 (dev); the alert recipients, prod approvers and domain are still to be filled in.
- [Accessibility and responsive bar](issues/11-accessibility-and-responsive-bar.md): WCAG 2.2 AA (axe in CI plus a manual screen-reader pass before prod). Phone, tablet and desktop down to 320 px, with no camera UI and no zoom blocking. English-only interface with `lang` on the originals and translations; status announced in a live region with focus management. The Image screen stacks below 768 px with the Image pinned, gets a tap/click selection model and high-contrast outlines, and its card list is the accessible content.
- [Error handling: user-facing behaviour](issues/12-error-handling-user-facing-behaviour.md): seven failure categories (rejected before upload, upload failed, refused, can't translate, no text found, service problem, expired). Each shows a MessageBar with one action, and a retry re-uses the in-memory file. Failed Translations count towards quota. Azure 429/5xx are retried 3 times; timeouts are 15 minutes (Document) and 3 minutes (Image). Files are deleted at once on failure, and a reference code is shown. Translations end Completed, Failed, Expired or Abandoned (now glossary terms).
- [Error handling: mapping Azure errors to categories](issues/13-error-handling-azure-error-mapping.md): one table-driven backend classifier returns a category plus a reason enum, and the SPA owns the wording. Batch `Failed` with `InvalidRequest`/`InvalidArgument`, and Document Intelligence content errors, go to Can't translate; 429/5xx/auth/config errors and anything unrecognised go to Service problem. Images with no letters or digits go to No text found. The browser now rejects encrypted OOXML/PDF and Images outside 50–10,000 px before upload. Logs carry the codes, Azure request id, `ruleId` and `mapped` flag. A capture checklist goes to Verify against real Azure.

## Not yet specified

_Nothing. All remaining work is ticketed._

## Out of scope

- [Azure spike: latency, error payloads, OCR quality](issues/09-azure-spike.md): skipped in planning by the user's choice. Each fact has a decided fallback, and the checks move into the build as "Verify against real Azure".
- Detecting untranslated scanned pages in mixed PDFs: accepted limitation with a UI note (see [PDF support and translation mode](issues/08-pdf-support-and-translation-mode.md)).
- Translating text inside images embedded in docx/pptx (`translateTextWithinImage`): same painted-overlay approach as Images; off.
- [Who can sign in](issues/03-who-can-sign-in.md): the MVP has no sign-in. Entra ID access control (tenant, guests, groups, roles) is a later effort.
- Painting translated text back onto Images (prototype's chalkboard overlay): image inpainting is its own hard problem, ruled out at charting.
- Side-by-side Document preview with paragraph matching and synced scroll: Documents are download-only.
- Batch Translations (several Source files) and multi-language Translations.
- Translation history: nothing is kept.
- "Layout preserved %" fidelity score and layout map: Azure provides no such metric.
- Localising the app's own interface (it is English only): see [Accessibility and responsive bar](issues/11-accessibility-and-responsive-bar.md).
- "Behind the scenes" pipeline panel: replaced by a simple status.
