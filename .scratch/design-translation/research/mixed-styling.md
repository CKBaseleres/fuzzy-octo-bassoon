# Research: Mixed styling inside a Text layer

Ticket: "Mixed styling inside a Text layer" (Lingo Desk ticket 11).
Researched: 2026-11-10 and 2026-11-11. Terms follow `docs/lingo-desk/GLOSSARY.md` (Source design, Language version, Text layer, Protected term, Fixed phrase).

**The question.** When one Text layer mixes styling (a bold word, a second colour, another font, superscript, all caps on part of a sentence), how is that styling carried into the translation and written back to the IDML? Each styled stretch is its own `CharacterStyleRange`, and word order changes between languages, so the stretches cannot be refilled in order.

**How this was sourced.** In order of trust:

1. **Microsoft Learn**, read through the Microsoft Learn fetch tool on 2026-11-10 [M1]–[M8].
2. **Adobe's IDML File Format Specification**, the CS6 edition (the last one published), read on 2026-11-11 from the Internet Archive snapshot of Adobe's own URL [S1]. Section numbers are as printed in the PDF; its numbering is not sequential.
3. **The five stand-in samples** in `.scratch/design-translation/samples/` (InDesign 15, `DOMVersion="15.0"`), read in memory on 2026-11-10. They are downloaded stand-ins, not the team's real files.
4. **Vendor documentation** for other translation tools, read on 2026-11-11 [T1]–[T6]. Some of it was read only through a fetch tool's summary or a search extract; each such case is marked.

**Nothing here was run against Azure or opened in InDesign.** Every statement about how Translator treats inline tags beyond what Microsoft's pages say is marked **untested**. Statements that are my own reasoning are marked **inferred**. Both kinds are collected in [Weakly sourced or untested](#6-weakly-sourced-or-untested).

## TL;DR

- **Microsoft documents that HTML mode exists, not how it places tags.** `textType=html` is in both v3.0 and `2026-06-06`. The only rule stated is "Any HTML needs to be a well-formed, complete element." No Microsoft page read says where inline tags land after reordering, whether unknown tags or attributes survive, or how nesting behaves. All of that must be measured.
- **Word alignment cannot be the mechanism.** `includeAlignment` is v3.0 only, "experimental", unavailable with `textType=html`, unavailable with any prevent-translation method (so not with `notranslate`), and limited mostly to pairs with English. The `2026-06-06` Translate reference has no alignment parameter at all.
- **A Story's ranges can hold much more than text**: tables, footnotes, notes, anchored frames, hyperlinks, text variables, tracked changes, XML tags and processing instructions. Most sit *inside* a `CharacterStyleRange` as siblings of `Content`. A writer that replaces "the text" must carry these through or refuse the layer.
- **Every established IDML translation tool does the same three things**: turn each styled stretch into a paired inline tag the translator must keep, drop kerning/tracking and similar local overrides by default, and offer a "simplify/merge codes" switch for the many-tiny-ranges noise.
- **Recommendation: the hybrid (d).** Normalise ranges first, send each paragraph as HTML with one `<span>` per styled stretch, validate what comes back, write styled ranges when it validates, and otherwise collapse the layer to its dominant styling and flag it "Mixed styling: check in InDesign". Layers with content we cannot carry (tables, tracked changes, and so on) are flagged, not rewritten.
- **The whole approach rests on one unmeasured thing:** how well Translator's NMT keeps `<span>` tags around the right words for fr/it/pt/es/ja. That is the first thing to test against real Azure.

---

## 1. Azure Translator and inline markup

### 1.1 What exists (versions)

- **v3.0** is GA and is the version whose docs describe `notranslate`, the dynamic dictionary and alignment [M1][M3].
- **`2026-06-06`** is GA, "available through Microsoft Foundry", and "**not backward compatible** with v3.0". It adds a choice of NMT or an LLM deployment (for example GPT-5.1) per request, adaptive custom translation, and tone and gender controls [M4][M5]. The request uses `inputs[]`/`targets[]`; `targets.deploymentName` defaults to `general`, "which uses a neural machine translation (NMT) system" [M2].
- The overview page for `2026-06-06` calls it GA and, in the same box, says "Features, approaches, and processes can change or have limited capabilities, before General Availability (GA)" [M5]. The page contradicts itself; I read it as leftover preview wording.

### 1.2 What Microsoft says about markup

| Claim | v3.0 | `2026-06-06` |
|---|---|---|
| `textType` = `plain` (default) or `html` | Yes [M1] | Yes [M2] |
| "Any HTML needs to be a well-formed, complete element." | Yes, verbatim [M1] | Yes, verbatim [M2] |
| An example with tags in and tags out | One: two `<div>`s, the `notranslate` one returned unchanged, the other translated with its tags in place [M1] | None |
| `class="notranslate"` / `translate="no"` | Documented; "works only when the input textType is set as HTML"; brand names are a named use [M3] | **Not mentioned** in the Translate reference [M2] |
| `includeAlignment` | Documented, with limits (below) [M1][M6] | **No such parameter** in the reference [M2] |
| Markup handling with an LLM deployment | n/a | **Not mentioned** [M2][M5] |

That is the whole of it. The v3.0 reference introduces the topic with "It's common to translate content that includes markup such as content from an HTML page or content from an XML document. Include query parameter `textType=html` when translating content with tags" [M1]. No page read says:

