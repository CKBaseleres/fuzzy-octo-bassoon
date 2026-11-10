# Research: Fonts and scripts the brand fonts can't render

Ticket: [04 Fonts and scripts the brand fonts can't render](../issues/04-fonts-and-scripts.md)
Researched: 2026-11-10. Terms follow `docs/lingo-desk/GLOSSARY.md` (Source design, Language version, Text layer, Exported design).

**The question:** when a Language version's Text layers hold Japanese (or accented Latin) text and the Source design was set in Agrandir or Helvetica, what must we write into the IDML so the Exported design reopens cleanly in InDesign, and how do we map fonts per language?

**How this was sourced.** Three kinds of evidence, in order of trust:

1. **Adobe's IDML File Format Specification** (CS6, 430 pages; the copy Adobe used to host, read from the Internet Archive snapshot of Adobe's own URL) [S1]. Adobe has withdrawn the PDF from its site; no newer spec PDF was found.
2. **The five stand-in samples** in `.scratch/design-translation/samples/` (InDesign 15, `DOMVersion="15.0"`), read in memory. Snippets below are real, trimmed with `…`.
3. **Adobe help (helpx.adobe.com)**. Direct fetches were refused (HTTP 403) on 2026-11-10, so helpx claims below rest on **search-engine extracts of those pages**, not a full read. Each is marked *(helpx extract)*. Treat exact wording as unconfirmed.

