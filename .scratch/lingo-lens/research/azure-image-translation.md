# Research: Azure options for Image Translation

Ticket: [02 Azure options for Image Translation](../issues/02-azure-image-translation-options.md)
Researched: 2026-11-05, against Microsoft Learn and the public Azure Retail Prices API. Terms follow `GLOSSARY.md` (Image, Source file, Translation).

**The question:** Lingo Lens shows an Image's extracted text side by side with the original Image, with each text region highlighted. Which Azure service, or combination of services, should do this?

## TL;DR

- **Azure AI Vision Image Analysis 4.0 Read is deprecated.** It retires on **2028-09-25**. Microsoft's migration guide sends OCR and Read users to **Document Intelligence**. Don't build new work on it. [1][2]
- **Document Translation now translates Images (GA in `2026-03-01`).** It returns the Image with the translated text painted back in. It returns **no text, regions or coordinates**, so it can't drive the side-by-side view with highlighted regions. It's also batch only (Blob Storage), with a 5 MB image limit. [3][4][5]
- **Recommendation: Document Intelligence `prebuilt-read` (v4.0 `2024-11-30`, GA) for OCR, then Translator text translation (NMT) for each line or paragraph.** Read gives polygons at paragraph, line and word level, plus a handwriting flag. We translate each region's text as one array element, so each translation stays tied to its polygon by array index.

## Comparison

| | Vision Image Analysis 4.0 Read | Document Intelligence `prebuilt-read` / `prebuilt-layout` | Translator Document Translation (image files) |
|---|---|---|---|
| Status | GA, but **deprecated, retires 2028-09-25**. The 4.0 preview API versions retired 2025-03-31 [1][2][6] | **GA** v4.0 `2024-11-30`. v3.0 reaches end of support 2029-03-30 [7] | **GA** in `2026-03-01` [3]. It first appeared as `2025-12-01-preview`, when a Microsoft Q&A answer reported it wasn't live in any region yet [8] |
| Call style | Synchronous, a single call [9] | Asynchronous: POST returns 202, then poll for the result [7] | Asynchronous batch only for images. The sync endpoint lists no image formats [4][10] |
| Regions and coordinates | Yes: `blocks → lines → words`, each with a 4-point `boundingPolygon` of `{x,y}` in pixels. No paragraph level [9] | Yes: `paragraphs` (with `boundingRegions`), `lines` and `words`, each with a flat `polygon` `[x1,y1,…,x4,y4]` relative to the page's top-left, in `pixel` units for images [7][11] | **No.** The output is the translated Image file, "with translated content rendered back into the image" [3] |
| Image formats | JPEG, PNG, GIF, BMP, WEBP, ICO, TIFF, MPO [6] | JPEG/JPG, PNG, BMP, TIFF, HEIF (plus PDF and Office files) [7] | JPEG, PNG, BMP, WEBP [4] |
| Size and resolution | < 20 MB; > 50×50 and < 16,000×16,000 px [6] | ≤ 500 MB on S0 (4 MB on F0); 50×50 to 10,000×10,000 px; minimum text height 12 px on a 1024×768 image [7] | Image file ≤ 5 MB [5] |
| Handwriting | Yes. Handwriting languages: en, zh-Hans, fr, de, it, ja, ko, pt, es [12] | Yes, with a per-span `styles[].isHandwritten` flag and confidence. Handwriting languages: the same nine plus **ru, th, ar** [7][13] | Not documented |
| Auth (Managed Identity) | Microsoft Entra ID / Managed Identity through the shared Foundry Tools auth (custom subdomain plus the **Cognitive Services User** role) | Microsoft Entra ID / MI: the **Cognitive Services User** role on the resource. Contributor alone can't call the analyze operation [14] | The Translator resource supports Entra ID. Batch also needs storage access by SAS or MI [10] |
| Price (S0, West Europe, retail API) | Not checked (deprecated) | Read: **$1.50 per 1,000 pages** (0–1M), then $0.60 per 1,000. Each image counts as 1 page [15][7]. Layout: $10 per 1,000 | Per image. No retail meter was published for West Europe when we checked [3][15] |