- whether an inline tag stays wrapped around the *corresponding* translated words when word order changes;
- whether a tag may be split in two, duplicated, moved, emptied or dropped;
- whether unknown element names, `id`, `class` (other than `notranslate`) or `data-*` attributes come back unchanged;
- whether nesting is preserved;
- whether inline tags affect sentence segmentation or translation quality;
- anything about short strings, or any per-language difference for fr/it/pt/es/ja.

The one output example that does show a tag being placed by the engine is the profanity marker: `Das ist eine <profanity>verdammt</profanity> gute Idee.` [M1]. It shows the service can emit a tag around a specific translated word; it is not evidence about tags we send in.

**Outside reports (secondary, not read in full).** A web search on 2026-11-11 surfaced a Stack Overflow question reporting that with HTML input "the inline html text and style attributes are misplaced in the successful response", and an older Drupal translation-module issue saying the service "sometimes drops HTML" [X1][X2]. I saw both only as search extracts. They show that misplacement is a known kind of failure; they say nothing about how often it happens today.

**Research context.** Tag placement in NMT is a recognised open problem with its own literature, for example Hanneman and Dinu, "How Should Markup Tags Be Translated?" (WMT 2020), which compares two ways of representing tags and tests whether models learn placement [X3] (abstract only read). **Inferred:** no vendor promises exact placement, which is why Microsoft's docs make no promise either.

### 1.3 Word alignment

From the v3.0 reference [M1], confirmed by the word-alignment page [M6]:

- Alignment is "an experimental feature that we enabled for prototyping research".
- "Alignment isn't available for text in HTML format that's, textType=html".
- "Alignment isn't available when you apply any of the approaches to prevent translation" (so not together with `notranslate` or the dynamic dictionary).
- It is returned only for some pairs: English to or from other languages (with exceptions), plus a few CJK pairs.
- No alignment for "canned" translations of very common sentences.
- "One word can align with zero, one, or multiple words in the other language, and the aligned words can be noncontiguous."

So the alternative design "send plain text, get alignment, project the styled stretches ourselves" is blocked three ways: it cannot be combined with Protected terms in `notranslate`, it is experimental, and it does not exist in `2026-06-06`. It could only work on v3.0, from English, for layers with no Protected term.

### 1.4 Limits and cost

- **Tags are billed.** Translator counts "All markup: HTML, XML tags, etc. within the request body text field" [M7]. One `<span id="s1">…</span>` pair costs 21 characters per target language.
- **Size.** Translate: 50,000 characters per array element, 1,000 elements, 50,000 characters per request across all target languages [M8]. With an LLM deployment: 50 elements, 5,000 characters each [M5]. A marketing Text layer is far below either.
- **Latency.** Standard models: 15 s maximum, typically 150–300 ms for text under 100 characters [M8].

### 1.5 NMT versus the LLM mode

Microsoft's docs do not distinguish them for markup. `textType` is a property of the input, listed once, with no note that it applies only to NMT [M2]. **Untested:** whether an LLM deployment honours `textType=html`, keeps tags, or honours `notranslate`. The earlier brand-terminology note already lists `notranslate` on `2026-06-06` as an open question; this ticket adds inline tags to the same test.

The decision already made (Protected terms in `notranslate` on NMT) points to **v3.0 NMT, or `2026-06-06` with `deploymentName` left at `general` if the test shows `notranslate` works there**. Inline styling tags ride on the same request.

---

## 2. What IDML needs

All from the IDML File Format Specification, CS6 edition [S1], section 10.4 "Stories".

### 2.1 Structure

- "All of the text in a `<Story>` element is contained inside `<Content>` elements within `<CharacterStyleRange>` elements." A `ParagraphStyleRange` holds "ranges of continuous paragraph formatting"; a `CharacterStyleRange` is "a continuous run of text formatting" [S1 §10.4.8].
- **One `ParagraphStyleRange` is not one paragraph.** "Multiple paragraphs can appear in a single `<ParagraphStyleRange>`", separated by `<Br/>`: "An empty `<br/>` element represents a return character" [S1 §10.4.8, Example 48]. Paragraph ends are `Br` elements, which can sit inside any `CharacterStyleRange`.
- A `CharacterStyleRange` whose only child is a `Br` with a `GotoNextX` attribute is a column, frame or page break [S1 Example 49].
- Local formatting is carried as attributes on the range (`FontStyle`, `PointSize`, `KerningValue`, `KerningMethod`, `Tracking`, `Capitalization`, `Position`, `Underline`, `StrikeThru`, `Ligatures`, `NoBreak`, `HorizontalScale`, `VerticalScale`, `BaselineShift`, and many more) and as children of a `<Properties>` element (`AppliedFont`, `Leading`, …) [S1 Schema Examples 79, 80].

### 2.2 What can appear besides `CharacterStyleRange` / `Content` / `Br`

The schema for `CharacterStyleRange` allows these children, any number of each, in any order [S1 Schema Example 80]:

`Footnote`, `GaijiOwnedItemObject`, `Note`, `Table`, `TextVariableInstance`, `HyperlinkTextDestination`, `Change`, `HiddenText`, `XMLElement`, `XMLComment`, `XMLInstruction`, `DTD`, `Oval`, `Rectangle`, `GraphicLine`, `Polygon`, `Group`, `TextFrame`, `Button`, `FormField`, `MultiStateObject`, `EPSText`, `PageReference`, `HyperlinkTextSource`, `ParagraphDestination`, `CrossReferenceSource`, `Content`, `Br`.

