# Research: Azure Document Translation, sync vs async

Ticket: [01-azure-document-translation-api](../issues/01-azure-document-translation-api.md)
Researched: 2026-11-05. All sources are Microsoft Learn or azure.microsoft.com, read on that date.

**Version status.** The current API is **`2026-03-01`, which is GA** ([overview 2026-03-01][ov-latest]). `2024-05-01` is now the "legacy" API ([legacy REST guide][rest-legacy]). In `2026-03-01`, only **LLM model selection** (`deploymentName`) is **Public Preview**. Standalone image translation was added as `2025-12-01-preview` and is GA in `2026-03-01` ([overview 2026-03-01][ov-latest]). Microsoft Learn exposed no per-page `ms.date` through the fetch tool, so dates are given as retrieval dates.

Vocabulary follows `GLOSSARY.md`: Source file, Document, Image, Translation, Translated file.

---

## 1. The two APIs at a glance

| | **Synchronous** (`POST {endpoint}/translator/document:translate`) | **Asynchronous batch** (`POST {endpoint}/translator/document/batches`) |
|---|---|---|
| Input | One file as `multipart/form-data` (`document` part, plus an optional `glossary`) | JSON naming Blob Storage `sourceUrl`/`targetUrl` (SAS or managed identity) |
| Output | Translated file **as the binary body of the 200 response** | `202` + `operation-location` header. You poll the job, then read the Translated file from the target container |
| Blob Storage | **Not required** | **Required** (source and target containers) |
| Target languages | 1 | Up to 10 per batch |
| Endpoint | Custom domain `https://{name}.cognitiveservices.azure.com` (both APIs) | same |

Sources: [sync reference 2026-03-01][sync-ref], [async reference 2026-03-01][async-ref], [REST guide 2026-03-01][rest-latest].

## 2. Supported formats

**Synchronous** ([overview, Synchronous tab][ov-legacy]):
`.txt`, `.tsv`/`.tab`, `.csv`, `.html`/`.htm`, `.mhtml`/`.mht`, `.pptx`, `.xlsx`, `.docx`, `.msg`, `.xlf`.
The client must send the MIME type for each file (e.g. `.docx` → `application/vnd.openxmlformats-officedocument.wordprocessingml.document`). The full content-type table is on that page.

- **No PDF.** PDF does not appear in the synchronous list.
- **No legacy Office formats** (`.doc`, `.xls`, `.ppt`), **no OpenDocument**, **no `.rtf`**, **no Markdown**.
- The sync feature table says "Translate single-page files" ([overview 2026-03-01][ov-latest]). No page or character cap is stated beyond the 10 MB size and 6M chars/min limits (§3). We found nothing that defines "single-page" more precisely, so treat it as a sign that sync is meant for small files.

**Asynchronous batch** ([overview, Async tab][ov-legacy]):
`pdf` (with OCR for scanned PDFs), `csv`, `html`/`htm`, images (`.jpeg`, `.png`, `.bmp`, `.webp`), `odp`, `ods`, `odt`, Markdown (`md` and variants), `mhtml`/`mht`, `xls`/`xlsx`, `msg` (Unicode only), `ppt`/`pptx`, `doc`/`docx`, `rtf`, `tsv`/`tab`, `txt`, `xlf`.
Legacy formats come back converted: `.doc/.odt/.rtf → .docx`, `.xls/.ods → .xlsx`, `.ppt/.odp → .pptx`.
`2026-03-01` adds two batch-only options: PDF translation through Azure Document Intelligence, and translating text inside images in `.docx`/`.pptx` (`translateTextWithinImage: true`) ([overview 2026-03-01][ov-latest], [async reference][async-ref]).

**At runtime:** `GET {endpoint}/translator/document/formats?api-version=2026-03-01&type=document` returns formats, extensions and content types ([formats reference][formats-ref]). It is useful for validating file types, but its response does not say which method (sync or batch) supports each format.

