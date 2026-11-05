# Azure options for Image Translation

Type: research
Status: resolved
Map: ../map.md

## Question

Which Azure service (or combination) should Lingo Lens use to translate text in Images, given the result is extracted text shown side-by-side with the original Image with regions highlighted? Compare Azure AI Vision (Read/OCR), Azure AI Document Intelligence (read/layout model) and anything Translator itself offers for images. For each, establish:

- Whether it returns text regions with coordinates (needed for highlighting) and at what granularity (line/word/paragraph)
- Supported image formats, size and resolution limits
- Handwriting and photo-of-sign quality (e.g. the chalkboard sample)
- Whether OCR output can be fed to Translator text translation while keeping regions aligned
- Auth options (Managed Identity) and pricing

## Answer

Use **Azure Document Intelligence `prebuilt-read` (v4.0 `2024-11-30`, GA)** to run OCR on the Image. Then send each paragraph's text to **Translator text translation** (NMT, source auto-detected) as one array element, and match the results back to their polygons by index.

- Read returns paragraphs, lines and words, each with a pixel `polygon`. It also returns the page width and height, so the SPA can scale the polygons and draw them as SVG highlights. It flags handwritten text, including for ru, th and ar.
- Accepted inputs: JPEG, PNG, BMP, TIFF and HEIF, from 50 to 10,000 px. The call is asynchronous (POST, then poll). Cost is $1.50 per 1,000 Images plus $10 per 1M characters translated. Both services support Managed Identity with the Cognitive Services User role.
- Rejected: **Vision Image Analysis 4.0 Read** is deprecated and retires on 2028-09-25; Microsoft points OCR users to Document Intelligence.
- Rejected: **Document Translation image files** (GA in `2026-03-01`) return the Image with the translation painted in. They return no regions, run batch only (Blob Storage) and cap images at 5 MB.
- Open item: test the chalkboard sample in Document Intelligence Studio. Chalk-handwriting quality has not been tested.

Full findings, sources and a sample response: [research/azure-image-translation.md](../research/azure-image-translation.md)
