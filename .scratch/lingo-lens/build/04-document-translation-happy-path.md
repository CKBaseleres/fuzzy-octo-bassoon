# 04: Document Translation: happy path

Spec: [../spec.md](../spec.md) (Translation pipelines; API contract; Files and retention)

**What to build:** On dev, a staff member picks a Document and a target language, watches the status go uploading → translating → ready, and gets the Translated file saved with the layout kept, named like `Report.fr.pdf`. Their files are deleted from Azure as soon as the save succeeds. This is the tracer bullet through every layer.

**Blocked by:** [03: Infrastructure bootstrap and dev deploy](03-infrastructure-bootstrap-and-dev-deploy.md)

**Status:** ready-for-agent

- [ ] **File picker:** accepts the batch Document formats (pdf, doc/docx, xls/xlsx, ppt/pptx, odt/ods/odp, rtf, md, html/htm, mhtml/mht, msg, txt, csv, tsv/tab, xlf). Shows "Documents up to 40 MB · Images up to 20 MB". Rejects inline any file of the wrong type, over 40 MB, or empty.
- [ ] **Language picker:** offers every Translator target language; the source language is auto-detected
- [ ] `POST /api/translations/uploads` returns a GUID and a write-only user delegation SAS for one blob (10-minute expiry). The browser `PUT`s straight to Blob, allowed by a CORS rule for the environment's origin.
- [ ] Blob names are GUID-only, with the extension kept; the original filename never leaves the browser
- [ ] `POST /api/translations` starts a batch job (NMT, `translateTextWithinImage` off, keyless container URLs) and returns an opaque Translation id that combines the GUID and Azure's operation id. The backend holds no state.
- [ ] The SPA polls `GET /api/translations/{id}`, and status changes are announced in a polite live region. When the job ends, the Source file blob is deleted.
- [ ] **When ready:** `GET /api/translations/{id}/file` returns a 5-minute read SAS. The SPA fetches the file into memory, saves it as `<name>.<target>.<ext>`, and only then calls `DELETE /api/translations/{id}`, which removes every blob. The user can save again from memory while the page stays open.
- [ ] On ready, focus moves to the result heading
- [ ] A standing note on PDF uploads: "Scanned pages in mixed PDFs may stay untranslated"
- [ ] Logs carry only the GUID, format, size, languages and durations
- [ ] Seam 1 tests cover the upload SAS, start, poll mapping, early Source file deletion, the file SAS and `DELETE`. Seam 2 tests cover the picker checks, status announcements, naming, and the save-then-`DELETE` sequence.