Translator text translation, the second step in our pipeline: S1 costs **$10 per 1M characters** [15]. Limits per request: 1,000 array elements, 50,000 characters each and 50,000 characters in total. With LLM translation the limits drop to 50 elements of 5,000 characters [16]. It supports Entra ID / Managed Identity: you send a bearer token to the custom-domain endpoint, or to the global endpoint with an `Ocp-Apim-ResourceId` header, and the identity needs the **Cognitive Services User** role [17].

## Findings per question

### 1. Regions with coordinates, and at what granularity

- **Document Intelligence Read** returns three levels.
  - **Paragraphs** are a top-level collection. Each has `content`, `boundingRegions[].polygon` and `spans`.
  - **Lines and words** sit under `pages[]`, each with `polygon`. Words also carry a `confidence`.
  - **Page size:** each page records `width`, `height`, `unit` (`pixel` for images) and `angle`, which we need to scale polygons onto the displayed Image. [7]
  - **Polygon format:** a flat number array of x, y vertices "relative to the top-left of the page … clockwise from the left". [11]
- **Layout** is a superset: it adds tables, selection marks and paragraph roles. Layout costs about 7× more than Read ($10 vs $1.50 per 1,000 pages) and adds nothing for photos or signs. [15]
- **Vision 4.0 Read** returns blocks, lines and words, each with `boundingPolygon` as `{x,y}` points. It has no paragraph grouping. [9]
- **Document Translation** returns no regions. [3]

### 2. Formats and limits

See the comparison table. Things that matter for Lingo Lens:

- Document Intelligence has the smaller resolution ceiling (10,000 px) but a far larger file-size limit.
- Document Intelligence accepts HEIF (iPhone photos). Vision and Document Translation don't.
- Neither OCR service takes WEBP and GIF in common. Vision takes both; Document Intelligence takes neither.

Lingo Lens should validate uploads against the set that Document Intelligence accepts: **JPEG, PNG, BMP, TIFF, HEIF**. It should reject anything under 50×50 or over 10,000×10,000 px. [7]

### 3. Handwriting and photos of signs (the chalkboard sample)

- **Handwriting** works in both OCR services. Document Intelligence covers more handwriting languages (adds ru, th, ar) and flags handwritten spans. [7][12][13]
- **Photos of signs:** Microsoft's positioning conflicts here.
  - The Document Intelligence Read page still says: "To extract text from external images like labels, street signs, and posters, use the Azure Image Analysis v4.0 Read feature". It also describes Document Intelligence Read as running "at a higher resolution than Azure Vision Read". [7]
  - The newer Vision retirement guide names Document Intelligence as *the* replacement for OCR and Read. [2]
  - We take the retirement guide as authoritative, and treat the Read-page note as stale.
- **Chalkboard quality:** neither service publishes accuracy figures for chalk on slate. **This was not tested.** No Azure resource was used. Before the spec is locked, a quick check should run the prototype's chalkboard Image through Document Intelligence Studio (Read). [7]

### 4. Feeding OCR output to Translator with regions kept aligned

- Translator's `translate` operation takes an array of `{text}` elements and returns one result per element, in order [16][18]. So: OCR, then build one array element per **line** (or per **paragraph**), then translate. Result *i* belongs to polygon *i*.
- A single call takes up to 1,000 elements and 50,000 characters, which is plenty for one Image. [16]
- **Granularity trade-off:**
  - **Per paragraph** gives better translation quality, because whole sentences are translated together. It also gives fewer, larger highlights. This suits signs and notes.
  - **Per line** gives tighter highlights, but sentences split across lines translate worse.
  - Recommendation: translate per paragraph, and keep each paragraph's line polygons for the highlight.
- `includeAlignment=true` can map word spans from source to target, but it's documented as having restrictions. The MVP doesn't need it. [18]
- **Language auto-detect:** omit `from` and Translator returns `detectedLanguage` for each element [18]. Don't pass a locale to OCR; Document Intelligence auto-detects the script [13].
- **Coverage gap:** Translator supports more languages than OCR reads (see [13]). An Image in a language OCR can't read yields empty or garbled text. Error handling has to cover the "no text found" case.