## 3. Size, page and character limits

[Service limits][limits]:

| Limit | Sync | Batch |
|---|---|---|
| Document size | **≤ 10 MB** | ≤ 40 MB |
| Image file size | n/a | ≤ 5 MB |
| Files per request | 1 | ≤ 1000 |
| Total content per batch | n/a | ≤ 250 MB |
| Target languages | 1 | ≤ 10 |
| Glossary size | ≤ 1 MB | ≤ 10 MB |
| Throughput | 6 million characters per minute | not stated |

- The docs state **no per-document page limit or character limit** for either API. Known issue 3008 recommends splitting documents of "thousands of intricate pages" into chunks of about 100 pages ([known issues][known]).
- Secured documents (password-encrypted, or with copy restrictions) are **not supported** ([limits][limits], [FAQ][faq]).
- The Document Translation docs give no maximum sync request duration. The 15 s latency figure on the limits page applies to **text** translation only ([limits][limits]). The SPA or back end should therefore set a generous timeout for sync calls. A spike should measure real latency.

## 4. Blob Storage: needed? how long do files stay?

- **Sync:** no storage account. The file goes in the request and the Translated file comes back in the response ([sync ref][sync-ref]).
- **Batch:** a storage account with a source container and a target container is required. Access uses SAS tokens (source: read+list, target: write+list) or the Translator resource's managed identity ([prerequisites][prereq]). Managed identity requires a **regional** Translator resource, not Global ([managed identity][mi]).
- **How long Azure keeps data:** for both APIs, "Document translation temporarily stores customer data while processing. After processing, the customer data is removed permanently with a hard delete" ([data, privacy & security][privacy]). The processing region follows the resource region ([region support][region]).
- **How long Lingo Lens would keep data (batch only):** files stay in *your* containers until you delete them. Azure removes nothing there for you. The built-in automatic option is Blob lifecycle management, which counts in **days** (`daysAfterCreationGreaterThan`). Policies run about once a day and can take up to 24 h to take effect ([lifecycle structure][lc-structure], [lifecycle overview][lc-overview]). That **cannot meet a 1-hour timeout**. Batch would need explicit deletes on download plus a scheduled cleanup job such as a timer-triggered Function.
- With **sync**, nothing persists beyond the request. "Nothing is kept" then reduces to "don't store the response body server-side". Lingo Lens would only need to delete files on download or after the timeout if it chose to stage them itself.

## 5. Authentication, and can a browser call it directly?

- **Keys:** `Ocp-Apim-Subscription-Key` (plus `Ocp-Apim-Subscription-Region` for regional resources) appears in every Document Translation reference example ([sync ref][sync-ref], [prerequisites][prereq]).
- **Microsoft Entra ID:** Azure AI services accept `Authorization: Bearer <token>` with scope `https://cognitiveservices.azure.com/.default` on the **custom-domain endpoint**, given the **Cognitive Services User** role. Key auth can be disabled with `DisableLocalAuth` ([Entra ID auth][entra]). Microsoft's Entra walkthrough uses Text Translation examples. The Document Translation JS SDK (`@azure/ai-translation-document`) documents `DefaultAzureCredential` and, for browsers, `InteractiveBrowserCredential` ([JS SDK README][js-sdk]). Managed identity for a server-side caller (e.g. an App Service or Function app) uses the same bearer-token path.
- **Browser direct call:**
  - **Keys in the SPA:** never. The key would ship to every user. Microsoft advises keeping keys in Key Vault ([overview][ov-legacy]).
  - **Entra delegated token from the SPA:** possible in principle. The SDK documents browser use, and the delegated permission "Access Cognitive Services API as organization users" exists ([Entra ID auth][entra]). It would need the *Cognitive Services User* role granted to every staff member, or a group, on the Translator resource. The docs found here do not explicitly cover **CORS** for the Document Translation endpoint, so this is **unverified** and needs a spike.
  - **Batch from a browser** would also require the browser to write to Blob Storage. That means user SAS tokens or storage RBAC for every user, plus storage CORS.
  - The safer default is a thin back end (an Entra-protected API) that calls Translator with its managed identity.

