# 11: Browser checks for protected files and Image dimensions

Spec: [../spec.md](../spec.md) (Browser checks (category 1))

**What to build:** A staff member who picks a password-protected file, or an Image Azure can't read because of its size, is told at once at the picker, before any upload and without using quota.

**Blocked by:** [05: Image Translation: pipeline and result screen](05-image-translation-pipeline-and-result-screen.md)

**Status:** ready-for-agent

- [ ] A `.docx`, `.xlsx` or `.pptx` whose first bytes are the OLE signature `D0 CF 11 E0`, rather than a ZIP's `PK`, is rejected inline: "This file is password-protected or encrypted. Remove the protection and try again."
- [ ] A PDF with `/Encrypt` in its last ~64 KB gets the same rejection
- [ ] An Image whose decoded width or height is under 50 px or over 10,000 px is rejected inline, with the `badDimensions` wording
- [ ] Nothing is uploaded and no `/api` call is made for these rejections
- [ ] Seam 2 tests use small fixture files for each check, including a normal docx and PDF that must pass
