# Research: Format feasibility — extracting and writing back text layers

Ticket: "Format feasibility: extracting and writing back text layers" (design-translation tool).
Researched: 2026-11-06. Sources are official specs, vendor developer docs and library repos/npm metadata, all read on that date. Where only a community or third-party source was found, it is marked **(secondary)**.

**The requirement under test.** The tool takes an uploaded design file, machine-translates its text layers into several languages, lets users edit translations side by side, shows a rendered preview that flags overflowing text, and exports translated files that reopen **with text still editable** in the native tool. For each format the questions are:

1. **Extract**: can we get every text layer, its content, styling runs (font, size, bold/italic inside a paragraph) and frame geometry?
2. **Write back**: can we put translated text into the same layers without corrupting the file or losing styling?
3. **Reopen editable**: does the native tool open the result with live text?

---

## 0. Ranking (summary)

| Rank | Format / route | Extract | Write back | Reopens editable | Preview without native app | Overflow detection | Main blocker |
|---|---|---|---|---|---|---|---|
| 1 | **Figma, via a plugin** (REST only for read and preview) | Yes, full | Yes, full (plugin only) | Yes (it stays in Figma) | Yes (REST `GET /v1/images`) | Yes (plugin can measure after reflow) | REST cannot write. Runs inside the Figma editor, not as "upload a file" |
| 2 | **InDesign IDML** (server, Node) | Yes, full (open XML) | Yes, XML rewrite | Yes, if the XML is valid | **No** open-source renderer. Needs InDesign (Firefly InDesign API or InDesign Server) | Only InDesign can compose text (`TextFrame.overflows` through scripting) | Preview and overflow need Adobe. IDML spec frozen at CS6 (2012). `.indd` must be converted first |
| 3 | **Photoshop PSD** (ag-psd, Node or browser) | Yes (text, style runs, transform, box bounds) | Yes, but the text bitmap is **not re-rendered** | Yes, after Photoshop asks to "update text layers" | Partial: our own approximate canvas render. A faithful one needs the Photoshop API | Approximate only | Text engine data (`Txt2`/EngineData) is undocumented. ag-psd says its text support is incomplete |
| 4 | **Canva** (Connect API / Apps SDK) | Connect: **no** text read. Apps SDK: yes, inside the editor | Connect: Autofill only, into pre-tagged fields. Apps SDK: yes | Yes (stays in Canva) | Yes (Connect export to PNG/PDF) | No API | No server-side text editing. Private apps need **Canva Enterprise**. Design Editing API is "actively developing" |
| 5 | **Illustrator AI / PDF** | PDF layer: text as positioned glyph runs, not text frames. Private AI data: undocumented | Not safely without Illustrator | Only if written by Illustrator | Yes (pdf.js renders the PDF-compatible layer) | No | Native AI data is proprietary. The only reliable route is the Firefly Illustrator API (enterprise) |

**If the team turns out to be on Adobe Creative Cloud with an enterprise Firefly Services contract**, the Adobe cloud APIs (Photoshop API v2, InDesign API, Illustrator API) cover write-back and faithful renders for PSD, IDML/INDD and AI. That moves PSD and AI up and makes IDML strongly feasible end to end (§6).

**Common to every format** (§7): outlined text is vector paths and text in embedded raster images is pixels. No layer API returns either as text. They can only be found by OCR on a render, and they can only be "translated" by replacing artwork.

---

## 1. Figma

### 1.1 REST API (server, Node): read and preview only

- **Read-only for document content.** The file endpoints are `GET /v1/files/:key`, `GET /v1/files/:key/nodes`, `GET /v1/images/:key`, `GET /v1/files/:key/images`, `GET /v1/files/:key/meta`, and `POST /v1/files/:file_key/duplicate`. The only write is "duplicate", which copies a file and does not change nodes ([file endpoints][fig-endpoints]). No endpoint edits text. Figma's compare-APIs page sends canvas edits to the Plugin API ([compare APIs][fig-compare]). A forum answer from September 2025 says `file_content:write` is internal and not public **(secondary)** (Figma community forum, found via search, thread URL not captured).
- **Extraction is complete.** TEXT nodes expose `characters`, a base `style` (TypeStyle), `characterStyleOverrides` (one style ID per character, with trailing zeros trimmed), `styleOverrideTable` (ID → TypeStyle), `lineTypes`, `absoluteBoundingBox` and `absoluteRenderBounds` ([node types][fig-nodes]). Inline bold and italic runs come from the override table.
- **Preview.** `GET /v1/images/:key` renders nodes to `jpg`/`png`/`svg`/`pdf` at scale 0.01–4 and returns URLs that expire after 30 days. The cap is 32 megapixels ([file endpoints][fig-endpoints]). This renders the *source* design only. REST cannot render translated text, because it cannot write it.
- **Rate limits (in force since 17 Nov 2025).** Tier 1 (`GET file`, `GET file nodes`, `GET image`) allows **10/15/20 per minute** for Dev/Full seats on Starter/Professional/Organization. View and Collab seats get **up to 20 per month**. Limits follow the plan of the *file*, not the caller ([rate limits][fig-rate]). For an internal tool, the calling account must hold a Dev or Full seat in the team's plan.
- **Libraries.** `@figma/rest-api-spec` (official OpenAPI and TypeScript types, MIT, v0.47.0, published 2026-10-30, per npm).