## 6. Images (JPG/PNG): accepted directly? what comes back?

- **Batch:** yes. `.jpeg`, `.png`, `.bmp`, `.webp`, each ≤ 5 MB. **The Translated file is an image with translated text rendered back into it**: "Translate text within an image while maintaining the original design and layout" ([overview 2026-03-01][ov-latest]). Language coverage follows the "scanned PDF and image" support table, which has gaps. For example, Greek, Hebrew and Thai are listed as unsupported, and several languages are source-only ([language support][lang]).
- **Sync:** images are **not** in the synchronous format list, and the FAQ says image translation is an asynchronous (batch) feature ([FAQ][faq]). The `2026-03-01` "what's new" note on image translation does not mark it batch-only, but no sync documentation lists images. Treat images as **batch-only**.
- **Fit for Lingo Lens:** the MVP wants **extracted text with highlighted regions shown side-by-side**, and painting translated text back onto Images is explicitly out of scope. Document Translation returns a re-rendered image, with no text and no bounding boxes. **Images should therefore not go through Document Translation.** They need an OCR step that returns text and regions (e.g. Azure AI Vision Read or Document Intelligence), followed by Text Translation. That belongs in a separate ticket.

## 7. Error shapes

**Sync** ([sync ref 2026-03-01][sync-ref], [legacy sync ref][sync-legacy]):

| HTTP | Meaning |
|---|---|
| 200 | Translated file as the binary body |
| 400 | Bad request (invalid or missing parameters, form data) |
| 401 | Auth failed |
| 415 | **Unsupported media type** (the MIME type or format is not supported for sync) |
| 429 | Rate limited |
| 500 / 503 | Service error / unavailable, retry |

The error body is JSON:
```json
{ "error": { "code": "InvalidRequest", "message": "The 'targetLanguage' parameter is required.",
  "innerError": { "requestId": "…", "date": "…" } } }
```

**Batch** ([job status][job-status], [document status][doc-status]):
- The submit call returns 202, or 400/401/429/500/503.
- Each job and each document has a `status` of `NotStarted | Running | Succeeded | Failed | Cancelled | Cancelling | ValidationFailed`.
- A failed document carries `error { code, message, target, innerError { code, message } }`. Top-level `code` values: `InternalServerError, InvalidArgument, InvalidRequest, RequestRateTooHigh, ResourceNotFound, ServiceUnavailable, Unauthorized`.

**Specific cases asked about:**
- **Unsupported file:** sync returns **415**. Batch marks the document `Failed`/`ValidationFailed`. Validating against the format list (§2) before upload avoids both.
- **Password-protected or encrypted:** documented as unsupported ([limits][limits], [FAQ][faq]). **The exact error code or `innerError.code` is not documented.** For `.docx`/`.xlsx`/`.pptx` via sync, expect a 400 or 415 with a JSON `error`. This needs capturing in a spike.
- **Scanned PDF with no text layer:**
  - With **sync**, this cannot happen, because PDF is not accepted at all (415).
  - With **batch**, scanned PDFs are **supported via OCR**, though formatting can degrade ([FAQ][faq], [overview][ov-legacy]). Mixed PDFs translate only their digital portions, and scanned pages are left untranslated **without an error** ([FAQ][faq]). Watermarks can leave pages untranslated (known issue 3010, [known issues][known]).
  - "No text layer" is therefore not an error case for batch, and silently partial output is the real risk.
- **Timeouts:** the docs give no sync timeout (§3). For batch, the client decides how long to poll.

## 8. Pricing

