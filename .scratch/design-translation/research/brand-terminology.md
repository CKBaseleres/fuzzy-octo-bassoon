# Research: Brand terminology in Azure Translator

Ticket: "Brand terminology in Azure Translator" (design-translation tool).
Researched: 2026-11-06. Sources are Microsoft Learn and azure.microsoft.com, read on that date through the Microsoft Learn MCP fetch tool. Learn exposed no per-page `ms.date`, so all dates here are retrieval dates.

**Question.** The tool machine-translates short text layers from design files (headlines, CTAs, taglines) into several languages, as a first draft that a human then reviews. How do we keep brand terms fixed? There are two kinds:

- **Never-translate terms**: product names and brand names, copied as-is.
- **Fixed-wording taglines**: approved taglines whose wording is set per language.

---

## 0. Version landscape (read this first)

- **Text translation `2026-06-06` is GA.** It adds optional LLM selection (for example GPT-5.1/GPT-5.4 deployments), *adaptive custom translation*, and `tone`/`gender` controls ([overview][tt-ov], [what's new][whatsnew]). It is **not backward compatible** with v3.0: the request uses `inputs[]`/`targets[]` and the response uses `value[]` ([migration guide][migrate]).
- **v3.0 is still GA.** v3.0 is the version whose docs describe the dynamic dictionary and `notranslate` ([Translator overview][overview]).
- **The `2026-06-06` Translate reference does not mention** `mstrans:dictionary`, `notranslate` or `translate="no"`. It does keep `textType` (`plain`/`html`) and accepts a Custom Translator model through `targets.deploymentName = <categoryID>` ([2026-06-06 translate][tt-2026]). Microsoft does not say whether the markup still works in `2026-06-06` (with NMT or with an LLM deployment). **We have to test this before relying on it.**
- `2025-10-01-preview` (the LLM preview) is deprecated 90 days after the `2026-06-06` GA ([migration guide][migrate]).

## 1. Options compared

| | Dynamic dictionary `<mstrans:dictionary>` | `notranslate` / `translate="no"` | Custom Translator phrase / sentence dictionary | Adaptive custom translation (AdaptCT, LLM) | Post-processing / placeholders in our code |
|---|---|---|---|---|---|
| **Fits never-translate terms** | Yes (translation = source) | **Yes, best fit** | Yes (phrase dict, same source and target) | Soft only (guidance, not enforced) | Yes (mask → placeholder → unmask) |
| **Fits fixed-wording taglines** | Partly. Meant for nouns, not sentences | No | **Yes: sentence dictionary** (full-segment match) | Soft only | **Yes: exact-match lookup before calling MT** |
| **Guaranteed?** | No. Docs: "safe only for compound nouns", "use sparingly" | Yes for NMT v3 in HTML mode (documented). Not documented for 2026-06-06/LLM | Phrase dict: "exact find-and-replace". Sentence dict: returns your target on a full match | No. Few-shot retrieval | Yes. It is our code |
| **Language coverage** | **Only pairs with English on one side**, and `from` must be explicit (no autodetect) | All Translator languages (no restriction stated) | Only pairs with a full Microsoft NMT model and Custom Translator support (~a few dozen, mostly to/from English) | Small set: the language table shows en, es, fr, fr-ca, de, it (zh/ja/pt etc. not ticked) | Any language |
| **Cost** | NMT per-character price. Markup characters count | NMT per-character price. Tags count as characters | **Custom** per-character rate (higher than standard), plus a monthly **hosting fee per model per region**, plus training (capped at $300/training) | LLM: charged per input/output token at Azure OpenAI rates. The AdaptCT example says "charges are based on source characters" | No extra Azure cost. Fewer characters sent |
| **Latency** | NMT: ~150–300 ms for <100 chars, 15 s max | Same as NMT | Custom models: 120 s max, and can be slower when traffic is intermittent | LLM: depends on the capacity you deploy | Negligible (or zero for exact-match hits, which skip MT) |
| **Who maintains the list, and how** | Our app: we inject markup per request from a term list we store | Our app: we wrap terms in `<span class="notranslate">` from our term list | Marketing/loc owner in the **Custom Translator portal** (workspace roles Owner/Editor/Reader). Upload aligned dictionary files, **retrain and republish** each language pair on every change (hours) | Owner in **Foundry**: upload TMX/TSV (5–10,000 pairs, ≤250 chars each). The index rebuilds in minutes | Our app: a term/tagline table we own (DB or JSON in repo). Editable at once, versioned |
| **Keyless Managed Identity** | Yes (Translator supports Entra ID/MI bearer tokens) | Yes | Runtime calls: yes (same Translate API with `category`/`deploymentName`). **Setup: the portal workspace asks for a Translator resource key**, see §4 | Yes. Requires a **Foundry resource**. Docs recommend MI. LLM is **not available behind a private endpoint** | Yes (no new auth) |
| **Short marketing strings** | Works, but the docs warn the rest of the sentence loses context | Good. The term is masked and the rest is translated | Sentence dict is ideal for exact taglines. Phrase dict hurts fluency of surrounding words, and Microsoft says to avoid 2–3-letter entries | LLM handles tone and idiom best for CTAs. Terms are not guaranteed | Exact-match taglines are perfect. Placeholders can break grammar (case/gender) around the term in inflected languages |

### 1.1 Dynamic dictionary

- Syntax: `<mstrans:dictionary translation="X">phrase</mstrans:dictionary>`. Works with `textType` plain or html ([dynamic dictionary][dyn]).
- Requirements: **From and To must include English**, and `from` must be given (no autodetect). Case-sensitive ([dynamic dictionary][dyn], [v3 translate][v3]).
- Microsoft's guidance: "safe only for compound nouns like proper names and product names". "Should be used sparingly". For large term lists, Custom Translator is "a more viable choice" ([dyn][dyn], [v3][v3]).
- Marketing impact: non-English pairs (for example de→fr) are out, and so is any source-language autodetection.

### 1.2 `notranslate` / `translate="no"`

- `class="notranslate"` or `translate="no"` on an element. **Works only when `textType=html`**, "by design". Microsoft lists brand names as an intended use ([prevent translation][prevent]).
- The same page lists the other options: dynamic dictionary, "don't pass the string to the Translator", and a Custom Translator dictionary "to prescribe the translation of a phrase with 100% probability" ([prevent][prevent]).
- In practice: send each text layer as `<span>…<span class="notranslate">Acme Pro</span>…</span>`, then strip the tags. HTML-escape user text first. Tag characters count toward billing.

### 1.3 Custom Translator (custom NMT model with dictionaries)

- **Phrase dictionary**: case-sensitive, "an exact find-and-replace operation". Same text in source and target means "don't translate". Best for compound nouns. Microsoft warns that it hurts the quality of the surrounding sentence and should be "used sparingly", and says not to add 2–3-letter words or acronyms ([dictionaries][dict]).
- **Sentence dictionary**: case-insensitive. The *entire* input sentence must match. Trailing punctuation is ignored. It returns your target ([dictionaries][dict]). This is how Custom Translator handles fixed-wording taglines.
- **Neural phrase dictionary**: inflects terms for fluency, but "can't be used reliably for copying" and occasionally (<0.1%) ignores entries. Available on ~10 en↔X pairs ([neural dictionary][neural]). It suits translated product *features*, not brand names that must be copied as-is.
- **Dictionary-only training** is allowed (no 10,000-sentence minimum). You still have to train, then publish, and the result is called through `category` (v3) or `deploymentName` (2026-06-06) ([dictionaries][dict], [train model][train], [translate with custom model][ct-translate]).
- Languages: only pairs with a full Microsoft NMT model, and the platform is built "to and from English" ([dictionaries][dict], [CT overview][ct-ov]).
- Operations: one model per project (language pair), published per region. Workspace sharing has Owner/Editor/Reader roles. Updates mean retrain + republish ([workspace][ct-ws], [publish][ct-publish]).
- Cost: custom translation per character, training per character (max $300/training), and a **flat monthly hosting fee per model per region, not pro-rated** ([pricing][pricing]). Five target languages means five hosted models.
- Latency: custom models have a 120 s maximum and "can have a higher latency when your request rate is intermittent" ([service limits][limits]). An internal marketing tool will have intermittent traffic.

### 1.4 Post-processing / pre-processing in our own code

Microsoft's own option 4 is "don't pass the string to the Translator" ([prevent][prevent]). Two patterns:

1. **Tagline lookup (pre-MT).** Normalise the layer text (trim, case-fold, ignore trailing punctuation). If it matches an approved tagline, return the stored per-language wording and skip MT. This is deterministic and free, and the result can be labelled "approved copy" for the reviewer. It is the same thing a sentence dictionary does, without the training or hosting.
2. **Term protection (around MT).** Wrap each never-translate term from our list in `notranslate` (NMT/HTML) or a placeholder token. After MT, check that every protected term appears verbatim in the output, and flag the layer for the reviewer if one is missing.

Both are code we own and test. The term list lives in our app's data, edited by marketing through a small admin UI or a reviewed JSON file. Changes take effect at once.

## 2. LLM-based options

### 2.1 Translator `2026-06-06` with an LLM deployment (GA)

- `targets.deploymentName` selects NMT (`general`), a customer LLM deployment (for example GPT-5.1), or a Custom Translator category ID ([2026-06-06 translate][tt-2026]).
- **Style controls**: `tone` (`formal`/`informal`/`neutral`) and `gender` (`female`/`male`/`neutral`) when using an LLM ([2026-06-06 translate][tt-2026], [migrate][migrate]).
- **Terminology control**: `referenceTextPairs` (up to five per request) or `adaptiveDatasetId` (an AdaptCT index of 5–10,000 pairs, ≤250 chars each, built in minutes in Foundry). It works by **few-shot retrieval** to "guide terminology, context, and style" ([AdaptCT][adapt]). This is **guidance, not a guarantee**: Microsoft states no exact-match behaviour, unlike phrase or sentence dictionaries.
- Requirements and limits: needs a **Foundry resource**. Assign **Cognitive Services User** to the Foundry resource's managed identity on the resource ([Azure resources][resources]). LLM limits are 50 array elements and 5,000 chars per element. Latency depends on deployed capacity. **Not available with a private endpoint** ([tt-ov][tt-ov], [2026-06-06 translate][tt-2026]).
- **Language coverage**: the "LLM translation" column covers most major languages (ar, zh-Hans/Hant, ja, ko, pt, pt-pt, pl, nl, sv, …), but **AdaptCT** is ticked only for en, es, fr, fr-ca, de, it in the table we read ([language support][lang]).
- **Pricing**: NMT is per source character. "Translations using generative AI LLMs are charged according to the number of input and output tokens processed" at Azure OpenAI rates ([2026-06-06 overview][tt-ov]). The examples show a large fixed instruction overhead: 319–382 `instructionTokens` for a 72-char sentence ([2026-06-06 translate][tt-2026]). For short CTAs, that overhead dominates the token count.
- **Auth**: `2026-06-06` "supports both the resource API key and Microsoft Entra ID". MI is listed as the keyless option ([tt-ov][tt-ov], [auth][auth]).

### 2.2 Azure OpenAI directly (our own prompt)

- Keyless: `DefaultAzureCredential`/managed identity with the **Cognitive Services OpenAI User** role ([AOAI managed identity][aoai-mi], [.NET auth][aoai-dotnet]).
- Full control: put the term list and taglines in the system prompt, ask for structured JSON per layer, and set tone and max length (useful for layout-constrained layers). Cost is per token ([Foundry costs][foundry-cost]).
- No terminology guarantee either. We would still need the §1.4 lookup and verification, and we would own the prompt, evaluation and model-version drift. Microsoft pitches Translator's LLM mode as a way to avoid "managing prompt engineering or manual quality pipelines" ([migrate][migrate]).

## 3. Recommendation

**Enforce brand terms in our own code, and treat Azure features as helpers, not the source of truth.**

1. **Approved taglines → exact-match lookup before MT** (§1.4.1). Store per-language approved wording in a term table we own. A hit skips MT and is marked "approved". This beats a sentence dictionary: no English-pivot limit, no hosting fee per language, no retraining, and changes take effect at once.
2. **Never-translate terms → `class="notranslate"` with `textType=html` on NMT**, plus a **post-MT check** that each protected term appears verbatim. Missing terms flag the layer in the review UI. Prefer `notranslate` over `mstrans:dictionary`: it has no English-on-one-side restriction, no autodetect ban, and Microsoft names brand names as a use case.
3. **Start on NMT with the same keyless MI setup as Lingo Lens.** Short strings are cheap and fast (~150–300 ms).
4. **Do not adopt Custom Translator** for this. Hosting fees per language per region, retrain and republish cycles, intermittent-traffic latency and an English-pivot design are a poor fit for a short term list and a few short strings. Revisit only if marketing builds a large bilingual corpus (≥10k sentence pairs) and wants house style learned.
5. **Optional phase 2: LLM mode in Translator `2026-06-06`** (Foundry resource, MI, `tone=informal|formal`, AdaptCT seeded with approved past translations) for CTA tone and fluency. Keep steps 1–2 in place regardless, because AdaptCT and prompts only guide. Choose it over raw Azure OpenAI unless we need length constraints or custom output shape.

## 4. Open questions / spike items

- **Does `notranslate` work on `2026-06-06`**, with NMT and with an LLM deployment? The 2026-06-06 reference is silent (§0). Test both. If not, use v3.0 for NMT or switch to placeholders.
- **Placeholder vs `notranslate` with inflected languages** (de, pl, ru): check that the grammar around the protected term stays acceptable on real CTAs.
- **Custom Translator setup with keys disabled**: workspace creation asks you to paste a Translator resource key ([workspace][ct-ws]). If our resources set `disableLocalAuth`, this would block Custom Translator. Only relevant if §3.4 is revisited.
- **Exact list prices**: the pricing page renders amounts as `$-` through the fetch tool ([pricing][pricing]). Confirm the standard, custom, hosting and LLM token rates in the Azure pricing calculator for our region and currency before costing phase 2.
- **AdaptCT language coverage** for our target languages. The table currently ticks only en/es/fr/fr-ca/de/it ([language support][lang]).

---

## Sources

[overview]: https://learn.microsoft.com/azure/ai-services/translator/overview
[whatsnew]: https://learn.microsoft.com/azure/ai-services/translator/whats-new
[tt-ov]: https://learn.microsoft.com/azure/ai-services/translator/text-translation/2026-06-06/overview
[tt-2026]: https://learn.microsoft.com/azure/ai-services/translator/text-translation/2026-06-06/translate-api
[migrate]: https://learn.microsoft.com/azure/ai-services/translator/text-translation/how-to/migrate-to-2026-06-06
[v3]: https://learn.microsoft.com/azure/ai-services/translator/text-translation/reference/v3/translate
[dyn]: https://learn.microsoft.com/azure/ai-services/translator/text-translation/how-to/use-dynamic-dictionary
[prevent]: https://learn.microsoft.com/azure/ai-services/translator/text-translation/how-to/prevent-translation
[dict]: https://learn.microsoft.com/azure/ai-services/translator/custom-translator/concepts/dictionaries
[neural]: https://learn.microsoft.com/azure/ai-services/translator/text-translation/how-to/use-neural-dictionary
[train]: https://learn.microsoft.com/azure/ai-services/translator/custom-translator/azure-ai-foundry/how-to/train-model
[ct-ov]: https://learn.microsoft.com/azure/ai-services/translator/custom-translator/overview
[ct-ws]: https://learn.microsoft.com/azure/ai-services/translator/custom-translator/how-to/create-manage-workspace
[ct-publish]: https://learn.microsoft.com/azure/ai-services/translator/custom-translator/how-to/publish-model
[ct-translate]: https://learn.microsoft.com/azure/ai-services/translator/custom-translator/how-to/translate-with-custom-model
[adapt]: https://learn.microsoft.com/azure/ai-services/translator/custom-translator/azure-ai-foundry/concepts/adaptive-custom-translation
[resources]: https://learn.microsoft.com/azure/ai-services/translator/how-to/create-translator-resource
[auth]: https://learn.microsoft.com/azure/ai-services/translator/text-translation/reference/authentication
[lang]: https://learn.microsoft.com/azure/ai-services/translator/language-support#translation
[limits]: https://learn.microsoft.com/azure/ai-services/translator/service-limits#text-translation
[pricing]: https://azure.microsoft.com/pricing/details/cognitive-services/translator/
[aoai-mi]: https://learn.microsoft.com/azure/foundry-classic/openai/how-to/managed-identity
[aoai-dotnet]: https://learn.microsoft.com/dotnet/ai/azure-ai-services-authentication
[foundry-cost]: https://learn.microsoft.com/azure/foundry/concepts/manage-costs

- Translator overview: <https://learn.microsoft.com/azure/ai-services/translator/overview>
- What's new: <https://learn.microsoft.com/azure/ai-services/translator/whats-new>
- Text translation 2026-06-06 overview: <https://learn.microsoft.com/azure/ai-services/translator/text-translation/2026-06-06/overview>
- Translate 2026-06-06 reference: <https://learn.microsoft.com/azure/ai-services/translator/text-translation/2026-06-06/translate-api>
- Migrate to 2026-06-06: <https://learn.microsoft.com/azure/ai-services/translator/text-translation/how-to/migrate-to-2026-06-06>
- v3 Translate reference: <https://learn.microsoft.com/azure/ai-services/translator/text-translation/reference/v3/translate>
- Dynamic dictionary: <https://learn.microsoft.com/azure/ai-services/translator/text-translation/how-to/use-dynamic-dictionary>
- Prevent translation: <https://learn.microsoft.com/azure/ai-services/translator/text-translation/how-to/prevent-translation>
- Custom Translator dictionaries: <https://learn.microsoft.com/azure/ai-services/translator/custom-translator/concepts/dictionaries>
- Neural dictionary: <https://learn.microsoft.com/azure/ai-services/translator/text-translation/how-to/use-neural-dictionary>
- Train a Custom Translator model: <https://learn.microsoft.com/azure/ai-services/translator/custom-translator/azure-ai-foundry/how-to/train-model>
- Custom Translator overview / workspace / publish / translate: <https://learn.microsoft.com/azure/ai-services/translator/custom-translator/overview>, <https://learn.microsoft.com/azure/ai-services/translator/custom-translator/how-to/create-manage-workspace>, <https://learn.microsoft.com/azure/ai-services/translator/custom-translator/how-to/publish-model>, <https://learn.microsoft.com/azure/ai-services/translator/custom-translator/how-to/translate-with-custom-model>
- Adaptive custom translation: <https://learn.microsoft.com/azure/ai-services/translator/custom-translator/azure-ai-foundry/concepts/adaptive-custom-translation>
- Azure resources for Translator (Foundry, roles): <https://learn.microsoft.com/azure/ai-services/translator/how-to/create-translator-resource>
- Authentication: <https://learn.microsoft.com/azure/ai-services/translator/text-translation/reference/authentication>
- Language support: <https://learn.microsoft.com/azure/ai-services/translator/language-support#translation>
- Service limits (latency): <https://learn.microsoft.com/azure/ai-services/translator/service-limits#text-translation>
- Pricing: <https://azure.microsoft.com/pricing/details/cognitive-services/translator/>
- Azure OpenAI managed identity: <https://learn.microsoft.com/azure/foundry-classic/openai/how-to/managed-identity>
- Foundry Tools auth (.NET): <https://learn.microsoft.com/dotnet/ai/azure-ai-services-authentication>
- Foundry cost management: <https://learn.microsoft.com/azure/foundry/concepts/manage-costs>