`ParagraphStyleRange` allows the same list plus `CharacterStyleRange` itself [S1 Schema Example 79]. `Story` allows `ParagraphStyleRange`, `CharacterStyleRange`, `XMLElement`, `Table`, `Footnote`, `Note`, `Change`, `HiddenText`, `TextVariableInstance` and more directly [S1 §10.4, Story schema].

The spec sorts them into two kinds [S1 §10.4.8, "Inline Elements"]:

- **Inline elements**: "represented as text child elements of a `<CharacterStyleRange>` element, and appear as siblings of the `<Content>` element." Tables, footnotes, notes, anchored frames and graphics, form fields.
- **Hyperlink text sources are the exception**: they "appear as child elements of a `<CharacterStyleRange>`, and contain a `<Content>` element" [S1 "Hyperlink Text Sources"]. The linked words are *inside* the element. Cross-reference sources go further and contain whole `CharacterStyleRange`s [S1 Schema Example 90].
- **XML tags wrap ranges from outside**: "The text in `<XMLElement>` elements is contained by `<ParagraphStyleRange>` elements and `<CharacterStyleRange>` elements inside the `<XMLElement>` elements" [S1 §10.4.9]. An `XMLElement` can also appear inside a range around `Content` [S1 Example 52].

When these overlap, InDesign breaks ranges by a fixed priority, "from strongest (never break) to weakest": XML, Hyperlink, Changed text, `ParagraphStyleRange`, `CharacterStyleRange`, `Content` [S1 §10.4.10]. So a hyperlink or XML tag is never split by a styling change; the styling ranges are split to fit inside it.

### 2.3 What must survive, element by element

| Element | Where its text lives | What a text replacement must do |
|---|---|---|
| `Content` | Itself | Replace |
| `Br` | n/a (a return) | Keep the same count and order per `ParagraphStyleRange`: paragraphs map one to one |
| `CharacterStyleRange` with `GotoNextX` + `Br` | n/a | Keep untouched, in position between paragraphs |
| Anchored `TextFrame`, `Rectangle`, `Oval`, `Polygon`, `GraphicLine`, `Group`, `Button`, `FormField`, `MultiStateObject`, `EPSText` | Not in this Story. "The content of the inline text frame itself does not appear in the `<Story>` containing the frame"; the frame's `ParentStory` points at another Story [S1 "Anchored Frames"] | Keep the whole element byte for byte, at a sensible position in the paragraph. The anchored frame's own Story is a separate Text layer |
| `Table` | In `Cell` elements, each holding its own `ParagraphStyleRange`s [S1 "Tables"] | Keep the element; each cell is a separate piece of text |
| `Footnote` | Inside it, in its own `ParagraphStyleRange`s; its content starts with the processing instruction `<?ACE 4?>` (the footnote number marker) [S1 Example 54] | Keep the element and its position (the reference mark is where the element sits). Its text is a separate piece of text; the `<?ACE 4?>` must stay |
| `Note` | Inside it; "non-printing" [S1 "Notes"] | Keep untouched. Do not translate |
| `HyperlinkTextSource` | Inside it, in `Content` | Keep the wrapper and its `Self` (hyperlink definitions in `designmap.xml` refer to it); replace the text inside. It behaves like one more styled stretch |
| `HyperlinkTextDestination`, `ParagraphDestination`, `PageReference` | None (point markers) | Keep, at a sensible position |
| `CrossReferenceSource` | Generated text plus `TextVariableInstance` | Keep untouched; InDesign regenerates it |
| `TextVariableInstance` | `ResultText` attribute (generated) | Keep untouched |
| `Change` | Tracked insertions and deletions | Do not rewrite. See 2.4 |
| `HiddenText` | Conditional text that is hidden | Keep untouched |
| `XMLElement`, `XMLComment`, `XMLInstruction`, `DTD` | `XMLElement` wraps ranges or `Content` | Keep the wrappers and their `Self`/`MarkupTag`; the structure in `XML/BackingStory.xml` refers to them |
| `GaijiOwnedItemObject` | A custom glyph | Keep untouched |
| Processing instructions inside `Content` | n/a | Keep. See 2.4 |

### 2.4 Things the spec leaves thin

- **Special characters as processing instructions.** The only one the spec's Stories section shows is `<?ACE 4?>` inside a footnote [S1 Example 54], with no table of codes. The CS6 spec's own change list says the format "Eliminates the use of processing instructions in text content for text object placement" [S1, introduction], so anchors are elements, not PIs. From general knowledge of InDesign-exported IDML (**weakly sourced**, not in the spec text I read): automatic page numbers, section markers, "indent to here" and right-indent tabs appear as `<?ACE n?>` inside `Content`, while ordinary tabs, forced line breaks (U+2028), non-breaking spaces, discretionary hyphens (U+00AD) and other special spaces appear as literal Unicode characters. Redokun's help lists `pageNumber`, `footNote`, `section` and `indentHereTab` as "markers" it shows to translators [T6], which matches that list.
- **Tracked changes.** `Change` is in the schema and in the break-priority list [S1 §10.4.10], but I did not find a worked example in the Stories section. A Story also has `TrackChanges="true|false"` [S1 Table 106].
- **The spec is from 2012.** Elements added since (for example endnotes: the samples carry `IsEndnoteStory="false"` on `Story`, which the CS6 schema does not list) are not covered. The writer must keep elements and attributes it does not recognise.