### 5. Auth and pricing

- **Auth:** Document Intelligence and Translator both support keyless Microsoft Entra ID / Managed Identity.
  - The backend's managed identity needs the **Cognitive Services User** role on each resource. Owner and Contributor don't grant data-plane access. [14][17]
  - Both resources need a custom subdomain endpoint. For Translator, the alternative is the global endpoint plus the `Ocp-Apim-ResourceId` header. [17]
- **Cost of one Image Translation** (OCR plus text translation): about $0.0015 for Read (1 page), plus about $0.00001 per character translated. A sign with 300 characters costs under $0.002 in total. [15]
- Prices come from the Azure Retail Prices API for West Europe, S0/S1 pay-as-you-go, USD. Check them in the pricing calculator for the target region.

## Sample response shape (Document Intelligence `prebuilt-read`, image input)

The JSON below is abridged and illustrative. The structure follows [7][11].

```json
{
  "status": "succeeded",
  "analyzeResult": {
    "apiVersion": "2024-11-30",
    "modelId": "prebuilt-read",
    "content": "Today's special\nSoupe à l'oignon 6 €",
    "pages": [
      {
        "pageNumber": 1,
        "angle": 0,
        "width": 1024,
        "height": 768,
        "unit": "pixel",
        "words": [
          { "content": "Today's", "polygon": [102,88, 251,90, 250,140, 101,138], "confidence": 0.991, "span": { "offset": 0, "length": 7 } }
        ],
        "lines": [
          { "content": "Today's special", "polygon": [102,88, 470,92, 469,142, 101,138], "spans": [{ "offset": 0, "length": 15 }] },
          { "content": "Soupe à l'oignon 6 €", "polygon": [96,190, 610,196, 608,252, 95,246], "spans": [{ "offset": 16, "length": 20 }] }
        ],
        "spans": [{ "offset": 0, "length": 36 }]
      }
    ],
    "paragraphs": [
      { "content": "Today's special", "boundingRegions": [{ "pageNumber": 1, "polygon": [102,88, 470,92, 469,142, 101,138] }], "spans": [{ "offset": 0, "length": 15 }] },
      { "content": "Soupe à l'oignon 6 €", "boundingRegions": [{ "pageNumber": 1, "polygon": [96,190, 610,196, 608,252, 95,246] }], "spans": [{ "offset": 16, "length": 20 }] }
    ],
    "styles": [
      { "isHandwritten": true, "confidence": 0.95, "spans": [{ "offset": 0, "length": 36 }] }
    ]
  }
}
```

To draw a highlight, scale `polygon` by `displayedWidth / page.width` and `displayedHeight / page.height`, then draw it as an SVG `<polygon>` over the `<img>`.

For comparison, Vision 4.0 (deprecated) returns `readResult.blocks[].lines[] { text, boundingPolygon: [{x,y}×4], words[] { text, boundingPolygon, confidence } }`, with image size in `metadata.width` and `metadata.height`. [9]

## Recommendation for Lingo Lens

**Use Document Intelligence `prebuilt-read` (v4.0 `2024-11-30`, GA) for OCR, then Translator text translation (NMT, auto-detect) for each paragraph. Call both from the backend with Managed Identity.**

1. The backend receives the Image. It checks the format (JPEG/PNG/BMP/TIFF/HEIF), the size and the dimensions (50 to 10,000 px).
2. It POSTs to `prebuilt-read:analyze?api-version=2024-11-30` with the bytes (no Blob Storage needed), then polls `Operation-Location` until `succeeded`.
3. It builds `regions[] = paragraphs.map(p => { id, sourceText: p.content, polygon: p.boundingRegions[0].polygon })`. It keeps `page.width`, `page.height` and `isHandwritten`.
4. It sends one Translator `translate` call (`to=<target>`, no `from`) with `regions.map(r => ({ text: r.sourceText }))`. It zips the results back by index and records `detectedLanguage`.
5. It returns `{ imageSize, detectedLanguage, regions: [{ id, polygon, sourceText, translatedText }] }` to the SPA. The SPA draws SVG polygons over the original Image and lists the translated text alongside. Hovering or selecting a region highlights the matching row, and the reverse.
6. Nothing is stored. The Image and results live only for the length of the request, or until the agreed timeout.

