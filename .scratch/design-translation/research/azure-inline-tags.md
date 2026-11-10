# Azure Translator: inline tags and notranslate (test results)

Run 2026-11-11 against the dev Translator `trl-lingolens-dev-001` (S1, eastus), global endpoint, `textType=html`, source `en`, targets fr, it, pt, es, ja. Translator v3.0 and `2026-06-06` (default deployment `general`, NMT). The dev resource has no LLM deployment, so the LLM mode was not tested. 6,545 characters charged per version (tags included). Raw request and response data: `azure-inline-tags.results.json` beside this file.

## Verdicts

1. **Tags are never lost or broken.** Every `<span id>` came back, well formed, with its id, in every language, on both versions. Nested spans stayed nested.
2. **`notranslate` works on `2026-06-06` (NMT)**, as on v3.0. Every protected term came back unchanged, alone, beside a styled span, and inside one.
3. **`2026-06-06` NMT gave exactly the same output as v3.0** for all 70 translations.
4. **Placement** (12 styled strings × 5 languages = 60 cases, judged by reading; Japanese judged by the agent, worth a Japanese reader's second look):

| | fr | it | pt | es | ja | total |
|---|---|---|---|---|---|---|
| Exact | 8 | 8 | 8 | 8 | 10 | 42 |
| Widened onto a neighbouring word | 2 | 4 | 4 | 4 | 0 | 14 |
| Wrong (wrong word, emptied, or a word split) | 2 | 0 | 0 | 0 | 2 | 4 |

- **Swapped word order works**: "The ⟨1⟩perfect⟨/1⟩ ⟨2⟩light⟨/2⟩" became it/pt/es "la ⟨2⟩luce⟨/2⟩ ⟨1⟩perfetta⟨/1⟩", with the spans reordered correctly.
- **Widening** is mostly an adjective's styling spreading over its noun: fr "la nouvelle ⟨1⟩édition rouge⟨/1⟩" for "the new ⟨1⟩red⟨/1⟩ edition", or a verb pulled in (it "⟨1⟩illumina tutta⟨/1⟩" for "⟨1⟩whole⟨/1⟩").
- **Wrong**: fr "La ⟨1⟩lumière parfaite⟨/1⟩ ⟨2⟩⟨/2⟩" (span 2 left **empty**); fr "bénéficiez ⟨2⟩de⟨/2⟩ la livraison gratuite" (styling on "de", not "gratuite"); ja "にぴ⟨1⟩ったりのアイデア⟨/1⟩" and "⟨1⟩ あなたについて ⟨/1⟩くる" (span boundary inside a word).
5. **Artifacts**: a space before the final full stop when a span ends just before it in the Romance languages ("édition rouge⟨/1⟩ ."); spaces added around spans in Japanese, which uses none. Spaces inside span edges in English were kept.
6. **Lorem ipsum test** (sample layer "OpenType Features", tidied by this script to 7 stretches, not the research note's 11, because the script ignored superscript/subscript): all spans kept, but the text is pseudo-Latin and the translation is meaningless, so it says nothing about placement.

## Strings sent

1. Get ⟨1⟩30% off⟨/1⟩ every lamp this week.
2. The ⟨1⟩perfect⟨/1⟩ ⟨2⟩light⟨/2⟩ for your desk.
3. A ⟨1⟩bright⟨/1⟩ idea for ⟨2⟩small rooms⟨/2⟩.
4. ⟨1⟩New colours.⟨/1⟩ Same great light.
5. Order today and ⟨1⟩get ⟨2⟩free⟨/2⟩ delivery⟨/1⟩.
6. ⟨1⟩Free⟨/1⟩ delivery
7. Meet the new ⟨1⟩red⟨/1⟩ edition.
8. Save ⟨1⟩€20⟨/1⟩ on your ⟨2⟩second⟨/2⟩ lamp.
9. [Lumina Air] lights up your ⟨1⟩whole⟨/1⟩ home.
10. Discover ⟨1⟩the new [Lumina Mini]⟨/1⟩ today.
11. Only [Lumina Air] ⟨1⟩adjusts itself⟨/1⟩ to your day.
12. Light that⟨1⟩ follows you ⟨/1⟩all day.
13. The [Lumina Air] desk lamp is small, quiet and warm.
14. The sample layer "OpenType Features", tidied.

⟨n⟩ is `<span id="n">`; [term] is `<span class="notranslate">`.

## Limits of this test

- 12 hand-written strings, judged by one reader (the agent). Japanese placement deserves a native reader.
- NMT only; the LLM mode (`2026-06-06` with a GPT deployment) needs a Foundry resource and was not tested.
- Not tested: `<b>` or other tag names, attributes other than `id` and `class`, long paragraphs, more than two styled stretches in real copy.
