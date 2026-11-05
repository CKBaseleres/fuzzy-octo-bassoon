# Error handling: mapping Azure errors to categories

Type: grilling
Status: resolved
Blocked by: 12
Map: ../map.md

## Question

Using the **documented** error codes (see the research files [azure-document-translation.md](../research/azure-document-translation.md) and [azure-image-translation.md](../research/azure-image-translation.md), plus Microsoft Learn), which Azure responses map to which failure category from [Error handling: user-facing behaviour](12-error-handling-user-facing-behaviour.md)? This covers:

- the batch submit HTTP codes
- job and document `status` values
- `error.code` / `innerError.code` for password-protected, unsupported, oversized and corrupt files
- Document Intelligence analyze failures
- Translator text errors

Decide what the backend does with anything **unrecognised**: which category it falls back to, and what it logs.

The Azure spike was skipped ([Azure spike: latency, error payloads, OCR quality](09-azure-spike.md) is out of scope), so the mapping is built from documentation. It must be easy to refine once real errors appear in the logs during the build's **Verify against real Azure** ticket. Where the docs are silent (for example, password-protected files), decide what the message says until the real code is known.

## Answer

Decided with the user on 2026-11-05 (grilling). The user accepted every recommendation. The mapping is built from Microsoft Learn alone, because the spike was skipped. The sources were: the Document Translation batch error response (7 top-level codes; `innerError.code` is an open string with no published list), the Document Intelligence error guide v4.0, and the Translator text v3 response codes.

**Where it lives.** One pure, table-driven classifier in the backend. Its input is `(service, httpStatus, error.code, innerError.code, job/document status)` and its output is `{ category, reason?, ruleId }`, with a unit test for each rule. The API returns only `category` and an optional `reason` enum (`passwordProtected`, `damaged`, `badDimensions`), and the SPA owns every word the user sees. There are no rules in app settings. Refining a rule is a one-line pull request plus a test.

**Batch Document mapping.**

| Azure response | Category |
|---|---|
| Submit `429` or `5xx` (after 3 retries) | 6 Service problem |
| Submit `400`, `401`, `403` or `404` | 6, logged at error level as our fault |
| Document `Failed` with `InvalidRequest` or `InvalidArgument` | 4 Can't translate (reason from `innerError` if known, otherwise generic) |
| Document `Failed` with `ServiceUnavailable`, `InternalServerError` or `RequestRateTooHigh` | 6 (no automatic resubmit; the user's **Try again** does it) |
| Document `Failed` with `Unauthorized` or `ResourceNotFound` | 6, error level (likely managed identity or Blob RBAC) |
| Job `ValidationFailed` | The document's error if there is one, otherwise 6 |
| `Cancelled` that we didn't start | 6 |
| `Succeeded` with 0 characters charged | Completed, not an error |

**Image mapping.**
- Document Intelligence `InvalidContent` or `UnsupportedContent` → 4 `damaged`. `InvalidContentDimensions` → 4 `badDimensions`.
- Document Intelligence `succeeded` but no paragraph has a letter or digit → 5 No text found.
- Translator `400050`/`400077` → 6, logged as our bug. The backend splits its Translator calls to stay within the documented request limits so this shouldn't happen.
- Any other Translator `400xxx`, `401xxx` or `403xxx` → 6, error level.
- `429` or `5xx` from either service → retried, then 6.
- If any part of the Translator calls still fails, the whole Image is Failed (6). No partially translated result screen is shown.

**Category 1 gains two browser checks** (this extends [Error handling: user-facing behaviour](12-error-handling-user-facing-behaviour.md)):
- **Password-protected or encrypted files:** a `.docx`, `.xlsx` or `.pptx` that starts with the OLE bytes `D0 CF 11 E0` instead of `PK`, or a PDF with `/Encrypt` in its last ~64 KB. Message: "This file is password-protected or encrypted. Remove the protection and try again."
- **Image dimensions** outside 50–10,000 px.

Category 4's `passwordProtected` reason stays as a backstop for anything these checks miss.

**Category 4 wording.**
- Generic (reason unknown): "Lingo Lens couldn't translate this file. It may be damaged, protected, or not the format its name suggests. Check it opens normally and try another file."
- `damaged`: "This file looks damaged or isn't a real <format> file."
- `badDimensions`: "This image is too small or too large to read."
- `passwordProtected`: as in the Category 1 message.

**Unrecognised errors.**
- Anything that matches no rule falls back to **6 Service problem**. One exception: a document `Failed` whose top-level code is `InvalidRequest` or `InvalidArgument` and whose `innerError` is unknown goes to **4 generic**, because a retry won't help.
- Every error log carries the Translation GUID, category, `ruleId`, service, HTTP status, `error.code`, `innerError.code`, job and document status, Azure's request id (`apim-request-id` or `X-RequestId`), and `mapped: true|false`.
- Azure's `message` is logged truncated to 300 characters, with `sig=`/SAS query parameters scrubbed. Blob names are GUIDs, so no filename is logged.
- A saved Log Analytics query, "Unmapped Azure errors (7 days)", is linked from the Verify ticket. There is no alert.

**Handed on to the build's "Verify against real Azure" ticket: a capture checklist.** Submit each file below and record the real codes. Add a rule for each code, and drop the browser checks if Azure turns out to report these files clearly.
- password-protected `.docx`, `.xlsx`, `.pptx` and `.pdf`
- a renamed `.exe` saved as `.docx`
- a truncated PDF
- a 40×40 PNG
- a blank photo