### 1.2 Plugin API (runs in the Figma editor): full read and write

- **Read styling runs.** `getStyledTextSegments(fields, start?, end?)` returns runs carrying the requested style fields. Range getters return `figma.mixed` for mixed ranges ([TextNode][fig-textnode]).
- **Write with styling.** Setting `characters` and the range setters (`setRangeFontName`, `setRangeFontSize`, …) requires the fonts to be loaded first. `insertCharacters(start, chars, 'BEFORE'|'AFTER')` controls which neighbouring style the new text inherits ([TextNode][fig-textnode]). Translating run by run therefore keeps bold and italic spans, as long as we map runs from source to target. The machine translation has to preserve run boundaries, for example by sending HTML tags to Azure Translator.
- **Missing fonts.** `hasMissingFont` is a read-only flag. Text whose font is missing cannot be edited until that font is available ([TextNode][fig-textnode]).
- **Overflow detection.** `textAutoResize` (`NONE`/`WIDTH_AND_HEIGHT`/`HEIGHT`/`TRUNCATE`), `textTruncation`/`maxLines`, `width`/`height` and `absoluteRenderBounds` are all exposed ([TextNode][fig-textnode]). After writing a translation, a plugin can compare the rendered height to the fixed frame. Figma itself does the reflow, so the check is exact.
- **Plan.** Private organisation plugins need the **Organization or Enterprise** plan ([Figma help][fig-private]). On Starter or Professional, a plugin can still be run as a development plugin from its manifest. That is workable for a small internal team, but it cannot be distributed.

### 1.3 Fit with the brief

- "Upload a design file" does not fit Figma. The `.fig` format is proprietary and no public API accepts it. Figma's workflow is a plugin that sends text to our backend (the existing Azure Functions plus Translator) and writes translations into duplicated frames or pages. The REST API can supply the side-by-side editor and source previews.
- "Export translated files that reopen editable" is met by leaving the translated frames in the Figma file.
- **Feasibility: high.** All of it is documented and supported, at no extra licence cost beyond the seats.

---

## 2. InDesign IDML

### 2.1 Format

- IDML is a ZIP of XML: `designmap.xml`, `Spreads/*.xml` (`TextFrame` elements with `ParentStory`, `ItemTransform` and `PathGeometry`), `Stories/*.xml` (`Story` → `ParagraphStyleRange` → `CharacterStyleRange` → `Content`) and `Resources/Styles.xml`. Local overrides such as font, point size and `FontStyle="Bold"` are attributes on `CharacterStyleRange`. Text content, runs and geometry are therefore all readable as plain XML.
- **Spec status.** The last formal *IDML File Format Specification* is the CS6 (8.0) edition from 2012. According to Adobe staff on the forums, current schemas come from InDesign scripting (`app.generateIDMLSchema()` writes `.rnc` files), not from a published spec ([Adobe community][idml-spec-forum]) **(secondary, but from Adobe staff)**. The format has been stable for years, and InDesign still reads and writes it.
- **`.indd` is a binary format with no published spec.** It has to be converted to IDML first, either by the designer (File → Export → IDML) or with Adobe's *Convert InDesign to IDML API* ([InDesign APIs][ind-apis]).

### 2.2 Server-side read and write (Node)

