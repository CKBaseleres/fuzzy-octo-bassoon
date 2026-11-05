# Backend and hosting architecture

Type: grilling
Status: resolved
Blocked by: 01, 02, 08
Map: ../map.md

## Question

The SPA can't hold Azure secrets, so what thin backend sits between it and Azure AI, and where is it hosted? For example: Azure Static Web Apps with managed Functions, standalone Azure Functions, or App Service. Every Document goes through the batch API (see [PDF support and translation mode](08-pdf-support-and-translation-mode.md)), so the backend also owns Blob Storage containers, polling of batch status and cleanup; Images go through Document Intelligence `prebuilt-read` + Translator text (see [Azure options for Image Translation](02-azure-image-translation-options.md)). The MVP has no sign-in, so how (if at all) is the backend protected from callers other than the SPA, and how does the backend authenticate to Translator, Vision and Storage (Managed Identity vs keys in Key Vault)?

## Answer

Decided with the user on 2026-11-05 (grilling). Facts were checked against Microsoft Learn (Static Web Apps API docs, Document Translation managed-identity guide).

- **Hosting:** **Azure Static Web Apps (Standard plan)** serves the SPA. A **linked "bring your own" Azure Functions app (Flex Consumption)** serves `/api`. SWA managed Functions were rejected: they allow HTTP triggers only and have no Managed Identity, and the backend needs both (for a cleanup timer and for keyless access). App Service (always on) and Container Apps (extra overhead) were also rejected.
- **Language:** TypeScript on Node (Azure Functions v4 programming model), using `@azure/ai-translation-document`, Document Intelligence and Translator text, plus `@azure/identity`. The backend shares request and response types with the React SPA.
- **Auth to Azure: keyless.**
  - The Function App's system-assigned Managed Identity gets *Cognitive Services User* on Translator and Document Intelligence, plus *Storage Blob Data Contributor* on the storage account.
  - The Translator resource's **system-assigned** Managed Identity (user-assigned is not supported for batch) gets *Storage Blob Data Contributor*. Batch requests then use plain container URLs with no SAS.
  - Storage account key access is disabled. With no keys anywhere, there is no Key Vault.
  - Resources: a single-service Translator resource (S1, custom-domain endpoint) and a separate Document Intelligence resource.
- **Backend protection (no sign-in):** linking the Function App to SWA adds an "Azure Static Web Apps (Linked)" identity provider, so the API accepts only requests proxied through SWA. There is no app-level API key, because it would sit in the SPA bundle and protect nothing. Anyone who can reach the SWA can call `/api`; that is accepted. Any network restriction or rate limit belongs to [Limits, cost and abuse guardrails](06-limits-and-cost-guardrails.md). Note: a linked backend cannot be IP-restricted or network-isolated, so any network restriction must sit on SWA (`allowedIpRanges`, Standard plan).
- **Progress tracking: stateless, no database.**
  - `POST /api/translations` starts the Azure operation (a batch translation for a Document, a `prebuilt-read` analyze for an Image) and returns a Translation id derived from Azure's operation id.
  - The SPA polls `GET /api/translations/{id}`. Each poll asks Azure for status and maps it to uploading → translating → ready / failed.
  - For an Image, the poll that first sees OCR `succeeded` calls Translator text and returns the paragraphs, polygons and translations.
  - This fits SWA's **45-second limit per API request**.
- **Region:** every resource sits in one Azure region, the organisation's data-residency region, which must offer Translator batch, Document Intelligence v4.0 and Flex Consumption. Which region it is gets decided in [Deployment and CI](10-deployment-and-ci.md).
- **Handed on to [How file handling works](05-file-handling.md):** where files live, how uploads and downloads move given the 45-second proxy limit, and how the 1-hour cleanup runs. The host supports timer triggers.

_Amended by [Limits, cost and abuse guardrails](06-limits-and-cost-guardrails.md): quota counters live in Table Storage in the existing storage account. Translations themselves stay stateless._
