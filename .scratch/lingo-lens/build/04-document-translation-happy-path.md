# 04: Document Translation: happy path

Spec: [../spec.md](../spec.md) (Translation pipelines; API contract; Files and retention)

**What to build:** On dev, a staff member picks a Document and a target language, watches the status go uploading → translating → ready, and gets the Translated file saved with the layout kept, named like `Report.fr.pdf`. Their files are deleted from Azure as soon as the save succeeds. This is the tracer bullet through every layer.

**Blocked by:** [03: Infrastructure bootstrap and dev deploy](03-infrastructure-bootstrap-and-dev-deploy.md)

**Status:** resolved

- [x] **File picker:** accepts the batch Document formats (pdf, doc/docx, xls/xlsx, ppt/pptx, odt/ods/odp, rtf, md, html/htm, mhtml/mht, msg, txt, csv, tsv/tab, xlf). Shows "Documents up to 40 MB · Images up to 20 MB". Rejects inline any file of the wrong type, over 40 MB, or empty.
- [x] **Language picker:** offers every Translator target language; the source language is auto-detected
- [ ] `POST /api/translations/uploads` returns a GUID and a write-only user delegation SAS for one blob (10-minute expiry). The browser `PUT`s straight to Blob, allowed by a CORS rule for the environment's origin.
- [x] Blob names are GUID-only, with the extension kept; the original filename never leaves the browser
- [ ] `POST /api/translations` starts a batch job (NMT, `translateTextWithinImage` off, keyless container URLs) and returns an opaque Translation id that combines the GUID and Azure's operation id. The backend holds no state.
- [x] The SPA polls `GET /api/translations/{id}`, and status changes are announced in a polite live region. When the job ends, the Source file blob is deleted.
- [ ] **When ready:** `GET /api/translations/{id}/file` returns a 5-minute read SAS. The SPA fetches the file into memory, saves it as `<name>.<target>.<ext>`, and only then calls `DELETE /api/translations/{id}`, which removes every blob. The user can save again from memory while the page stays open.
- [x] On ready, focus moves to the result heading
- [x] A standing note on PDF uploads: "Scanned pages in mixed PDFs may stay untranslated"
- [x] Logs carry only the GUID, format, size, languages and durations
- [x] Seam 1 tests cover the upload SAS, start, poll mapping, early Source file deletion, the file SAS and `DELETE`. Seam 2 tests cover the picker checks, status announcements, naming, and the save-then-`DELETE` sequence.

## Comments

Built on branch `ticket-04` (code only: nothing was deployed or run against Azure).

Left unticked because they can only be confirmed against real Azure (ticket 01):
- **`POST /api/translations/uploads` ... CORS rule:** the endpoint, the user delegation SAS (`cw`, HTTPS only, 10 minutes, one blob) and the Bicep CORS rule for the SWA origin are built and tested at Seam 1 and in the compiled Bicep. Still to confirm that a real browser `PUT` passes CORS and the SAS.
- **`POST /api/translations` starts a batch job:** built and tested at Seam 1. The real adapter calls `2026-03-01` with `storageType: File`, plain (keyless) blob URLs, no `deploymentName` (NMT) and `translateTextWithinImage: false`. Still to confirm in 01: Translator's identity can reach the containers, the job accepts single-file URLs, and a legacy `.doc`/`.odt`/`.ppt` written to `target/<guid>/file.docx` keeps that exact name (we name the target with the converted extension).
- **When ready ... 5-minute read SAS ... DELETE:** built and tested at both seams. The browser `GET` from Blob through CORS is unverified.
- The Function App's `GET /api/languages` calls Translator's public `/languages` endpoint (no auth); confirm outbound access from Flex Consumption.

Notes for later tickets are in the build's conventions note ("Ticket 04").

- 2026-11-06: resolved on `lingo-lens-mvp` (code complete, all tests green). The unticked criteria above need real Azure or GitHub and are verified in [01: Verify against real Azure](01-verify-against-real-azure.md) and [14: Prod environment and first release](14-prod-environment-and-first-release.md).