### 2.5 What the samples show

Across the five stand-ins (29 Stories), the only elements inside Stories are `Story`, `StoryPreference`, `InCopyExportOption`, `ParagraphStyleRange`, `CharacterStyleRange`, `Properties`, `AppliedFont`, `Content` and `Br`. There are no processing instructions, no anchored objects, no hyperlinks, no tables, no footnotes. Only two paragraphs have more than one `CharacterStyleRange`: `Story_u398` in `bounded-text.idml` (18 ranges) and one Story in `themes.idml` (2 ranges). **The stand-ins exercise mixed styling once and none of section 2.2.** Real brand files will have to supply the rest of the evidence.

Attributes seen on ranges: `FillColor`, `FontStyle`, `PointSize`, `Capitalization`, `Position`, `Ligatures`, `OTFContextualAlternate`, `Tracking`, `StrokeWeight`, `StrokeColor`.

---

## 3. What other tools do

| Tool | Inline styling | Noise handling | Source |
|---|---|---|---|
| **Okapi Framework IDML filter** (open source) | Styled stretches become inline codes in the extracted text unit. Special characters matching a configurable pattern (invisible and hyphen-like characters by default) are also inline codes | "Merge Adjacent Codes" (default false). Four separate options to ignore character **kerning, tracking, leading and baseline shift** (each default false). Older option "Simplify inline codes when possible" regrouped adjacent codes. "Untag XML Structures" skips XML tagging | [T1], read through a fetch-tool summary |
| **XLIFF 2.1** (the interchange standard these tools share) | `<pc>` "Represents a well-formed spanning original code"; `<ph>` "a standalone code"; `<sc>`/`<ec>` the start and end of a spanning code that need not be well-formed. Each code carries `canCopy`, `canDelete`, `canReorder`, `canOverlap` hints | n/a | [T2] §4.2.3, §4.3.1. I could not load §4.7 (the rules for editing codes in the target), so I make no claim about it |
| **memoQ** | Formatting becomes inline tags (bold/italic as formatting, the rest as tags). "Treat semibold as bold" exists because the editor only knows bold | Seven "Maintain locally defined …" switches (tracking, kerning, baseline shift, vertical scale, horizontal scale, skew, leading). All are off by default: "Normally memoQ uses its own" | [T3], fetch-tool summary |
| **Trados Studio** | Formatting and character-style changes become tag pairs in the segment | An IDML file-type option to skip tracking and kerning. The help text, as quoted in a search extract: kerning and tracking on source text are "usually too closely aligned to the source language text layout to be useful for the translated text"; if processed they appear as `<k…>` and `<t…>` tags | [T4], **search extract only**; the page itself returned empty |
| **Phrase TMS** | Tags in the segment | "Simplify codes: Removes excessive text formatting from the job and the completed file." "Keep kerning" and "Keep tracking" are opt-in. "Remove XML elements" strips XML tagging "leaving fewer formatting tags" | [T5], fetch-tool summary |
| **Redokun** (aimed at marketing teams, not translators) | Numbered tags at the start and end of styled text ("bold, italics, underlines, colors, and hyperlinks"); the person should "keep them in the same position". A misplaced tag is deleted and re-inserted with the Tab key | Tags are expected in the translation; "markers" for special characters (soft returns, special spaces, page number, footnote, indent-here) are **not enforced**. Settings convert soft returns and special spaces to cut markers | [T6], fetch-tool summary |

What they agree on:

1. **A styled stretch is a paired tag around words, and a person places it.** None of these tools trusts machine translation to place tags without review; the tags are visible in the editor and missing tags are reported.
2. **Kerning and tracking are dropped unless asked for.** Three vendors make this the default, and one says why: such overrides were tuned to the source wording.
3. **There is always a "merge/simplify" switch**, because InDesign files produce far more ranges than a person intended. Translators' forums call the result "tag soup" [T4, search results].
4. **Point-like things are standalone placeholders** (`<ph>` in XLIFF terms): page numbers, anchors, footnote references.
5. **Styling the source does not have cannot be added.** A memoQ user thread notes translators cannot add bold or italic to the target unless the source has it (search extract, [T3]). The stretches available in the translation are the source's stretches.

Smartcat was not researched; I found no primary documentation of its IDML handling in the time available.

---

## 4. Options for the first release

### 4.1 Worked example: Story `u398` ("OpenType Features") in `bounded-text.idml`

One `ParagraphStyleRange` (centred), one paragraph, 295 characters, 18 `CharacterStyleRange`s. All are `[No character style]`, 18 pt, with local overrides:

| # | Text | Font | Local styling |
|---|---|---|---|
| 1 | `Lorem ipsum` | Raleway Bold | magenta |
| 2 | (one space) | Raleway Bold | cyan |
| 3 | `dolor sit amet, ` | Raleway Bold | blue |
| 4 | `all caps` | Raleway Bold | blue, `Capitalization="AllCaps"` |
| 5 | `, sed do eiusmod … magna aliqua. ` | Raleway Bold | blue |
| 6 | `Anothe` | Pacifico | magenta |
| 7 | `r` | Pacifico | magenta, `Ligatures="false"`, `OTFContextualAlternate="false"` |
| 8 | ` font wit` | Pacifico | magenta |
| 9 | `h` | Pacifico | as 7 |
| 10 | ` ligature` | Pacifico | magenta |
| 11 | `s` | Pacifico | as 7 |
| 12 | `,` | Pacifico | magenta |
| 13 | (one space) | Raleway Bold | none |
| 14 | `superscript` | Raleway Bold | `Position="Superscript"` |
| 15 | (one space) | Raleway Bold | none |
| 16 | `subscript` | Raleway Bold | `Position="Subscript"` |
| 17 | ` ut aliquip ex ea commodo consequat. ` | Raleway Bold | none |
| 18 | `UPPER CASE irure dolor … nulla pariatur.` | Raleway Bold | green |