[Pricing page][pricing], [overview 2026-03-01][ov-latest]:
- **NMT Document Translation** is billed **per million characters** of source content on S1 pay-as-you-go. Images are billed **per thousand images**, with up to 500 characters per image and each further 500 characters counting as another image. The same model applies to sync and batch. The docs show no separate sync price.
- **Always PAYG.** Commitment tiers on S1 cover *text* translation only. **D3** is the volume-discount tier for document translation. Document Translation needs **S1** or **C2/C3/C4/D3**, and **F0 (free) is not supported** ([managed identity page][mi]).
- **LLM-based** document translation (Preview) is billed by input and output tokens at Azure OpenAI rates.
- The pricing page served masked prices (`$-`) to the fetch tool. Read exact figures in the [Azure pricing calculator][pricing].
- **Batch only:** Blob Storage transaction and capacity costs on top.

---

## Recommendation: use the **synchronous** API for Documents

For Lingo Lens's one-file-at-a-time, one-target-language, download-only, nothing-is-kept MVP, **synchronous** is the better fit:

1. **It matches the user flow.** One request in, the Translated file out as the response body. The status display (uploading → translating → ready) maps directly onto the HTTP request lifecycle. Batch would add a job, polling, and a second download.
2. **Nothing-is-kept for free.** No storage account, no containers, no SAS or RBAC on storage, and no cleanup job. Batch would need explicit deletes plus a scheduled cleanup, because Blob lifecycle rules work in days and cannot meet the 1-hour timeout.
3. **Simpler security.** One Entra-protected back end calls one Translator endpoint with a managed identity.

**Costs of this choice, which the spec must state:**
- **Accepted Document formats for the MVP = the sync list:** `.docx`, `.xlsx`, `.pptx`, `.msg`, `.html`/`.htm`, `.mhtml`/`.mht`, `.txt`, `.csv`, `.tsv`/`.tab`, `.xlf`. Max **10 MB**.
- **PDF is not supported by sync.** If PDF is a must-have, and it probably is for staff documents, the options are:
  - (a) Ship the MVP without PDF.
  - (b) Use a **hybrid**: sync for the formats above, and batch only for PDF (and legacy `.doc`/`.xls`/`.ppt`, ODF, `.rtf`, `.md`, and files of 10–40 MB). This brings back Blob Storage and the cleanup mechanism for those files.
  - (c) Use batch for everything.
  - This is a product decision and should be raised as its own grilling question.
- **Images do not go through Document Translation** in either mode (§6). They need OCR plus Text Translation.

**Suggested follow-ups:**
- A spike that calls sync with a password-protected `.docx`, a renamed/unsupported file, and an oversized file, to capture the real error payloads.
- The same spike should measure sync latency on a large `.pptx`.
- Confirm whether the endpoint allows a browser CORS call with an Entra token. A thin back end is recommended either way.

---

## Sources