Anything resting on forum posts, or on my own inference, is marked **weakly sourced** and collected in [Weakly sourced and untested](#weakly-sourced-and-untested).

## TL;DR

- **InDesign does no automatic font fallback.** A character the applied font lacks is not swapped to another font, so Japanese text left in Agrandir or Helvetica will not render. We must change the font ourselves. (Behaviour on reopen is weakly sourced; see section 2.)
- **Neither brand font has Japanese.** Agrandir: 443 glyphs per style, Latin languages only [F1]. Helvetica and Helvetica Neue: no kana or kanji in any of the 20 faces Apple ships (checked from the font files) [F4]; Monotype itself points Neue Helvetica users to a separate Japanese font [F3].
- **Both brand fonts cover French, Italian, Portuguese and Spanish.** So fr/it/pt/es need **no font change**, only `AppliedLanguage`. Agrandir's individual glyphs (œ in particular) should still be confirmed from the team's licensed font files.
- **Recommendation:** a configurable map **(brand family, brand style, language) → (fallback family, fallback style)**, applied by **rewriting `AppliedFont` and `FontStyle` wherever the brand font is set** (style definitions in `Styles.xml` and local overrides in Stories). Not a composite font.
- **Default Japanese fallback: Source Han Sans / Noto Sans JP** (same design, SIL OFL 1.1, free to install, free to self-host as a web font, seven weights) [F5][F6][F7]. Kozuka Gothic Pr6N is the alternative if the team wants an Adobe Fonts–only setup.
- **The designer must have the fallback font installed** (or activated from Adobe Fonts). IDML never embeds fonts [S1 §6.1].
- **Also set for Japanese:** `AppliedLanguage`, and (pending one test) the Japanese composer plus a kinsoku and mojikumi set. **Leave `ParagraphDirection` alone**: Japanese is left-to-right.

## 1. How IDML stores fonts and script settings

### `Resources/Fonts.xml`

The spec: "The fonts and composite fonts used in a document are defined in the Fonts.xml file… Even an empty InDesign document contains references to default fonts and composite fonts." And: "InDesign documents do not support font embedding, and fonts are not embedded in IDML. A font used within a document is represented by a simple reference… If fonts referred to in the IDML package are not installed on the system when you try to import an IDML package in InDesign, missing font warnings will appear." [S1 §6.1]

Two element kinds: `<FontFamily>` (holding `<Font>` children) and `<CompositeFont>`.

From `bounded-text.idml`:

```xml
<FontFamily Self="did8" Name="Raleway">
  <Font Self="did8FontnRaleway Bold" FontFamily="Raleway" Name="Raleway Bold"
        PostScriptName="Raleway-Bold" Status="Installed" FontStyleName="Bold"
        FontType="OpenTypeTT" WritingScript="0" FullName="Raleway Bold" … />
</FontFamily>
<FontFamily Self="di91" Name="Kozuka Mincho Pr6N">
  <Font Self="di91FontnKozuka Mincho Pr6N R" FontFamily="Kozuka Mincho Pr6N" Name="Kozuka Mincho Pr6N R"
        PostScriptName="KozMinPr6N-Regular" Status="Installed" FontStyleName="R"
        FontType="OpenTypeCID" WritingScript="1" FullNameNative="小塚明朝 Pr6N R" … />
  <Font Self="di91FontnKozuka Mincho Pr6N EL" … Status="Substituted" FontStyleName="EL" … />
</FontFamily>
```

- `Status` is one of `Installed`, `NotAvailable`, `Fauxed`, `Substituted`, `Unknown`. `WritingScript` is "0" for Roman, "1" for Japanese, "2" for Traditional Chinese. [S1 Table 120]
- **`Fonts.xml` is a snapshot of the exporting machine, not a list of fonts in use.** All five samples list Minion Pro (many styles), Myriad Pro and Kozuka Mincho Pr6N although no Story uses them, and they record that machine's state: only `Kozuka Mincho Pr6N R` is `Installed`, its other five weights (`EL`, `L`, `M`, `B`, `H`) are `Substituted`, and some bundled Latin styles (for example Myriad Pro Bold Condensed) are `NotAvailable`. All three status values appear in every sample.
- `designmap.xml` points at it with `<idPkg:Fonts src="Resources/Fonts.xml" />`. In the schema this element is **optional** (`element idPkg:Fonts {…}?`). [S1 §10.2]

### `AppliedFont` and `FontStyle`

The spec: elements "refer to fonts using either the Self attribute or Name attribute of the `<Font>` element… Many elements use a combination of an `<AppliedFont>` property to specify the font family, and a `<FontStyle>` attribute to specify the font style." [S1 §6.1.1]

So a font is **two fields**: family name in a `<Properties><AppliedFont>` child, style name in a `FontStyle` attribute. Both can sit at three levels, nearest wins:

1. **Local override on a `CharacterStyleRange`** in a Story. From `Stories/Story_u398.xml`:

   ```xml
   <ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/$ID/NormalParagraphStyle" Justification="CenterAlign">
     <CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]"
                          FillColor="Color/C=0 M=100 Y=0 K=0" FontStyle="Bold" PointSize="18">
       <Properties>
         <AppliedFont type="string">Raleway</AppliedFont>
       </Properties>
       <Content>Lorem ipsum</Content>
     </CharacterStyleRange>
     <CharacterStyleRange … PointSize="18">          <!-- no FontStyle: inherits "Regular" -->
       <Properties>
         <AppliedFont type="string">Pacifico</AppliedFont>
       </Properties>
       <Content>Anothe</Content>
     </CharacterStyleRange>
   ```

2. **A `CharacterStyle` or `ParagraphStyle`** in `Resources/Styles.xml`, with a `BasedOn` chain.
3. **The root `[No paragraph style]`**, which carries a full set of defaults. From `Styles.xml` (attributes trimmed):

   ```xml
   <ParagraphStyle Self="ParagraphStyle/$ID/[No paragraph style]" … FontStyle="Regular" PointSize="12"
       Composer="HL Composer" AppliedLanguage="$ID/English: USA" Hyphenation="true" …
       KinsokuType="KinsokuPushInFirst" KinsokuHangType="None" BunriKinshi="true" …
       LeadingModel="LeadingModelAkiBelow" TreatIdeographicSpaceAsSpace="true" …
       CharacterDirection="DefaultDirection" ParagraphDirection="LeftToRightDirection" …>
     <Properties>
       <AppliedFont type="string">Minion Pro</AppliedFont>
       <Mojikumi type="enumeration">Nothing</Mojikumi>
       <KinsokuSet type="enumeration">Nothing</KinsokuSet>
       …
     </Properties>
   </ParagraphStyle>
   <ParagraphStyle Self="ParagraphStyle/$ID/NormalParagraphStyle" …>
     <Properties><BasedOn type="string">$ID/[No paragraph style]</BasedOn>…</Properties>
   </ParagraphStyle>
   ```

**What the samples do and don't show.** All five stand-ins set the font as a **local override on every range**; their only styles are the two built-in paragraph styles and `[No character style]`. Real brand files will almost certainly set fonts in named styles. So our reader must resolve the effective font up the chain (range → character style → paragraph style → `BasedOn` → root), and the stand-ins do not exercise that. `AppliedFont` also appears outside text: in `Preferences.xml` (`TextDefault`, grid settings) and in `designmap.xml` (`NamedGrid`).

The scripting DOM, which IDML mirrors, describes `appliedFont` as "specified as either a font object or the name of font family" and `fontStyle` as "The name of the font style." [S2]

### Composite fonts (`CompositeFont`)

The spec: "Composite fonts are part of the feature set of the Japanese version of InDesign, but can exist in any InDesign document… A composite font is made up of multiple, separate fonts… InDesign composite fonts are not files on disk or stored within the document; they're temporary sets of characters created in the InDesign user interface." [S1 §6.1.2]

Every sample holds exactly one, the built-in placeholder, at the end of `Fonts.xml`:

```xml
<CompositeFont Self="CompositeFont/$ID/[No composite font]" Name="$ID/[No composite font]">
  <CompositeFontEntry Self="u90" Name="$ID/Kanji" FontStyle="$ID/R" RelativeSize="100"
                      HorizontalScale="100" VerticalScale="100" Locked="true" ScaleOption="true" BaselineShift="0">
    <Properties><AppliedFont type="string">Kozuka Mincho Pr6N</AppliedFont></Properties>
  </CompositeFontEntry>
  <CompositeFontEntry Self="u92" Name="$ID/Kana" … CustomCharacters="ぁあぃいぅう…" …>…Kozuka Mincho Pr6N…</CompositeFontEntry>
  <CompositeFontEntry Self="u93" Name="$ID/Punctuation" … CustomCharacters="—―‖‘’“”‥…、。〈〉…" …>…</CompositeFontEntry>
  <CompositeFontEntry Self="u94" Name="$ID/Symbols" …>…</CompositeFontEntry>
  <CompositeFontEntry Self="u95" Name="$ID/Alphabetic" FontStyle="$ID/Regular" … CustomCharacters=" !&quot;#$%…ABC…abc…¡…¿ÀÁ…Œœ…" …>
    <Properties></Properties>
  </CompositeFontEntry>
  <CompositeFontEntry Self="u96" Name="$ID/Numbers" … CustomCharacters="0123456789" …>…</CompositeFontEntry>
</CompositeFont>
```

- **This is why every sample "lists Kozuka Mincho Pr6N"**: it is the default Kanji/Kana font of `[No composite font]`, not a font used in the design. It is not evidence the designer chose it.
- A composite font splits text by **character class** (Kanji, Kana, Punctuation, Symbols, Alphabetic, Numbers), each with its own font, size and baseline shift. That is exactly "Latin in the brand font, Japanese in the fallback" as one named font.
- **The spec does not show how text refers to a composite font** (presumably `AppliedFont` set to the composite font's name). Not documented, not in the samples. **Weakly sourced.**

### `AppliedLanguage`

A string attribute on character and paragraph ranges and styles. It names a `<Language>` in `designmap.xml`. The sample:

```xml
<Language Self="Language/$ID/English%3a USA" Name="$ID/English: USA" SingleQuotes="‘’" DoubleQuotes="“”"
          PrimaryLanguageName="$ID/English" SublanguageName="$ID/USA" Id="269"
          HyphenationVendor="Hunspell" SpellingVendor="Hunspell" />
```

- The spec: `<Language>` elements "define the language dictionaries available for the document. **You cannot create languages by adding new `<Language>` elements**; they are included for use as references… and to maintain round-trip fidelity." [S1 §10.2.2]
- Each sample lists **only** `English: USA`, the one language in use. So InDesign writes just the languages a document uses, and resolves the name against its own built-in list.
- It drives spelling and hyphenation dictionaries and the quote pair. It does **not** select a font.
- The exact names for our targets (expected to follow the pattern `$ID/French`, `$ID/Italian`, `$ID/Spanish`, `$ID/Japanese`, and a Portuguese variant) are **not in the spec or the samples**. Capture them from an IDML the designer exports. **Weakly sourced** until then.

### Paragraph composer (`Composer`)

A string attribute: "The text composer to use to compose the text." [S1 §10.4, S2] The spec does not list the values. The samples have `Composer="HL Composer"` (the default, Adobe Paragraph Composer).

- InDesign "also includes Japanese Single-line and Japanese Paragraph composers, designed for Japanese typography"; the Japanese Paragraph Composer "evaluates line breaks in units of whole paragraphs" *(helpx extract)* [A4][A5]. The World-Ready composers target Middle Eastern, South Asian and Southeast Asian scripts, not Japanese *(helpx extract)* [A6].
- **Internal names, weakly sourced** (an Adobe Community Expert's forum post, 2020 [W1]): `$ID/HL Composer` = Adobe Paragraph Composer, `$ID/HL Single` = Adobe Single-line, **`$ID/HL Composer J` = Adobe Japanese Paragraph Composer**, `$ID/HL Single J` = Adobe Japanese Single-line, `$ID/HL Composer Optyca` and `$ID/HL Single Optyca` = World-Ready. The samples write the value without the `$ID/` prefix, so the IDML value is presumably `HL Composer J`. **Confirm from a designer-exported IDML before relying on it.**

### Kinsoku and mojikumi

Japanese line-breaking rules (kinsoku) and punctuation spacing (mojikumi). Both are paragraph-level and both are **off** in the samples (`Nothing`).

- **`KinsokuSet`** (a `<Properties>` child): `Nothing`, `HardKinsoku`, `SoftKinsoku`, `KoreanKinsoku`, `SimplifiedChineseKinsoku`, `TraditionalChineseKinsoku`, or a reference to a custom `<KinsokuTable>`. "The kinsoku set that determines legitimate line breaks." [S1 enum list, S2]
- **`KinsokuType`**: `KinsokuPushInFirst` (sample default), `KinsokuPushOutFirst`, `KinsokuPushOutOnly`, `KinsokuPrioritizeAdjustmentAmount`. "Valid only when a kinsoku set is defined." [S1, S2]
- **`KinsokuHangType`**: `None`, `KinsokuHangRegular`, `KinsokuHangForce` (hanging punctuation). **`BunriKinshi`**: keeps "the double period, ellipse and double hyphen" unbroken. [S1, S2]
- **`Mojikumi`** (a `<Properties>` child): `Nothing`, one of 14 built-in Japanese sets (`LineEndAllOneHalfEmEnum`, `OneEmIndentLineEndUkeOneHalfEmEnum`, `LineEndUkeNoFloatEnum`, `LineEndAllOneEmEnum`, …), `TradChineseDefault`, `SimpChineseDefault`, or a custom `<MojikumiTable>`. [S1 §10.2.4 and enum list] Which built-in set is the usual default for body text is a designer question; the spec only describes them.
- Custom `<KinsokuTable>` and `<MojikumiTable>` elements live in `designmap.xml` (`CantBeginLineChars`, `CantEndLineChars`, `HangingPunctuationChars`, `CantBeSeparatedChars`). **None of the samples has one**, and we do not need to write any: the built-in enum values are enough.
- The spec: "Attributes such as RubyFont, Mojikumi, and WarichuLines are specific to the Japanese feature set. IDML recognizes these settings because InDesign supports a number of different platforms and locales… an IDML package created by the Japanese version of InDesign can be opened without error in the English version." [S1 §10.4] The English-language samples confirm it: they carry the full set of Japanese attributes (kinsoku, ruby, kenten, warichu, tatechuyoko) at their defaults.
- Adobe says its spacing rules follow JIS X 4051-1995 *(helpx extract)* [A7].

### `ParagraphDirection`

`LeftToRightDirection` or `RightToLeftDirection` [S1 enum list]. It sits beside `CharacterDirection`, `ParagraphJustification` (`ArabicJustification`, `NaskhJustification`), `DigitsType`, `Kashidas` and `DiacriticPosition`: the Arabic and Hebrew group. The samples have `ParagraphDirection="LeftToRightDirection"` on the root style and `StoryDirection="LeftToRightDirection"` on each Story's `<StoryPreference>`.

Horizontal Japanese is left-to-right, so **none of these change**. Vertical Japanese is a different setting (`StoryOrientation` on `<StoryPreference>`, `Horizontal` in the samples) and is a layout decision for the designer, not for us.

### What we must change when writing Japanese into a Latin-font frame

| Setting | Change? | To what | Why |
|---|---|---|---|
| `AppliedFont` + `FontStyle` | **Must** | A font with Japanese glyphs, and one of *its* style names | The brand fonts have no kana or kanji (section 3). Style names differ per family: Kozuka uses `R`, `B`, `H`; Source Han Sans uses `Regular`, `Bold`, `Heavy` (seen in `Fonts.xml` and [F5]) |
| `AppliedLanguage` | **Should** (all five languages) | The target language's `$ID/…` name | Spelling, hyphenation and quotes. Wrong hyphenation patterns in fr/it/pt/es otherwise |
| `Composer` | **Should**, pending test | Japanese Paragraph Composer | Kinsoku and mojikumi only make sense under a Japanese composer. Exact value weakly sourced |
| `KinsokuSet`, `Mojikumi` | **Should**, pending test | `HardKinsoku`, plus one built-in mojikumi set | Otherwise both stay `Nothing` and lines can start with 。or 、 |
| `Hyphenation` | Optional | leave | Irrelevant to Japanese |
| `ParagraphDirection`, `CharacterDirection`, `StoryDirection` | **No** | leave | Japanese is left-to-right |
| `CompositeFont` | **No** | leave the built-in one untouched | Not needed with the recommended approach (section 4) |
| `Fonts.xml` | Add the fallback family | see section 2 | For consistency; not proven to be required |
| `<?aid … featureSet="257" ?>` in `designmap.xml` | **No** | leave | Undocumented; present in every sample and in the spec's own examples |

Related things to expect, not to fix in code: the fallback has **no italic** (map italic brand styles to upright), `Capitalization="AllCaps"` and small caps do nothing to kana or kanji, and the default `AutoLeading="120"` is tight for Japanese. These are designer calls on reopen.

## 2. What InDesign does on reopening

### Text contains characters the applied font lacks

- **InDesign does not fall back to another font.** Adobe's Advanced Type preference "Missing Glyph Protection" (on by default) has two options: one stops you typing glyphs the current font lacks, the other "prevents unsupported glyphs from appearing when a different font, such as a Roman font, is applied to Asian-language text" *(helpx extract)* [A3]. Protection exists precisely because there is no fallback: the alternative to protecting is a missing glyph.
- **What shows instead: weakly sourced.** Forum answers and CreativePro say the character shows as a **pink box** (the font's "not defined" glyph on a pink highlight), and that this is *not* reported by the Missing Fonts dialog or Find/Replace Font, because the font itself is present; it is found through Preflight [W2][W3]. I found no Adobe page I could read that states this.
- **Whether glyph protection acts when an IDML is opened is unknown.** The preference is described for typing and for applying fonts in the UI. Assume it does not help us.
- The separate yellow "Substituted Glyphs" highlight is unrelated: it marks alternate glyphs from the same font, such as ligatures *(helpx extract)* [A1].

**Consequence:** an Exported design with Japanese text still in Agrandir would open with no warning dialog and unreadable boxes. Our code must prevent it; InDesign will not rescue it.

### The IDML names a font that isn't installed

- The spec: "missing font warnings will appear." [S1 §6.1]
- InDesign shows a Missing Fonts dialog, substitutes a default font, and highlights the affected text in pink. "By default, InDesign and InCopy highlight all text with a substituted [font in] pink"; the highlight is the Composition preference **Substituted Fonts** *(helpx extract)* [A1][A2]. The samples confirm the default: `Preferences.xml` has `HighlightSubstitutedFonts="true"`, `HighlightSubstitutedGlyphs="false"`, and the spec defines the first as "If true, highlights missing fonts." [S1 §6.3.13]
- The document keeps the requested font name. Installing or activating the font later resolves it; the designer can also use Type > Find/Replace Font, which "can change the appearance of the document if the installed font takes up more or less space" *(helpx extract)* [A1][A2].
- **Adobe Fonts auto-activation** can fetch missing fonts on open, but only fonts in the Adobe Fonts library, and it is "disabled by default" *(helpx extract)* [A1].
- A `FontStyle` the family doesn't have (say `Bold` on Kozuka, which calls it `B`) is, I expect, reported as a missing font even when the family is installed. **Weakly sourced**: this is inference from the two-field model, backed only by forum threads about family and style being set separately [W4].

This is a **recoverable, visible** failure: a dialog, pink text, and a named font the designer can install. It is far better than the silent pink boxes above, which is the main reason to always write an explicit Japanese font.

### The IDML names a font that isn't listed in `Fonts.xml`

**Not documented. Inferred, and must be tested.** What we know:

- `idPkg:Fonts` is optional in the `designmap.xml` schema, and the spec says of omitted elements generally that "InDesign supplies default values for the missing values in the IDML file" and that default elements "are only included in the IDML file by InDesign to ensure round-trip fidelity." [S1 §10.1.3, §10.2]
- `Fonts.xml` in the samples is a machine snapshot that lists unused fonts with stale statuses, so InDesign plainly re-evaluates font availability on open rather than trusting the file.
- The spec does say text refers to fonts "defined in the `<Fonts>` element" [S1 §6.1].

**Working assumption:** a font named in `AppliedFont` but absent from `Fonts.xml` still resolves if it is installed. **Safe practice regardless:** add a `<FontFamily>`/`<Font>` entry for each fallback face we write, copied from an IDML the designer exported with that font installed (so `Name`, `PostScriptName`, `FontStyleName`, `FontType`, `WritingScript="1"` are real, not guessed).

## 3. What the brand fonts cover

| Font | Japanese | French, Italian, Portuguese, Spanish | Source |
|---|---|---|---|
| **Agrandir** (Pangram Pangram) | **No.** "443 Glyphs each"; the language list is Latin-script only | **Yes, per the foundry's language list**, which names French, Italian, Portuguese and Spanish among 33 languages "(and more)". Individual glyphs not enumerated | [F1] |
| **Neue Helvetica Pro** (Linotype/Monotype) | **No** | **Yes.** "All weights contain the extended Linotype OpenType Std. Character Set (Adobe Western 2 + Adobe CE)… 48 different roman languages" | [F2] |
| **Neue Helvetica World** (Monotype) | **No.** 181 languages across Latin, Cyrillic, Greek, Arabic, Hebrew, Thai, Armenian, Georgian, Vietnamese. For Japanese Monotype recommends a separate font: "Japanese: Tazugane Gothic or Yu Gothic" | Yes | [F3] |
| **Helvetica** and **Helvetica Neue** as shipped with macOS | **No.** All 6 Helvetica and 14 Helvetica Neue faces lack あ ア 日 。 | **Yes.** All 20 faces have ¿ ¡ ç Ç ã õ œ Œ ñ, the grave/acute/circumflex/diaeresis vowels, « » € ª º | [F4], checked from the font files |

Notes:

- **Adobe Western 2** (now "Adobe Latin 2") has the same language coverage as Adobe Latin 1, whose published character list includes `exclamdown` ¡, `questiondown` ¿, `ccedilla` ç, `atilde` ã, `otilde` õ, `OE`/`oe` Œ œ, `ntilde` ñ, and the guillemets. [F8]
- **Agrandir: one residual check.** The foundry page gives languages, not a glyph table, and says "Version 4.10. Latest update: June 2018" for a family of 74 styles. `œ`/`Œ` are the usual gap in fonts that claim French. Run a character-map check on the team's licensed files (every style in use) before the go/no-go gate. This is a five-minute script.
- **"Helvetica" is not one font.** Which cut the team uses (Apple's system font, Helvetica LT Std, Neue Helvetica Pro, Helvetica Now) decides the exact family and style names in the IDML. The samples owed by ticket 08 will show it in `Fonts.xml`. I could not read Monotype's page for classic Helvetica (rate-limited), so the non-Neue retail cut is covered here only by Apple's files.
- Hiragino Sans and Yu Gothic are on Apple's macOS font list; Kozuka is not. [F4]

**Bottom line:** fr/it/pt/es keep the brand fonts. Only Japanese needs a mapping.

## 4. Recommended font mapping for write-back

### The approach

**A configuration map, applied as a document-wide font replacement per Language version.**

```
(brand family, brand style, language) → (fallback family, fallback style)

("Agrandir", "Regular",      "ja") → ("Source Han Sans", "Regular")
("Agrandir", "Bold",         "ja") → ("Source Han Sans", "Bold")
("Agrandir", "Wide Black",   "ja") → ("Source Han Sans", "Heavy")
("Helvetica Neue", "Italic", "ja") → ("Source Han Sans", "Regular")   # no italic exists
(anything unmapped,          "ja") → default fallback + flag in the editor
```

(Names are illustrative. Real family and style strings must be copied from `Fonts.xml` of IDMLs exported on the designers' machines.)

How to apply it for a language that has a map (Japanese only, today):

1. **Rewrite `AppliedFont` and `FontStyle` wherever a brand font is set**: in `ParagraphStyle` and `CharacterStyle` definitions in `Styles.xml`, and in local overrides on `ParagraphStyleRange`/`CharacterStyleRange` in Stories. Since each Language version is its own IDML, changing the style definitions is safe and it is what a designer would do by hand with Find/Replace Font. It leaves the document's styles as the single place to change the font later, with no new local overrides.
2. **Always write both fields together.** `FontStyle` is inherited separately from `AppliedFont`, so a range that overrides only the family inherits a style name that may not exist in the new family.
3. **Add the fallback faces to `Fonts.xml`** (section 2).
4. **Set `AppliedLanguage`** on the same styles and ranges, for every language.
5. For Japanese, **set the composer, `KinsokuSet` and `Mojikumi` on paragraph styles**, once the values are confirmed.
6. **Before export, check every character against the mapped font's character map** and refuse to write a range whose font lacks a character; flag the Text layer instead. This closes the silent pink-box failure for any language, including a stray character in fr/it/pt/es.

For fr/it/pt/es the map is empty and only step 4 and step 6 apply.

**Latin inside Japanese text** (product names, numbers): the simple version sets the whole range in the Japanese font, whose own Latin glyphs are used. Source Han Sans, Noto Sans JP and Kozuka all include Latin. If the brand team wants Latin runs kept in Agrandir, the same mechanism handles it by **splitting the range by script** into adjacent `CharacterStyleRange`s. Make this a config switch, default off, and decide it with the designer at the gate.

### Why not a composite font

A composite font is the "proper" InDesign answer to mixed Latin and Japanese, and it is rejected for write-back:

- The spec calls it "part of the feature set of the Japanese version of InDesign" and says composite fonts are "temporary sets of characters created in the InDesign user interface" [S1 §6.1.2]. A designer on an English install may have no UI to inspect or edit one. (Not confirmed either way; **weakly sourced**.)
- How text refers to one is undocumented and absent from the samples.
- It still needs both component fonts installed, so it saves nothing on the designer's side.
- A plain `AppliedFont` is something every designer recognises, can search for, and can replace.

### Which is safest for a file the designer reopens

**Plain `AppliedFont` + `FontStyle` rewriting, to a font the designer has installed.** Worst case, the font is missing and InDesign says so, names it, and highlights the text. Every other option has a worse failure: leaving the brand font gives silent pink boxes; a composite font adds an undocumented reference and a feature the designer may not be able to open.

### Candidate fallback fonts for Japanese

| Font | Licence | Designer needs it installed? | Weights | Web preview | Notes |
|---|---|---|---|---|---|
| **Source Han Sans** (Adobe) / **Noto Sans JP** (Google): the same design | **SIL OFL 1.1.** Free for commercial use; may be "bundled, embedded, redistributed and/or sold with any software"; not sold by itself [F5][F6] | **Yes**, but free: download and install, or activate "Source Han Sans Japanese" from Adobe Fonts [F7] | 7 (ExtraLight to Heavy) [F7] | **Yes, self-hostable** under the OFL; Noto Sans JP is also on Google Fonts as a variable font [F6] | **Recommended.** Family name differs by source ("Source Han Sans", "Noto Sans JP", "Noto Sans CJK JP"). Pick one distribution, and use that exact name |
| **Kozuka Gothic Pr6N** (Adobe Originals) | Adobe Fonts: "cleared for both personal and commercial use" with a Creative Cloud subscription. Self-hosting web font files needs separate licensing [F9] | **Yes**, via Adobe Fonts activation. Auto-activation on open can do it if the designer enables it [A1] | 6 (EL, L, R, M, B, H) | **No self-hosting** without a separate licence; Adobe Fonts web projects only | Good second choice for an all-Adobe team. Style names are single letters |
| **Hiragino Sans** | Bundled with macOS (Apple lists W0–W9) [F4]. Not available on Windows without buying it | Present on every Mac; **absent on Windows** | 10 | No (system font; only works if the viewer is on a Mac) | Rule out unless every designer and every reviewer is on macOS |
| **Tazugane Gothic** (Monotype) | Commercial, per-seat | Yes, purchased | n/a | Needs a web licence | Monotype's own recommended partner for Neue Helvetica [F3]. Only if brand wants a matched pair. Not researched further |

"Kozuka ships with Adobe apps" needs care. The samples show **Kozuka Mincho Pr6N R** `Installed` on a machine whose other Kozuka weights are `Substituted`, which fits one weight being installed with InDesign as the composite-font default. That is Mincho (a serif), one weight. I found **no Adobe source confirming Kozuka Gothic is installed with current InDesign**; assume it needs Adobe Fonts activation. **Weakly sourced.**

### Licensing summary

- **Brand fonts stay the team's problem only where they already are.** Pangram Pangram licences are per use: Print (desktop) for workstations, **Web** "for any website, microsite and subdomain where the font is embedded", **App** "for any application (mobile or desktop) and software where the font is embedded", and "WebApps fall under the regular App licenses." Company licences run one year. Suppliers such as agencies need their own. [F10] So showing Agrandir in the Lingo Desk preview needs a Web or App licence the team may not hold. Ask before loading it.
- **Helvetica** web use likewise needs a Monotype web licence; the macOS system copy is not licensed for serving from our app.
- **Source Han Sans / Noto Sans JP**: no cost, no seat count, server and web use allowed. This is the deciding factor.
- **Adobe's InDesign API**, if we get it, resolves only the **Adobe Fonts Free library** by itself; anything else must be uploaded as an asset into a `Document Fonts` folder beside the document, and `missingFontStrategy` can be `fallback` (job completes, font listed under `warnings.missingFonts`) or `fail` [A8]. Use `fail`. Uploading Agrandir or Helvetica to Adobe's service is again a licence question; Source Han Sans is not.

## 5. Browser preview without InDesign (approximate)

**This can only ever be approximate.** Treat the preview as "roughly how full is this frame", never as proof of fit.

- **Fonts.** Use Noto Sans JP as a self-hosted web font for Japanese (OFL, allowed) [F6]. It is large; subset it or use Google Fonts' sliced delivery. For Latin, use the brand fonts only if the team holds Web/App licences [F10]; otherwise substitute a metrically similar free font and say so in the UI. A substituted Latin font makes Latin fit estimates unreliable.
- **Same font, different engine.** Even with identical fonts, the browser and InDesign differ on kerning (`KerningMethod` Metrics vs Optical), tracking, justification, and leading (InDesign's `AutoLeading` and `LeadingModel` have no exact CSS equivalent).
- **Japanese line breaking differs.** CSS lets a line break almost anywhere in Japanese; `line-break: strict` forbids "breaks before Japanese small kana or the Katakana-Hiragana prolonged sound mark", but "the precise set of rules in effect for each of loose, normal, and strict is up to the UA" [C1]. InDesign's kinsoku sets and push-in/push-out processing, and mojikumi punctuation spacing (full-width punctuation squeezed to half width at line ends), have no reliable browser equivalent. Expect the browser to fit **slightly less** per line than InDesign with mojikumi on.
- **Practical settings:** `lang="ja"`, `line-break: strict`, `word-break: normal`, no hyphenation, frame width and point size taken from the IDML. Flag overflow with a margin (for example, warn at 90% full) rather than at the exact edge.
- **Our write-back settings change the answer.** Whether we write the Japanese composer and kinsoku (section 1) changes InDesign's line breaks, so settle that before tuning the preview.

## Weakly sourced and untested

Resolve these in the round-trip gate (ticket 07), ideally with one small hand-made test IDML reopened by a designer:

1. **Pink boxes for missing glyphs on IDML open**, with no dialog (forum and CreativePro [W2][W3]; no Adobe page read).
2. **A font absent from `Fonts.xml` still resolves if installed** (inferred from the schema and the samples).
3. **Composer string for the Japanese Paragraph Composer** (`HL Composer J`, from a forum post [W1] plus the sample's prefix-less `HL Composer`).
4. **`AppliedLanguage` names** for fr/it/pt/es/ja (pattern only; not in spec or samples).
5. **What the default Roman composer does with Japanese text** when kinsoku is `Nothing` (assumed to break without Japanese rules; not sourced).
6. **A mismatched `FontStyle` shows as a missing font** (forum [W4]).
7. **Composite fonts are not editable in English InDesign**, and how text refers to one (spec is silent).
8. **Kozuka Gothic is not installed with InDesign** (no Adobe source either way; samples show only Kozuka Mincho Pr6N R).
9. **All helpx statements** (marked *helpx extract*) were read as search extracts, not full pages.
10. **Agrandir's exact glyphs** (foundry lists languages, not glyphs), and the non-Neue retail Helvetica cut.
11. **The stand-in samples use only local font overrides**; style-based fonts and `BasedOn` chains are untested against real brand files.

The cheapest way to close 3, 4, 7 and 8 together: ask a designer to make a one-frame document, set one paragraph in Japanese with the Japanese Paragraph Composer, Hard kinsoku and a mojikumi set, apply the candidate fallback font, set one paragraph each to French, Italian, Portuguese and Spanish, and export it as IDML. Its `Styles.xml`, `Fonts.xml` and `designmap.xml` will hold every exact string this note had to guess.

## Sources

**Adobe, specification and developer docs**

- [S1] Adobe, *IDML File Format Specification* (InDesign CS6, DOM 8.0), 430 pp. Originally `https://wwwimages.adobe.com/content/dam/acom/en/devnet/indesign/sdk/cs6/idml/idml-specification.pdf` (now 404); read from `http://web.archive.org/web/20210902235940/http://wwwimages.adobe.com/content/dam/acom/en/devnet/indesign/sdk/cs6/idml/idml-specification.pdf`. Sections cited: 6.1 Fonts, 6.1.1 Font and Font Family (Table 120), 6.1.2 Composite Font, 6.3.13 Text Preference, 10.1.3 Optional Values, Defaults, and Preferences, 10.2 designmap.xml (10.2.2 Language, 10.2.3 KinsokuTable, 10.2.4 MojikumiTable), 10.4 Stories (text attributes, "Attributes and Elements Related to Japanese Features"), enum lists in the schema appendix, Appendix C IDML Defaults. Section numbers are as printed in the PDF, whose numbering is not sequential (6.x follows 10.x).
- [S2] Adobe, InDesign DOM API reference, `ParagraphStyle` and `CompositeFont`: https://developer.adobe.com/indesign/dom/api/p/ParagraphStyle/ and https://developer.adobe.com/indesign/dom/api/c/CompositeFont/
- [A8] Adobe, *Using Adobe Fonts with InDesign API* (Firefly Services): https://developer.adobe.com/firefly-services/docs/indesign-apis/guides/using-adobe-fonts/

**Adobe help (read as search extracts; direct fetch refused)**

- [A1] *Use fonts in InDesign* / *Install and activate fonts in InDesign*: https://helpx.adobe.com/indesign/using/using-fonts.html , https://helpx.adobe.com/indesign/desktop/fonts/install-and-activate-fonts.html
- [A2] *Missing font errors in InDesign*: https://helpx.adobe.com/indesign/desktop/troubleshoot/font-and-plugin-issues/missing-font-error.html ; *Find and replace fonts in InDesign*: https://helpx.adobe.com/indesign/desktop/fonts/find-and-replace-fonts.html
- [A3] *Install and use fonts in InCopy* (Missing Glyph Protection): https://helpx.adobe.com/incopy/using/using-fonts.html ; *Arabic and Hebrew features in InDesign* (protection on by default): https://helpx.adobe.com/indesign/using/arabic-hebrew-alt.html
- [A4] *Set text composition in InDesign*: https://helpx.adobe.com/indesign/desktop/format-and-style-text/composition-and-text-wrapping/set-text-composition.html
- [A5] *Format CJK text in InDesign*: https://helpx.adobe.com/indesign/using/composing-cjk-characters.html ; *Use Kinsoku settings in InDesign*: https://helpx.adobe.com/indesign/desktop/language-and-proofing/chinese-japanese-and-korean/use-kinsoku-settings.html
- [A6] *World-Ready Composer in InDesign*: https://helpx.adobe.com/indesign/desktop/language-and-proofing/language-settings/adobe-world-ready-composer-overview.html
- [A7] *About Mojikumi and Yakumono in Japanese layout*: https://helpx.adobe.com/indesign/desktop/language-and-proofing/chinese-japanese-and-korean/mojikumi-and-yakumono-in-japanese-layout.html

**Foundries and font files**

- [F1] Pangram Pangram, *Agrandir*: https://pangrampangram.com/products/agrandir
- [F2] Linotype (MyFonts), *Neue Helvetica Pro*: https://www.myfonts.com/pages/linotype-neue-helvetica-pro
- [F3] Monotype (MyFonts), *Neue Helvetica World*: https://www.myfonts.com/pages/linotype-neue-helvetica-world
- [F4] Apple, *Fonts included with macOS Tahoe*: https://support.apple.com/en-nz/122869 . Character coverage checked directly from `/System/Library/Fonts/Helvetica.ttc` (version 17.0d1e1) and `HelveticaNeue.ttc` (version 20.4d1e2) on macOS 26.6, by reading each face's character map.
- [F5] Adobe, Source Han Sans licence: https://github.com/adobe-fonts/source-han-sans/blob/release/LICENSE.txt ; repository: https://github.com/adobe-fonts/source-han-sans
- [F6] Google Fonts, Noto Sans JP metadata and licence: https://github.com/google/fonts/tree/main/ofl/notosansjp ; Noto CJK: https://github.com/notofonts/noto-cjk
- [F7] Adobe Fonts, *Source Han Sans Japanese*: https://fonts.adobe.com/fonts/source-han-sans-japanese
- [F8] Adobe, *Adobe Latin character sets* (Adobe Latin 1, Adobe Latin 2 "Adobe Western 2", Adobe Latin 3 "Adobe CE"): https://github.com/adobe-type-tools/adobe-latin-charsets
- [F9] Adobe Fonts, *Kozuka Gothic Pr6N*: https://fonts.adobe.com/fonts/kozuka-gothic-pr6n
- [F10] Pangram Pangram, *Frequently Asked Questions* (licence types): https://pangrampangram.com/pages/faq ; EULA: https://pangrampangram.com/pages/eula (not read in full)

**Standards**

- [C1] W3C, *CSS Text Module Level 3* (`line-break`, `word-break`): https://www.w3.org/TR/css-text-3/

**Weak sources (forum posts and trade press)**

- [W1] Adobe Community, "How to change InDesign composer" (Uwe Laubender, 2020-02-12): https://community.adobe.com/t5/indesign-discussions/how-to-change-indesign-composer/m-p/10919456
- [W2] Adobe Community, "Missing font glyphs with no pink crossed rectangle": https://community.adobe.com/t5/indesign-discussions/missing-font-glyphs-with-no-pink-crossed-rectangle/m-p/13080333 ; "Need to replace pink boxes in text": https://community.adobe.com/t5/indesign-discussions/need-to-replace-pink-boxes-in-text/m-p/10035934
- [W3] CreativePro, "Tackling Missing Glyphs": https://creativepro.com/tackling-missing-glyphs/ ; "Field Guide to Composition Highlighting": https://creativepro.com/field-guide-to-composition-highlighting/
- [W4] Adobe Community, "How to specify appliedFont and fontStyle to a paragraph style without the font being loaded": https://community.adobe.com/questions-671/how-to-specify-appliedfont-and-fontstyle-to-a-paragraph-style-without-the-font-being-loaded-848712