Three kinds of noise are visible:

- **A word cut by letter-level overrides.** "Another", "with" and "ligatures" are each split because single letters had ligatures switched off (ranges 6–12).
- **A whitespace-only range with its own colour.** Range 2 is one cyan space. A fill colour on a space is invisible.
- **Whitespace-only ranges between styled words** (13, 15), identical to range 17.

### 4.2 Step zero for every option except (c): normalise the ranges

**Inferred design, modelled on what the tools in section 3 do.**

1. **Compare ranges on a "meaningful" attribute set only.** Ignore a noise list when deciding whether two neighbouring ranges are the same stretch. Start the list with what the vendors drop by default: `KerningValue`, `KerningMethod`, `Tracking`, `BaselineShift`, `HorizontalScale`, `VerticalScale`, `Skew`, `Leading` (three vendors, section 3). Add, as our own judgement: `Ligatures`, the `OTF…` feature switches and `NoBreak`, because they are tuned to particular letters of the source wording.
2. **Fold whitespace-only ranges into a neighbour**, unless the range carries something visible on a space (underline, strikethrough).
3. **Merge neighbours that are now equal.** The merged stretch takes the attributes of its largest member, so a noise attribute set on one letter is dropped, and one set on the whole stretch is kept.
4. **Treat a boundary inside a word** (letters on both sides, no space) as noise if the two sides differ only in noise attributes. If they differ in a meaningful attribute (half a word in another colour), keep the boundary: that is deliberate, and such a layer will usually end at the fallback.

Applied to `u398`, 18 ranges become **11 stretches**:

| Stretch | From ranges | Text | Styling |
|---|---|---|---|
| A | 1–2 | `Lorem ipsum ` | Raleway Bold, magenta |
| B | 3 | `dolor sit amet, ` | Raleway Bold, blue |
| C | 4 | `all caps` | Raleway Bold, blue, AllCaps |
| D | 5 | `, sed do … aliqua. ` | Raleway Bold, blue |
| E | 6–12 | `Another font with ligatures,` | Pacifico, magenta |
| F | 13 | (space) | Raleway Bold |
| G | 14 | `superscript` | Raleway Bold, superscript |
| H | 15 | (space) | Raleway Bold |
| I | 16 | `subscript` | Raleway Bold, subscript |
| J | 17 | ` ut aliquip … consequat. ` | Raleway Bold |
| K | 18 | `UPPER CASE irure … pariatur.` | Raleway Bold, green |

Lost on purpose: ligatures-off on the letters r, h and s, and the cyan space. Neither can mean anything in a translation.

`Capitalization="AllCaps"` is an attribute: the stored text is `all caps` in lower case and InDesign displays it in capitals. The translation is written in normal case and the attribute does the rest. "UPPER CASE" in range 18 is typed in capitals; whether the translation keeps capitals is up to the engine and is not a styling matter.

### 4.3 The options

**(a) HTML with one tag per styled stretch.** Send each paragraph as one HTML string. Pick the stretch styling that covers the most characters as the paragraph's base and leave it unwrapped; wrap every other stretch in `<span id="sN">`; put Protected terms in `<span class="notranslate">` inside whatever stretch they fall in. For `u398` the base is K's green (103 characters, against 85 for blue), so, with entities escaped:

```html
<span id="s1">Lorem ipsum </span><span id="s2">dolor sit amet, </span><span id="s3">all caps</span><span id="s2">, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. </span><span id="s4">Another font with ligatures,</span><span id="s5"> </span><span id="s6">superscript</span><span id="s5"> </span><span id="s7">subscript</span><span id="s5"> ut aliquip ex ea commodo consequat. </span>UPPER CASE irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.
```

An id names a *styling*, not a position, so B and D share `s2` and F, H and J share `s5`. That lets the engine split or join same-styled pieces freely. (Whether repeated ids upset the engine is **untested**; the alternative is unique ids mapped to stylings on our side.)

Writing back: parse the returned string; each run of text becomes one new `CharacterStyleRange` cloned from a source range of that styling (all attributes and `Properties`, noise included for a whole-stretch attribute), with the translated text as `Content`. Unwrapped text takes the base styling.

- For: keeps the designer's intent when it works; same request that already carries `notranslate`; no second service.
- Against: correctness depends on tag placement that Microsoft does not document (section 1.2). A span around the wrong words produces a file that looks deliberate and is wrong, which nothing but a person can catch.

**(b) Collapse to one styling and flag.** Translate the paragraph as plain text (or HTML with only `notranslate`), write it as a single `CharacterStyleRange` with the **dominant** styling (most characters; first wins a tie), and flag the layer "Mixed styling: check in InDesign".

For `u398`: the whole paragraph comes out Raleway Bold 18 pt green. Magenta, blue, Pacifico, all caps, superscript and subscript are gone, and the designer re-applies them by hand.