[ov-latest]: https://learn.microsoft.com/azure/ai-services/translator/document-translation/latest/overview
[ov-legacy]: https://learn.microsoft.com/azure/ai-services/translator/document-translation/overview
[sync-ref]: https://learn.microsoft.com/azure/ai-services/translator/document-translation/latest/rest-api/translate-synchronous
[sync-legacy]: https://learn.microsoft.com/azure/ai-services/translator/document-translation/reference/translate-document
[async-ref]: https://learn.microsoft.com/azure/ai-services/translator/document-translation/latest/rest-api/translate-asynchronous
[rest-latest]: https://learn.microsoft.com/azure/ai-services/translator/document-translation/latest/rest-api/guide-overview
[rest-legacy]: https://learn.microsoft.com/azure/ai-services/translator/document-translation/reference/rest-api-guide
[formats-ref]: https://learn.microsoft.com/azure/ai-services/translator/document-translation/latest/rest-api/get-supported-document-formats
[limits]: https://learn.microsoft.com/azure/ai-services/translator/service-limits#document-translation
[prereq]: https://learn.microsoft.com/azure/ai-services/translator/document-translation/latest/prerequisites
[mi]: https://learn.microsoft.com/azure/ai-services/translator/document-translation/how-to-guides/create-use-managed-identities
[privacy]: https://learn.microsoft.com/azure/foundry/responsible-ai/translator/data-privacy-security
[region]: https://learn.microsoft.com/azure/ai-services/translator/region-support
[entra]: https://learn.microsoft.com/azure/ai-services/translator/how-to/microsoft-entra-id-auth
[js-sdk]: https://learn.microsoft.com/javascript/api/overview/azure/ai-translation-document-readme?view=azure-node-latest
[faq]: https://learn.microsoft.com/azure/ai-services/translator/document-translation/faq
[known]: https://learn.microsoft.com/azure/ai-services/translator/reference/known-issues
[lang]: https://learn.microsoft.com/azure/ai-services/translator/language-support#document-translation-scanned-pdf-and-image-support
[job-status]: https://learn.microsoft.com/azure/ai-services/translator/document-translation/reference/get-translation-status
[doc-status]: https://learn.microsoft.com/azure/ai-services/translator/document-translation/latest/rest-api/get-status-specific-document
[pricing]: https://azure.microsoft.com/pricing/details/cognitive-services/translator/
[lc-structure]: https://learn.microsoft.com/azure/storage/blobs/lifecycle-management-policy-structure
[lc-overview]: https://learn.microsoft.com/azure/storage/blobs/lifecycle-management-overview

- Overview, 2026-03-01 (GA): <https://learn.microsoft.com/azure/ai-services/translator/document-translation/latest/overview>
- Overview, with format tables per method: <https://learn.microsoft.com/azure/ai-services/translator/document-translation/overview>
- Sync reference, 2026-03-01: <https://learn.microsoft.com/azure/ai-services/translator/document-translation/latest/rest-api/translate-synchronous>
- Sync reference, 2024-05-01 (error JSON example): <https://learn.microsoft.com/azure/ai-services/translator/document-translation/reference/translate-document>
- Async reference, 2026-03-01: <https://learn.microsoft.com/azure/ai-services/translator/document-translation/latest/rest-api/translate-asynchronous>
- Service limits: <https://learn.microsoft.com/azure/ai-services/translator/service-limits#document-translation>
- Prerequisites: <https://learn.microsoft.com/azure/ai-services/translator/document-translation/latest/prerequisites>
- Managed identities: <https://learn.microsoft.com/azure/ai-services/translator/document-translation/how-to-guides/create-use-managed-identities>
- Data, privacy & security: <https://learn.microsoft.com/azure/foundry/responsible-ai/translator/data-privacy-security>
- Region support: <https://learn.microsoft.com/azure/ai-services/translator/region-support>
- Entra ID auth: <https://learn.microsoft.com/azure/ai-services/translator/how-to/microsoft-entra-id-auth>
- JS SDK README: <https://learn.microsoft.com/javascript/api/overview/azure/ai-translation-document-readme?view=azure-node-latest>
- FAQ: <https://learn.microsoft.com/azure/ai-services/translator/document-translation/faq>
- Known issues: <https://learn.microsoft.com/azure/ai-services/translator/reference/known-issues>
- Language support (scanned PDF/image): <https://learn.microsoft.com/azure/ai-services/translator/language-support#document-translation-scanned-pdf-and-image-support>
- Job / document status: <https://learn.microsoft.com/azure/ai-services/translator/document-translation/reference/get-translation-status>, <https://learn.microsoft.com/azure/ai-services/translator/document-translation/latest/rest-api/get-status-specific-document>
- Pricing: <https://azure.microsoft.com/pricing/details/cognitive-services/translator/>
- Blob lifecycle: <https://learn.microsoft.com/azure/storage/blobs/lifecycle-management-policy-structure>, <https://learn.microsoft.com/azure/storage/blobs/lifecycle-management-overview>
