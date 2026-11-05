# PDF support and translation mode

Type: grilling
Status: resolved
Map: ../map.md

## Question

The synchronous Document Translation API (the recommended one: no Blob Storage, so nothing is kept for free) does not accept PDF, legacy Office (.doc/.xls/.ppt), ODF, .rtf or .md. Those are batch-only, and batch needs Blob Storage plus cleanup Lingo Lens must own. Which way does the MVP go?

- (a) Sync only, with PDF and the other batch-only formats left out of the MVP
- (b) Hybrid: sync for most formats, batch through short-lived Blob Storage for PDF (and the other batch-only formats?)
- (c) Batch for everything

See [Azure Document Translation: sync vs async API](01-azure-document-translation-api.md) and its research file.

## Answer

Decided with the user on 2026-11-05 (grilling).

- **PDF is a must-have** for the MVP. The prototype's main sample is a PDF, and staff documents are often PDFs.
- **Every Document goes through the asynchronous batch API** (option c). Blob Storage, polling and cleanup are needed for PDF anyway, so sync's "nothing kept for free" advantage is lost. One pipeline means one status model and one per-file limit (Azure's batch cap is 40 MB; the MVP's own limit is set in [Limits, cost and abuse guardrails](06-limits-and-cost-guardrails.md)).
  - *Fallback:* if the Azure spike shows poor batch queueing latency, revisit the hybrid (sync for docx/xlsx/pptx and the like, batch for PDF).
- **Accepted formats:** every Document format the batch API supports (pdf, doc/docx, xls/xlsx, ppt/pptx, odt/ods/odp, rtf, md, html/htm, mhtml/mht, msg, txt, csv, tsv/tab, xlf). Image files are excluded because Images use their own pipeline (see [Azure options for Image Translation](02-azure-image-translation-options.md)).
- **Scanned and mixed PDFs:** batch OCRs fully scanned PDFs. In mixed PDFs, scanned pages may come back untranslated with no error. This is accepted for the MVP, with a short standing note on PDF uploads ("Scanned pages in mixed PDFs may stay untranslated"). Detecting it is out of scope.
- **`translateTextWithinImage`: off.** It uses the painted-overlay approach ruled out for Images and is billed per embedded image.
- **Engine: standard NMT (GA).** The LLM model option (`deploymentName`) is Public Preview and is not used. No preview features in the MVP.