- For: always produces a valid, predictable file; no dependence on tag placement; trivial editor.
- Against: every mixed layer costs designer time, and loses things that matter legally or typographically (a superscript ® or footnote mark, a price in another weight). "First" instead of "dominant" would have made this layer magenta from an 11-character opening; dominant is the better default.

**(c) Translate each stretch separately.** Send each `CharacterStyleRange`'s text as its own string and refill in order.

For `u398` un-normalised: 18 requests' worth of fragments including `Anothe`, `r`, ` font wit`, `h`, four lone spaces and a comma. Even normalised, `Lorem ipsum ` / `dolor sit amet, ` / `all caps` / `, sed do …` are four pieces of one sentence.

Why it is bad:

- **Word order is frozen at stretch boundaries.** A styled adjective cannot move after its noun (English to French, Italian, Spanish, Portuguese) and nothing can move to the end of a Japanese clause.
- **No context.** Each fragment is translated alone, so gender and number agreement, articles and elisions across the boundary are wrong, and a lone word is translated in its most common sense.
- **Fragments are not language.** `Anothe` and `r` have no translation; this is why normalisation exists at all.
- It is also what the alignment docs call out indirectly: one word can map to "zero, one, or multiple words", "noncontiguous" [M1]. A stretch-by-stretch refill assumes one to one, in order.

It is safe in exactly one case: **every stretch boundary is a sentence boundary** (a bold first sentence, a second sentence in another colour). Then each stretch is a complete unit and the mapping is exact with no reliance on tag placement. This is worth using as a deterministic shortcut inside (d); in `u398` only stretch K qualifies.

**(d) Hybrid.** Normalise (4.2), then:

1. One stretch left after normalising: not mixed. Translate as plain text plus `notranslate`.
2. Every boundary on a sentence boundary: translate per stretch (the safe case of (c)).
3. Otherwise send as in (a), then **validate** the returned string:
   - it parses as well-formed markup;
   - only `<span>` elements, only ids we sent, no extra attributes;
   - every id we sent is present (a split into two spans with the same id is accepted);
   - no span that held text comes back empty or whitespace-only;
   - nesting is no deeper than sent, and every `notranslate` span's content is byte-identical to what was sent;
   - the text outside all tags is not empty when the source had base text.
4. Valid: write styled ranges, and mark the layer "Styling carried over: check placement" so a reviewer looks at it.
5. Invalid: strip the tags, write as (b), flag "Mixed styling: check in InDesign".

Validation proves the markup is *complete*, not that it is *right*: a span around the wrong noun passes. That is why step 4 still marks the layer for a look, and why the editor has to show the stretches (4.5).

For `u398`, (d) takes path 3. If French comes back with all seven ids present and well-formed, the export has roughly 11 ranges with magenta, blue, all caps, Pacifico, superscript and subscript on whatever words the engine wrapped. If `s6` is missing, the whole paragraph is written green and flagged.

### 4.4 Options table

| | (a) HTML tags, trust the result | (b) Collapse + flag | (c) Per stretch | (d) Hybrid |
|---|---|---|---|---|
| Styling kept | When the engine places tags well | Never | Yes, on the wrong words | When validation passes, else as (b) |
| Translation quality | Full sentence context (effect of tags on quality **untested**) | Best: plain sentence | Poor: fragments, frozen order | As (a) or (b) |
| Wrong-looking output without warning | Possible (misplaced or dropped tag) | No | Yes, routinely | Reduced: dropped or broken tags are caught; misplaced ones are not |
| Depends on undocumented Azure behaviour | Entirely | No | No | Yes, with a safe fallback |
| Designer effort per mixed layer | Low when right | Re-apply all inline styling | Rewrite the text | Low when valid, as (b) otherwise |
| Build cost | Range normaliser, HTML writer and parser, range rebuilder | Smallest | Small | (a) plus validator plus (b) |
| Editor needs | Must show stretches | Plain text | Plain text per fragment | Must show stretches; plain text when collapsed |
| Extra Azure cost | Tag characters billed [M7] | None | None | As (a) |
| `u398` result | ~11 styled ranges, placement unverified | One green range, flagged | 18 fragments | ~11 styled ranges and "check placement", or one green range and a flag |

### 4.5 What the translation editor has to show

The editor is a list of Text layers, original beside editable translation. For a mixed layer there are three levels:

1. **Plain text only; styling lost on edit.** The translation box is a plain text area. If a person changes the text of a layer whose styling was carried over, the stretches no longer map, so the layer drops to (b) on export and gains the flag. Cheapest. It punishes the commonest action (fixing one word) by throwing away styling that was correct.
2. **Stretches shown as highlights, editable in place.** The translation box is a rich text field in which each stretch is a highlighted span with a small number or colour that matches the same stretch in the original beside it. Typing inside a highlight keeps that styling; typing outside is base text; deleting all of a highlight's text removes the stretch and shows "styling N not applied". A person can select words and assign them to one of the layer's existing stretches, or clear styling. Pasting is forced to plain text. This is what Redokun does for the same kind of user, with numbered tags [T6].
3. **Translator-style tag chips with enforcement** (memoQ, Trados, Phrase): paired tag tokens that must all be present before the layer can be approved. Familiar to professional translators, heavy for a marketing team, and it blocks work over tags that may be noise.

The stretches offered are only those in the source layer; nobody can invent new styling in the editor (the same rule the translation tools have, section 3).