- **Write-back is a targeted XML edit.** Replace the `Content` text inside each `CharacterStyleRange`. Split or merge ranges when a translated sentence moves the bold span. Leave every other element and attribute untouched, then re-zip with `mimetype` stored uncompressed as the first entry. A careful rewriter should keep `Self` IDs and unknown attributes, so InDesign reopens the file with live, editable text in the original frames and styles.
- **Libraries.** No mature open-source IDML library exists in any language.
  - `idml` (npm, by ElyaConrad): ISC licence, v0.1.71, last published 2026-10-24 per npm. It works in the browser and Node. It reads stories and text frames, replaces paragraphs and exports. The author describes it as handling "a subset" of IDML while preserving parts it does not implement. The repo has 2 stars ([repo][idml-npm]). It could serve as a reference, but a small in-house rewriter using a generic XML parser (e.g. `fast-xml-parser` or `@xmldom/xmldom`) and a ZIP library is lower risk.
  - Ruby gem `idml` and Elixir `idmlx` exist. Neither runs on Node.
- **Fonts.** IDML references fonts by family and style. It does not embed them.

### 2.3 Preview and overflow

- **Without InDesign: no.** IDML has no embedded rendition. No open-source renderer exists, and the `idml` npm package leaves rasterising to the caller ([repo][idml-npm]). We could approximate a render in the browser (draw frames, flow text with canvas `measureText`), but InDesign's paragraph composer, hyphenation and justification will differ. Any overflow flag would be an estimate.
- **With Adobe: yes.** The Firefly Services **InDesign APIs** include Rendition (INDD → PNG/JPG/PDF), Document Info (layers, links and fonts from INDD and IDML), Data Merge, Custom Scripts ("perform almost any InDesign task"), and Convert InDesign to IDML ([InDesign APIs][ind-apis]). A custom script could open the translated IDML, read `TextFrame.overflows` for each frame, export a PNG and save INDD/IDML. Overflow would then be exact. Billing is 1 Operation per output page for Rendition and Data Merge. Custom scripts are billed per output or input page, whichever is higher ([search summary of Adobe enterprise operation definitions][adobe-ops]). The helpx page returned 403 to our fetcher, so these figures are unverified.
- **Feasibility: high for extract and write. Preview and overflow require Adobe.**

---

## 3. Photoshop PSD

### 3.1 Format

- Text layers keep their data in the `TySh` ("Type tool object setting") block: a transform, a text descriptor, a warp descriptor and bounds. Character and paragraph runs live in the text engine payload. `Txt2` is documented only as "raw bytes for text engine". Adobe's spec (November 2019 edition) does not describe the EngineData format ([Adobe PSD spec][psd-spec]). Every third-party library reverse-engineers it.

### 3.2 ag-psd (Node and browser)

- **Licence and maintenance.** MIT, v34.1.0, published 2026-10-28, with frequent major releases in Oct 2026 (32→34) per npm. The repo has ~740 stars and 54 open issues ([repo][agpsd]).
- **Read.** `layer.text.text`, `text.style`, `text.styleRuns` (each a `length` plus a `style` with font, size, fauxBold/fauxItalic and fill), `paragraphStyle` and `transform` ([repo][agpsd]).
- **Write.** Set `text.text` (and `styleRuns`), clear `canvas`, and call `writePsd` with `invalidateTextLayers: true`. Without that flag, Photoshop keeps the old pixels ([repo][agpsd]).
- **Documented limitations** ([repo][agpsd]):
  - The text implementation is incomplete.
  - Vertical text can produce a broken PSD that crashes Photoshop.
  - Named paragraph and character style sheets cannot be read or written.
  - **ag-psd does not redraw text bitmaps.** Photoshop shows an "update text layers" prompt on open, and answering "No" leaves the text layers broken.
- **Reopens editable?** Yes, as long as the user accepts the update prompt and has the fonts. The text stays live. A designer has to see the result in Photoshop anyway, because the stored composite and layer pixels are stale until Photoshop re-renders them.
- **Node.** Text structure can be processed without `node-canvas` if image data is skipped. Composites and thumbnails need `node-canvas` ([repo][agpsd]).
- **Other libraries.** `@webtoon/psd` (MIT, v0.4.0, last published 2023-06) is read-only and dormant. `psd` (v3.4.0, 2022) is read-only and dormant. `psd.js` on npm is now `UNLICENSED`, so avoid it. (All from npm metadata.)

### 3.3 Preview and overflow