**Why not the alternatives:**

- **Vision 4.0 Read** retires in 2028, and Microsoft has already named Document Intelligence as its replacement.
- **Document Translation image files** paint the translation into the pixels. That is the inpainting path the map ruled out of scope. It returns no regions, needs Blob Storage plus batch polling, and caps images at 5 MB. It might suit a later "download translated Image" feature.

**Open item for the spec:** test the chalkboard sample in Document Intelligence Studio to confirm that chalk handwriting is read well enough.

## Sources

1. What is Azure Vision in Foundry Tools? (deprecation caution): https://learn.microsoft.com/azure/ai-services/computer-vision/overview
2. Migrate from Azure Vision Image Analysis (retirement 2028-09-25; OCR goes to Document Intelligence): https://learn.microsoft.com/azure/ai-services/computer-vision/migration-options
3. What is Azure Translator document translation 2026-03-01? (image translation GA, rendered back into the image, per-image pricing): https://learn.microsoft.com/azure/ai-services/translator/document-translation/latest/overview
4. Start batch translation, translate image files (formats): https://learn.microsoft.com/azure/ai-services/translator/document-translation/reference/start-batch-translation#translate-image-files
5. Translator service limits (image file ≤ 5 MB; text and document limits): https://learn.microsoft.com/azure/ai-services/translator/service-limits
6. What is Image Analysis? (input requirements v4.0; preview API retirement): https://learn.microsoft.com/azure/ai-services/computer-vision/overview-image-analysis and https://learn.microsoft.com/azure/ai-services/computer-vision/whats-new
7. Document Intelligence read model (v4.0 input requirements, paragraphs, lines, words, styles, pages): https://learn.microsoft.com/azure/ai-services/document-intelligence/prebuilt/read?view=doc-intel-4.0.0
8. Microsoft Q&A: Image Document Translation Issue (2025-12-01-preview not yet live): https://learn.microsoft.com/answers/a/12503032
9. OCR for images (version 4.0), sample response: https://learn.microsoft.com/azure/ai-services/computer-vision/concept-ocr
10. Document Translation REST API guide (2026-03-01) and Translate a single document (sync): https://learn.microsoft.com/azure/ai-services/translator/document-translation/latest/rest-api/guide-overview and https://learn.microsoft.com/azure/ai-services/translator/document-translation/latest/rest-api/translate-synchronous
11. DocumentLine polygon definition (JS SDK): https://learn.microsoft.com/javascript/api/@azure-rest/ai-document-intelligence/documentlineoutput?view=azure-node-latest
12. Language support for Azure Vision (OCR handwriting): https://learn.microsoft.com/azure/ai-services/computer-vision/language-support
13. Document Intelligence language support, document analysis (Read and Layout, printed and handwritten): https://learn.microsoft.com/azure/ai-services/document-intelligence/language-support/ocr?view=doc-intel-4.0.0
14. Document Intelligence Studio prerequisites (Cognitive Services User role, Entra ID): https://learn.microsoft.com/azure/ai-services/document-intelligence/quickstarts/get-started-studio?view=doc-intel-4.0.0
15. Azure Retail Prices API, West Europe (queried 2026-11-05): https://prices.azure.com/api/retail/prices (pricing page: https://azure.microsoft.com/pricing/details/document-intelligence/)
16. Translator text translation overview, service limits: https://learn.microsoft.com/azure/ai-services/translator/text-translation/overview#authentication
17. Translator authentication with Microsoft Entra ID and managed identities: https://learn.microsoft.com/azure/ai-services/translator/text-translation/reference/authentication#authentication-with-microsoft-entra-id
18. Translator 3.0 Translate (request and response body, detectedLanguage, alignment): https://learn.microsoft.com/azure/ai-services/translator/text-translation/reference/v3/translate