The preview should render stretches with at least colour, weight, superscript/subscript and caps so a misplaced span is visible without opening InDesign.

---

## 5. Recommendation for the first release

**Build the hybrid (d), with editor level 2, and decide whether path 3 ships switched on only after the Azure test below.**

1. **Normalise always** (4.2). It is needed by every option, it is deterministic, it can be unit-tested on `u398` today, and on its own it turns many "mixed" layers into single-stretch layers that need nothing further.
2. **Translate paragraph by paragraph.** A unit is the text between `Br`s, so paragraphs map one to one and `Br` elements and paragraph formatting never move.
3. **Sentence-aligned stretches go per stretch; the rest go as HTML with `<span id>`** on the same NMT request that carries `notranslate`, followed by validation and the (b) fallback with "Mixed styling: check in InDesign".
4. **Only rewrite layers made of things we understand.** For the first release that is `CharacterStyleRange`, `Content`, `Br`, literal special characters, and `HyperlinkTextSource` treated as one more stretch. A layer containing anything else from section 2.2 (anchored objects, tables, footnotes, notes, text variables, cross-references, tracked changes, XML tags, hidden text, processing instructions) is **not rewritten**: it keeps its source text in the export and is flagged "Contains [thing]: translate in InDesign". Carrying point-like objects through as empty placeholder tags is the obvious next step, and is left out because how Translator treats empty inline elements is unknown.
5. **Rebuild ranges by cloning.** New `CharacterStyleRange`s are copies of source ranges with new `Content`; nothing is synthesised. Unknown attributes and elements are kept as found.
6. **Editor**: highlights that can be edited in place (level 2). If that is too much for the first release, ship level 1 and accept that hand-edited mixed layers fall back to the flag.
7. **Fixed phrases** bypass all of this: they are matched before translation and their approved wording has no stretch mapping. A mixed-styled layer that is a Fixed phrase is written with the dominant styling and flagged, unless the brand team later stores styling with the phrase. (**Inferred**; this interaction belongs to whoever owns the Fixed phrase store.)

**If the Azure test shows tags are placed badly** (say, validation fails or spans sit on the wrong words in more than a small share of real layers for any of the five languages), ship with path 3 switched off: normalise, use the sentence-aligned shortcut, collapse and flag the rest. Nothing else in the design changes, which is the reason to prefer (d) over (a).

**Why not (b) alone:** the stand-ins have one mixed layer in 29 Stories, but they are stand-ins. Brand collateral routinely has a bold lead-in, a coloured word, a superscript mark. Flagging every one of them hands the designer the work the tool exists to remove.

---

## 6. Weakly sourced or untested

To confirm against **real Azure**:

1. **Tag placement.** Does `textType=html` on NMT keep `<span id="…">` around the corresponding words for en→fr, it, pt, es, ja? Measure on real brand strings, including a styled adjective before a noun (which must move), a styled word mid-sentence, and Japanese. Not documented anywhere I read.
2. **Attributes and tag names.** Are `id` values (or `class`, `data-*`) returned unchanged? Are repeated ids tolerated? Are spans ever renamed, merged, split, duplicated, emptied or dropped? Only `class="notranslate"` on a `<div>` is shown surviving [M1].
3. **Nesting with `notranslate`.** A `notranslate` span inside a styled span, and a styled span that is entirely a Protected term. Undocumented.
4. **Short strings.** Two- to five-word headlines with one styled word. Undocumented.
5. **Effect on translation quality and segmentation.** Does wrapping words in spans change the translation compared with plain text? Do inline spans ever cause a sentence break? Undocumented.
6. **`2026-06-06`.** Does `notranslate` work at all there, with `general` NMT and with an LLM deployment, and are inline tags kept? The reference is silent on both [M2]. Until shown otherwise, assume v3.0.
7. **Empty inline elements** as placeholders for anchors and other point-like objects: kept in place, moved, or dropped? Needed before recommendation 4 can be relaxed.
8. **Whitespace at span edges.** Whether the engine keeps, moves or drops the space inside `<span id="s1">Lorem ipsum </span>`. The writer may need to normalise spaces to outside the spans before sending.
9. **Reported misplacement.** The Stack Overflow and Drupal reports [X1][X2] were seen only as search extracts and are old; they show the failure mode exists, not its rate.

To confirm at the **round-trip gate** (a designer opening exported files in InDesign):

10. **Cloned ranges reopen cleanly.** A paragraph rebuilt with a different number of `CharacterStyleRange`s than the source, in a different order, opens without warnings and looks as intended.
11. **Dropping noise attributes is acceptable.** Designers agree that losing per-letter ligature/OpenType switches, kerning and tracking overrides inside a stretch is right. The noise list in 4.2 beyond what the vendors drop (ligatures, OTF features, `NoBreak`) is my own judgement.
12. **Whitespace-only ranges.** Folding a coloured space into its neighbour changes nothing visible, including when the space is underlined or struck through (which we keep).
13. **Collapsed layers.** "Dominant styling" is the fallback designers want, rather than "first" or the paragraph style with no overrides.
14. **`HyperlinkTextSource` as a stretch.** Replacing the `Content` inside it while keeping the element and its `Self` leaves the hyperlink working.
15. **Untouched layers.** A layer we refuse to rewrite (table, footnote, anchored object) really is byte-identical in the export and reopens as in the source.