- **Without Photoshop: approximate.** We could composite the non-text layers (ag-psd plus canvas) and draw translated text ourselves with web fonts, using the paragraph box from `TySh` bounds and the text transform. Overflow flags would be estimates: Photoshop's line breaking, tracking and warps will not match exactly, and point text has no box at all, only horizontal overrun.
- **With the Photoshop API v2 (Firefly Services):**
  - `POST /v2/execute-actions` takes ActionJSON or a **UXP script** that edits text layers and writes PSD and renditions. It replaces the deprecated v1 `/pie/psdService/text` ([text-layer migration][ps-text-mig]).
  - Fonts: `fontOptions.additionalFonts[].source.url` and `missingFontStrategy` (`fail`/`use_default`) ([text-layer migration][ps-text-mig]).
  - The v2 **manifest** returns `text_layer` objects with `content`, `characterStyles` (`font.postScriptName`, float `fontSize`, `syntheticBold`/`syntheticItalic`, `position {from,to}`), `paragraphAttributes`, and `frame` (`type`, `bounds`, `boundsRaw`, `matrix`). It also lists missing fonts ([manifest migration][ps-manifest-mig], [what's new][ps-v2-new]).
  - v2 adds a new text engine for complex and multilingual text, and the file cap rises to 4 GB ([what's new][ps-v2-new]).
  - Docs exist under both `photoshop-v2` and `photoshop-v2-beta` paths, and several `photoshop-v2` pages returned 404 to our fetcher. The overview says "Photoshop API v2 is now generally available" ([Photoshop API][ps-overview]).
  - **Storage.** Adobe documents Azure Blob with SAS for input and output ([storage][ps-storage]). This fits our keyless setup: a user-delegation SAS can be minted with managed identity.
- **Feasibility: medium without Adobe (extract and write work, preview is approximate). High with the Photoshop API.**

---

## 4. Canva

### 4.1 Connect API (server, REST)

- **Import.** `.ai`, `.psd`, `.pdf`, `.pptx`, `.docx`, Keynote, Affinity and others are converted into Canva designs ([design imports][canva-imports]). Fidelity is not documented per format. Rate limit: 20 requests/min per user ([create import job][canva-import-job]).
- **Export.** JPG, PNG, GIF, PPTX, MP4, PDF, CSV (Sheets) and HTML (email) ([create export job][canva-export]). **No native editable export** beyond PPTX: the translated design lives in Canva. Limits:
  - 20 requests/min per user.
  - 750 exports per 5 minutes and 5,000 per 24 hours per app.
  - 75 exports per 5 minutes per document.
  - 75 exports per 5 minutes and 500 per 24 hours per user.

  Some PNG options need a paid plan ([create export job][canva-export]).
- **Text read and edit: not available.** Connect has no endpoint that lists or edits a design's text elements. The only server-side text write is **Autofill**: brand templates whose elements were tagged as data fields beforehand (text or image) in the editor ("Bulk Create" → Labels). Autofill works on Canva Pro, Teams, Enterprise, Education and Nonprofits, and requires MFA ([autofill guide][canva-autofill]). It suits templated campaigns that are set up for it in advance. It does not suit translating an arbitrary design.

### 4.2 Apps SDK (runs in the Canva editor)

- The **Design Editing API** (`openDesign`) can read text as richtext and convert it to plaintext. It writes with `element.text.replaceText({index,length}, text, formatting)`, where formatting includes `fontWeight`, `fontSize` and `color`. Geometry is available as `top/left/width/height/rotation`. It can iterate all pages ([design editing][canva-editing]).
- Limitations ([design editing][canva-editing]):
  - Sessions expire after 1 minute.
  - Only absolute pages are supported. Canva Docs and tables are not.
  - Locked elements are read-only.
  - Canva describes the API as "actively developing".
- **Private (team) apps require Canva Enterprise** ([Canva dev docs, search summary][canva-team-apps]).
- No overflow API was found. Canva auto-grows text boxes, and we have no way to read whether text overflows.
- **Feasibility: low to medium.** It needs an Enterprise plan and an in-editor app. Without those, the only route is Autofill into templates prepared in advance.

---

## 5. Illustrator AI / PDF

- **Format.** A modern `.ai` is a PDF wrapper. With *Create PDF Compatible File* checked, it holds a PDF rendition plus Illustrator's private data streams. Without it, other apps cannot open the file ([community and third-party summaries][ai-pdfcompat]) **(secondary)**. Illustrator's private data has no published spec.
- **Extract.** The PDF layer gives text as positioned glyph runs (`Tj`/`TJ` operators). Fonts are often subset, and paragraphs are often split per line, so there is no reliable "text frame" or paragraph structure. Area-text box geometry is lost. Our existing Lingo Lens stack (pdf.js, Azure Document Intelligence) can read this text, but only as a document, not as design layers.
- **Write back.** Editing the PDF layer (e.g. with `pdf-lib`, MIT, v1.17.1, unpublished since 2022) does **not** update the private Illustrator data. Illustrator reopens from its own data, so edits are lost or inconsistent. If the private data is stripped, Illustrator opens the file as a generic PDF with fragmented text. **Not reliably feasible without Illustrator.**
- **Preview.** pdf.js (`pdfjs-dist`, Apache-2.0, v6.5.438, Nov 2026) renders the PDF-compatible layer in the browser. `mupdf` is AGPL-3.0 and would need a commercial licence for internal closed use.
- **Adobe route: the Firefly Services Illustrator API.** It offers Rendition, Data Merge, Custom Script, Manifest, Image Trace, Recolor and document operations ([Illustrator API][ai-api]). Custom scripts are **ExtendScript** (`script.jsx` with `main()`) in a ZIP with `manifest.json`. They receive a `params` string, can take a font folder, save `.ai`, and return presigned output URLs. No UI calls are allowed ([custom script guide][ai-custom]). The Illustrator DOM's `textFrames` and `textRange.characterAttributes` would cover extraction and write-back. GA status and limits are not stated on the pages we read.
- **Feasibility: low without Adobe. Medium to high with the Illustrator API.**

---

## 6. Adobe Firefly Services: availability and pricing

- **What it includes.** Firefly API, Photoshop API, Lightroom API, InDesign API, Illustrator API, Express, Substance 3D, Audio/Video, Content Tagging and Creative Production ([Firefly Services guides][ff-guides]).
- **Availability.** We found no public self-serve price list. Adobe community managers say Firefly APIs are **for enterprise customers only**, with access granted through the organisation's Adobe Admin Console ([Adobe community][ff-enterprise-forum]) **(secondary)**. Other reports, all **(secondary, conflicting)**:
  - A 2024 thread cites a "3-year contract with 50 seats" minimum.
  - Third-party sites cite roughly $1,000/month minimums and 4–8 week sales cycles.
  - Users report difficulty buying it at all.
  - Treat it as: **contact Adobe sales, enterprise agreement required**.
- **Billing unit.** "Operations". InDesign Rendition and Data Merge cost 1 Operation per output page. Status and get-tags calls are free. Illustrator rendition costs 1 Operation per output file, and Image Trace 0.5 per call ([Adobe enterprise operation definitions, via search summary][adobe-ops]). We could not load the page directly (403).
- **Storage.** Presigned or SAS URLs, including Azure Blob SAS ([Photoshop storage][ps-storage]). The InDesign Advanced Data Merge API mentions pre-signed URLs ([InDesign APIs][ind-apis]).
- **Alternatives** (not researched in depth): self-hosted **InDesign Server**, which is sold by Adobe under separate server licensing. Running desktop Photoshop or Illustrator unattended on a server is not permitted by desktop licences and is not a viable route.

---

## 7. Outlined text and text in raster images (all formats)

- **Outlined text** (Create Outlines in Illustrator or InDesign, outlined text in Figma, shape layers in Photoshop) is vector paths. No layer API in any format reports it as text: it shows up as shapes, groups or `VECTOR` nodes. It can only be found by OCR on a render, and "translating" it means rebuilding it as live text. The tool should **flag** it, not attempt it.
- **Text inside embedded raster images** (photos and pasted screenshots in any format, or a Photoshop smart object holding a raster) is pixels. Layer APIs return an image fill or a link. Detection is possible with OCR on the image, e.g. Azure Document Intelligence or Image Translation; see `.scratch/lingo-lens/research/azure-image-translation.md`. Writing it back means replacing the embedded image. The layers stay non-editable, so the tool should flag these as "image text, not translated in-layer".
- **Photoshop smart objects** containing PSB or AI hold nested documents. ag-psd exposes linked and embedded file data, but editing text inside them means a recursive parse and write. Treat this as out of scope for v1.

---

## 8. Hard blockers by format

| Format | Hard blockers |
|---|---|
| Figma | REST cannot write, so translation must run in a plugin inside the editor. `.fig` cannot be uploaded. View and Collab seats get only ~20 Tier-1 calls per month. Private plugin distribution needs the Organization or Enterprise plan |
| IDML | No renderer outside InDesign, so preview and overflow need the Adobe InDesign API or InDesign Server. Spec frozen at CS6. `.indd` needs conversion. No mature library, so we build our own XML rewriter |
| PSD | EngineData is undocumented. ag-psd does not re-render text, so Photoshop must update layers on open and server-side previews are approximate. Vertical text is unsafe. Faithful renders need the enterprise Photoshop API |
| Canva | Connect has no text read or edit. Autofill only works on pre-tagged brand templates. The in-editor Design Editing API needs Canva **Enterprise** for a private app and is still developing. Export rate limits apply. No editable file export except PPTX |
| AI / PDF | Illustrator private data is proprietary, so a server cannot write it back safely. PDF-layer text has no frame or paragraph structure. The only reliable route is the enterprise Illustrator API |

## 9. Recommendation for next step

1. **Find out which tool the team uses before building anything.** The answer changes the architecture. Figma and Canva mean an in-editor plugin or app. IDML and PSD mean upload, process, download.
2. If they use **InDesign**, IDML read and write is buildable in-house in Node. Decide early whether the budget covers Firefly Services InDesign APIs for exact preview and overflow. Otherwise, accept an approximate browser preview with a "verify in InDesign" warning.
3. If they use **Photoshop**, ag-psd is the right library. Expect the "update text layers" prompt and an approximate preview, or use the Photoshop API.
4. If they use **Illustrator**, don't attempt it without the Illustrator API. Consider asking designers to hand off as IDML via InDesign instead.

---

[fig-endpoints]: https://developers.figma.com/docs/rest-api/file-endpoints/
[fig-compare]: https://developers.figma.com/compare-apis
[fig-nodes]: https://developers.figma.com/docs/rest-api/file-node-types/
[fig-rate]: https://developers.figma.com/docs/rest-api/rate-limits/
[fig-textnode]: https://developers.figma.com/docs/plugins/api/TextNode/
[fig-private]: https://help.figma.com/hc/en-us/articles/4404228629655-Create-private-organization-plugins
[idml-spec-forum]: https://community.adobe.com/t5/indesign-discussions/where-is-the-idml-specification/m-p/13213175
[idml-npm]: https://github.com/ElyaConrad/idml
[ind-apis]: https://developer.adobe.com/firefly-services/docs/indesign-apis
[adobe-ops]: https://helpx.adobe.com/business/enterprise/products-entitlements/manage-entitlements/automation-operation-definition.html
[psd-spec]: https://www.adobe.com/devnet-apps/photoshop/fileformatashtml/
[agpsd]: https://github.com/Agamnentzar/ag-psd
[ps-overview]: https://developer.adobe.com/firefly-services/docs/photoshop/
[ps-text-mig]: https://developer.adobe.com/firefly-services/docs/photoshop/guides/photoshop-v2-beta/v1-to-v2/convenience-apis/text-layer-operations
[ps-manifest-mig]: https://developer.adobe.com/firefly-services/docs/photoshop/guides/photoshop-v2-beta/v1-to-v2/manifest-response-migration
[ps-v2-new]: https://developer.adobe.com/firefly-services/docs/photoshop/guides/photoshop-v2-beta/v1-to-v2/v2-whats-new
[ps-storage]: https://developer.adobe.com/firefly-services/docs/photoshop/getting-started/storage-solutions/
[canva-imports]: https://www.canva.dev/docs/connect/api-reference/design-imports/
[canva-import-job]: https://www.canva.dev/docs/connect/api-reference/design-imports/create-design-import-job/
[canva-export]: https://www.canva.dev/docs/connect/api-reference/exports/create-design-export-job/
[canva-autofill]: https://www.canva.dev/docs/connect/autofill-guide/
[canva-editing]: https://www.canva.dev/docs/apps/design-editing/
[canva-team-apps]: https://www.canva.dev/docs/extensions/platform-concepts/apps/team-apps/
[ai-pdfcompat]: https://community.adobe.com/questions-652/should-i-save-illustrator-ai-file-with-create-pdf-compatible-file-checked-814714
[ai-api]: https://developer.adobe.com/firefly-services/docs/illustrator
[ai-custom]: https://developer.adobe.com/firefly-services/docs/illustrator/guides/custom-scripts/
[ff-guides]: https://developer.adobe.com/firefly-services/docs/guides/
[ff-enterprise-forum]: https://community.adobe.com/t5/adobe-firefly-discussions/firefly-api-access/m-p/14670389
