# How file handling works

Type: grilling
Status: resolved
Blocked by: 01, 04, 08
Map: ../map.md

## Question

How is "nothing is kept" enforced in practice? [PDF support and translation mode](08-pdf-support-and-translation-mode.md) decided that every Document goes through the batch API, so Source files and Translated files *will* sit in Blob Storage source/target containers, and Blob lifecycle rules (which work in days) cannot meet the timeout. Files are deleted on download or after a 1-hour timeout, whichever comes first. Where do Source files and Translated files physically live during a Translation (memory, Blob Storage), what deletes them (lifecycle policy, explicit delete, timer), and how is a Translated file handed to the browser (stream, short-lived SAS URL)?

Constraints from [Backend and hosting architecture](04-backend-and-hosting-architecture.md): every `/api` request through the SWA proxy is capped at 45 seconds. Storage account key access is disabled, so any SAS handed to the browser must be a **user delegation SAS** issued by the Function App's Managed Identity. The Function App supports timer triggers for cleanup. The backend is stateless with no database.

## Answer

Decided with the user on 2026-11-05 (grilling). Facts were checked against Microsoft Learn: Document Intelligence data retention, Delete Analyze Result, Functions service limits, and the batch job-history APIs.

- **Upload: direct to Blob Storage.** `POST /api/translations/uploads` returns a **user delegation SAS** for one blob: write only, 10-minute expiry, issued by the Function App's Managed Identity. The browser `PUT`s the Source file directly, and the storage account has a CORS rule for the app's origin. Uploading through `/api` was rejected: the Function App would accept 210 MB, but the SWA proxy cuts every request off at 45 seconds.
- **Naming:** blobs are named by a server-generated GUID only (`source/{guid}/file.<ext>`, `target/{guid}/file.<ext>`), with the extension kept so Translator can detect the format. **The original filename never leaves the browser.** The SPA builds the download name itself (for example `Report.fr.pdf`). Translator's job history lists blob paths, so the paths must not carry personal data. The Translation id the SPA sees is an opaque token combining our GUID and Azure's operation id, so the backend stays stateless. This refines the "derived from Azure's operation id" wording in [Backend and hosting architecture](04-backend-and-hosting-architecture.md).
- **Images:** the same direct upload. Document Intelligence reads the Image through a 5-minute, read-only SAS URL (`urlSource`), so the Image's bytes never pass through the Function. Once the OCR result is read and translated, the backend deletes the Image blob and calls **Delete Analyze Result**, which purges both the input and the result. Without that call, Document Intelligence keeps them for 24 hours. The SPA shows the original Image from browser memory (an object URL).
- **Download ("delete on download"):**
  1. `GET /api/translations/{id}/file` returns a read-only SAS with a 5-minute expiry.
  2. The SPA fetches the Translated file into memory and saves it via an object URL.
  3. The SPA calls `DELETE /api/translations/{id}`, which removes every blob for that Translation.
  4. While the page stays open, the user can save again from memory. After that it is gone.

  Streaming through `/api` was rejected because of the 45-second cap.
- **Early deletion:** the Source file blob is deleted as soon as a poll sees the batch job reach a terminal state (Succeeded, Failed or ValidationFailed).
- **1-hour timeout:**
  - The hour runs from upload.
  - A **timer-triggered Function runs every 5 minutes**. It deletes any blob older than 60 minutes (worst case about 65 minutes) and cancels any batch job still running for those blobs.
  - The SPA shows an expired Translation as "expired, please start again".
  - A Blob lifecycle rule (older than 1 day) is the backstop if the timer fails.
  - **Soft delete, versioning and point-in-time restore are off**, so a deleted blob is really gone.
- **Leaving the page:** a refresh or closed tab before download **abandons** the Translation. It is not resumed (no `sessionStorage`), and the timer cleans it up.
- **Logs and telemetry:** Application Insights and other logs never record file contents, original filenames, extracted text or translations. They record only GUIDs, format, size, languages, durations and error codes.
- **What Azure keeps on its side:** Translator hard-deletes its own temporary copies after processing. Its job history keeps only GUID blob paths. Document Intelligence data is purged by Delete Analyze Result.
