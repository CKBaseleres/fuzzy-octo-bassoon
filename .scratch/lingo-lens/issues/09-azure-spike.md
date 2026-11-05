# Azure spike: latency, error payloads, OCR quality

Type: task
Status: closed (out of scope)
Map: ../map.md

## Question

The Azure docs leave several facts open that later decisions depend on. Using a throwaway Azure Translator (S1, regional) + Storage + Document Intelligence resource, capture:

- **Batch latency:** time from submit to `Succeeded` for a small docx, the 2-page sample PDF and a large pptx. This decides whether batch-for-everything holds or the hybrid fallback in [PDF support and translation mode](08-pdf-support-and-translation-mode.md) is needed.
- **Real error payloads:** status, error code and message for a password-protected PDF, an unsupported file, an oversized file and a mixed scanned/digital PDF.
- **OCR quality:** run a chalkboard-style photo through Document Intelligence `prebuilt-read` (Studio is fine) and record whether the text and paragraph regions are usable.

Record raw responses under `.scratch/lingo-lens/research/azure-spike/` and link them here. Needs an Azure subscription, so it is HITL unless one is provided.

## Progress

- 2026-11-05: the user chose to run the spike by hand in the Azure portal, in West Europe. Checklist: [research/azure-spike/CHECKLIST.md](../research/azure-spike/CHECKLIST.md). Batch test runner: [research/azure-spike/run-spike.sh](../research/azure-spike/run-spike.sh). Waiting for results.

## Closed: out of scope (2026-11-05)

The user chose to skip the spike in the planning map. Its checks move into the build as the spec's first risk item, **Verify against real Azure**, for `/to-tickets` to turn into the first build ticket:

- **Batch latency** for a small docx, the sample PDF and a large pptx. If it is poor, switch to the hybrid fallback in [PDF support and translation mode](08-pdf-support-and-translation-mode.md).
- **West Europe offers Flex Consumption.** The first Bicep deploy confirms it; the fallback is Sweden Central ([Deployment and CI](10-deployment-and-ci.md)).
- **Real error payloads** for password-protected, unsupported, oversized and mixed files. Refine [Error handling: mapping Azure errors to categories](13-error-handling-azure-error-mapping.md).
- **OCR quality** on chalkboard and handwritten photos. This is an accepted risk; "No text found" covers bad reads.
- **Tune the timeouts** (15 minutes for a Document, 3 minutes for an Image) from [Error handling: user-facing behaviour](12-error-handling-user-facing-behaviour.md).

The checklist and runner stay in [research/azure-spike/](../research/azure-spike/) for that build ticket to reuse.
