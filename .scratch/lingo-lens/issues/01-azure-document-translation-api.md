# Azure Document Translation: sync vs async API

Type: research
Status: resolved
Map: ../map.md

## Question

Which Azure AI Translator Document Translation API should Lingo Lens use for Documents: the synchronous single-document API or the asynchronous batch API? For each, establish:

- Supported formats (the list sets the MVP's accepted Document formats)
- Size, page and character limits
- Whether Azure Blob Storage is required (and for how long files sit there)
- Auth options: keys vs Managed Identity / Entra ID, and whether a browser can call it directly
- Whether Images (JPG/PNG) are accepted directly, and what comes back
- Error shapes for scanned PDFs without a text layer, password-protected and unsupported files
- Pricing model

## Answer

Use the **synchronous** API (`POST /translator/document:translate`, API `2026-03-01`, GA) for Documents. Full findings with sources are in [research/azure-document-translation.md](../research/azure-document-translation.md).

- **Formats (sync):** `.docx`, `.xlsx`, `.pptx`, `.msg`, `.html/.htm`, `.mhtml/.mht`, `.txt`, `.csv`, `.tsv/.tab`, `.xlf`. **No PDF**, and no legacy `.doc/.xls/.ppt`, ODF, `.rtf` or `.md`; those are batch-only. Max 10 MB, 1 file, 1 target language. There is no stated page or character cap beyond 6M chars/min.
- **Storage:** sync needs no Blob Storage; the Translated file is the response body. Batch needs source and target containers, and files stay there until Lingo Lens deletes them (lifecycle rules work in days, so they cannot meet a 1-hour timeout). Azure hard-deletes its own temporary copies after processing.
- **Auth:** key or Entra bearer token (Cognitive Services User role, custom-domain endpoint) or managed identity. Do not call it from the browser with keys. Browser calls with Entra tokens are possible in principle, but CORS is undocumented. Recommend a thin Entra-protected back end that calls with managed identity.
- **Images:** batch-only. They come back as an image with the translated text rendered in, with no text or regions, so they don't fit the side-by-side MVP. Images need OCR plus Text Translation instead.
- **Errors:** sync returns 400/401/415 (unsupported type)/429/500/503 with JSON `{error:{code,message,innerError}}`. Batch puts per-document `Failed`/`ValidationFailed` with `error.code`/`innerError.code` on each document. Password-protected files are unsupported, but their exact error code is undocumented, so a spike should capture it. Scanned PDFs are a batch-only, OCR'd case. Mixed PDFs come back partly untranslated without an error.
- **Pricing:** pay-as-you-go per million source characters (images per 1,000, at 500 characters per image). Requires S1 or C2-C4/D3; F0 is not supported. LLM mode (preview) is billed per token.
- **Open product question:** PDF support. The options are to drop it from the MVP, use a hybrid (sync plus batch for PDF), or use batch for everything.
