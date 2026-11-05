# Azure spike checklist (HITL)

For the ticket [Azure spike: latency, error payloads, OCR quality](../../issues/09-azure-spike.md). Region: **West Europe**. Everything goes in one throwaway resource group, which you delete at the end. Expected cost: a few dollars or less.

The spike uses a Translator **key** for speed. Production stays keyless (see [Backend and hosting architecture](../../issues/04-backend-and-hosting-architecture.md)). Storage access goes through the Translator's managed identity, the same way production will, so the spike checks that path too.

## 1. Create resources (Azure portal)

1. **Resource group:** `rg-lingolens-spike`, West Europe.
2. **Storage account:** name it e.g. `lingolensspike` (Standard, LRS, West Europe). After it is created, open **Data storage → Containers** and add `source` and `target` (private).
3. **Translator:** name it e.g. `lingolens-spike-tr`. Use West Europe (a **regional** resource, not Global), pricing tier **S1**, and give it a custom domain name. Then:
   - **Identity → System assigned → On**, then Save.
   - In the storage account, open **Access control (IAM) → Add role assignment**, choose **Storage Blob Data Contributor**, select Managed identity → Translator → `lingolens-spike-tr`.
   - Wait about 5 minutes for the role to propagate.
   - Note **Keys and Endpoint**: Key 1 and the *Document Translation* endpoint (`https://<name>.cognitiveservices.azure.com`).
4. **Region check** (for [Deployment and CI](../../issues/10-deployment-and-ci.md)): start creating a Function App in the portal (**Create → Function App → Flex Consumption**) and check that **West Europe** is offered, then cancel. If it isn't offered, note that: the fallback is Sweden Central.
5. **Document Intelligence:** name it e.g. `lingolens-spike-di`, West Europe, tier S0. Free F0 also works for a handful of images.

## 2. Prepare the test files

Put everything in a folder named `files/` next to this checklist.

| Blob name | What it is | How to get it |
|---|---|---|
| `small.docx` | A 1-page Word document | Any |
| `sample.pdf` | The 2-page sample PDF | The one used in the reference prototype, or any 2-page digital PDF |
| `large.pptx` | A large deck (30+ slides, 10–30 MB) | Any real deck |
| `protected.pdf` | A PDF that needs a password to open | In Preview, open `sample.pdf`, choose **File → Export…**, open **Permissions…**, tick *Require password to open document* |
| `protected.docx` | A password-protected Word file | In Word: **Review → Protect → Protect Document → Encrypt with password** |
| `mixed.pdf` | Digital pages plus one scanned page | In Preview, drag a phone photo of a printed page into the `sample.pdf` thumbnails, then export as PDF |
| `oversize.pdf`, `garbage.pdf`, `archive.zip` | Over 40 MB, random bytes named .pdf, and an unsupported format | Run `./run-spike.sh make-files files/sample.pdf` |

Then, in the storage account, open the **`source` container** and choose **Upload**. Select all 9 files and keep the blob names exactly as listed above.

## 3. Run the batch tests

```bash
cd .scratch/lingo-lens/research/azure-spike
export TRANSLATOR_ENDPOINT=https://lingolens-spike-tr.cognitiveservices.azure.com
export TRANSLATOR_KEY=<key 1>          # do not commit; delete the resource group afterwards
export STORAGE_ACCOUNT=lingolensspike
chmod +x run-spike.sh && ./run-spike.sh run
```

The script submits each file as its own batch: the latency files 3 times each, then every error case once. It polls every 2 seconds and writes raw responses to `results/<timestamp>/`, with one line per run in `summary.tsv`. Expect 10–30 minutes.

If every case shows `submit_http` 400, or a status of `Failed` with an authorization or storage error, the role assignment has not propagated yet. Wait and run it again.

## 4. OCR quality (Document Intelligence Studio)

1. Open <https://documentintelligence.ai.azure.com/studio> → **Read**, and pick `lingolens-spike-di`.
2. Run it on:
   - (a) a real chalkboard or handwritten sign photo
   - (b) a printed notice photographed at a slight angle
   - (c) if you have one, a photo in a non-Latin script (ar, th, ru, zh)
3. For each photo, take a **screenshot** of the region overlay, and **download the JSON result**. Save both to `ocr/` next to this checklist.
4. For each photo, write one line: is the text right, and do the paragraph boxes match how a person would group the text?

## 5. Tear down

Delete `rg-lingolens-spike`. Then tell Claude the spike is done, and it will read `results/` and `ocr/` and record the answer on the ticket.