Weak sourcing in this note:

16. **Processing instructions for special characters.** The spec text I read shows only `<?ACE 4?>` in a footnote [S1 Example 54]. The list of other `ACE` codes, and which special characters are literal Unicode, is from general knowledge and Redokun's marker list [T6], not from the spec. The samples contain none. Confirm from a real file with page numbers, tabs and forced line breaks.
17. **The spec is the CS6 edition (2012).** Elements added later are not covered; the samples are `DOMVersion="15.0"`. The schema lists were read from text extracted from the PDF, where line breaks and soft hyphens are noisy; element names were checked against the examples but not against a generated schema (`app.generateIDMLSchema()`).
18. **Other tools.** Okapi, memoQ, Phrase and Redokun pages were read through a fetch tool that summarises, so wording is close paraphrase unless quoted. The Trados option is from a search extract only; the page returned empty. XLIFF 2.1 §4.7 (rules for changing codes in the target) could not be loaded; only §4.2.3 and §4.3.1 are relied on. Smartcat was not researched.
19. **The samples are stand-ins** with one genuinely mixed layer. How common mixed styling, hyperlinks, anchored objects and tables are in the team's real files is unknown, and it decides how much recommendation 4 costs.
20. **Fonts.** Stretch E is Pacifico, which has no Japanese. The font swap for Japanese (decided elsewhere) applies per rebuilt range; if two source fonts map to the same Japanese fallback, two stretches become visually identical. Not examined here.

---

## Sources

Microsoft Learn (read 2026-11-10):

- [M1] Translator 3.0: Translate. https://learn.microsoft.com/azure/ai-services/translator/text-translation/reference/v3/translate
- [M2] Translate (2026-06-06). https://learn.microsoft.com/azure/ai-services/translator/text-translation/2026-06-06/translate-api
- [M3] Prevent content translation. https://learn.microsoft.com/azure/ai-services/translator/text-translation/how-to/prevent-translation
- [M4] Migrate to Translator Text API 2026-06-06. https://learn.microsoft.com/azure/ai-services/translator/text-translation/how-to/migrate-to-2026-06-06
- [M5] What is Azure Translator text translation? (2026-06-06 overview, service limits). https://learn.microsoft.com/azure/ai-services/translator/text-translation/2026-06-06/overview
- [M6] Word alignment. https://learn.microsoft.com/azure/ai-services/translator/text-translation/how-to/word-alignment
- [M7] Translator FAQ, "How does Azure Translator count characters?" (read as a search-tool excerpt of the page). https://learn.microsoft.com/azure/ai-services/translator/faq
- [M8] Translator service limits. https://learn.microsoft.com/azure/ai-services/translator/service-limits

Adobe (read 2026-11-11):

- [S1] Adobe, *IDML File Format Specification* (InDesign CS6). Originally `https://wwwimages.adobe.com/content/dam/acom/en/devnet/indesign/sdk/cs6/idml/idml-specification.pdf` (no longer served); read from `http://web.archive.org/web/20210902235940/http://wwwimages.adobe.com/content/dam/acom/en/devnet/indesign/sdk/cs6/idml/idml-specification.pdf`. Sections cited: 10.4 Stories (Story schema, Tables 106–108), 10.4.8 Text Child Elements (Schema Examples 79 and 80, IDML Examples 47–51), 10.4.9 XML Elements in Text (Example 52), 10.4.10 Rules for Breaking Text Range Elements, "Inline Elements" (Tables, Footnotes Example 54, Notes Example 55, Anchored Frames, Anchored Graphics Example 57, Hyperlink Text Sources, Hyperlink Text Destinations Example 59, Cross Reference Sources Schema Example 90).

Other tools (read 2026-11-11):

- [T1] Okapi Framework wiki, IDML Filter. https://okapiframework.org/wiki/index.php/IDML_Filter
- [T2] OASIS, XLIFF Version 2.1, §4.2.3 Inline Elements and §4.3.1 XLIFF Attributes. https://docs.oasis-open.org/xliff/xliff-core/v2.1/os/xliff-core-v2.1-os.html
- [T3] memoQ documentation, Adobe InDesign Markup Language (IDML) documents. https://docs-memoq-com.azurewebsites.net/current/en/Workspace/adobe-indesign-markup-language.html (and, as a search extract only, a ProZ memoQ support thread on adding inline tags in IDML targets)
- [T4] RWS Community, "Skip tracking and kerning in Project Settings > File Types > IDML" (search extract only; page returned empty). https://community.rws.com/product-groups/trados-portfolio/trados-studio/f/studio/9027/skip-tracking-and-kerning-in-project-settings-file-types-idml
- [T5] Phrase TMS, File Import Settings, Adobe InDesign (.IDML). https://support.phrase.com/hc/en-us/articles/5709612714140
- [T6] Redokun help, Tags and Markers. https://help.redokun.com/article/54-tags-and-markers

Secondary (2026-11-11):

- [X1] Stack Overflow question 74372426, "Azure cognitive text translation service not returning proper response when html…" (search extract only). https://stackoverflow.com/questions/74372426
- [X2] Drupal.org, TMGMT Microsoft translator issue 2042873 (search extract only). https://www.drupal.org/project/tmgmt_microsoft/issues/2042873
- [X3] Hanneman and Dinu, "How Should Markup Tags Be Translated?", WMT 2020 (abstract only). https://aclanthology.org/2020.wmt-1.138/
