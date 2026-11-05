# Accessibility and responsive bar

Type: grilling
Status: resolved
Map: ../map.md

## Question

What accessibility and device bar must the Lingo Lens MVP clear, and what does that mean for the screens already decided?

- **Standard:** which WCAG level (2.2 AA?) and whether the organisation has its own policy or audit requirement.
- **Devices:** desktop only, or must phone and tablet work (for example, photographing a sign and uploading it from a phone)? What is the narrowest width supported?
- **[The Image Translation result screen](07-image-translation-result-screen.md)** is two columns, with hover linking and a sticky Image. Decide:
  - how it collapses on a narrow screen (stacked? the Image on top with cards below?)
  - what replaces hover on touch (tap to select?)
  - how region highlights keep enough contrast over arbitrary photos
  - how the card-to-region link is announced to screen readers
- **Status updates** (uploading → translating → ready / failed): announced through a live region?
- **Language:** the translated text is marked with `lang` attributes for the target language, and the originals for the detected source language.

## Answer

Decided with the user on 2026-11-05 (grilling). The user accepted every recommendation.

- **Standard: WCAG 2.2 AA.** No formal external audit for the MVP. Automated axe checks run in `pr.yml` (see [Deployment and CI](10-deployment-and-ci.md)). Before the first prod deploy, a manual keyboard and screen-reader pass is done with NVDA + Edge and VoiceOver + Safari.
- **Devices:** desktop, tablet and phone, with layouts down to **320 CSS px**.
  - Browsers: current Edge, Chrome, Firefox, Safari, iOS Safari and Android Chrome.
  - No custom camera screen: the normal file picker (`accept="image/*"`) offers "Take photo".
  - Browser pinch-zoom and page zoom are never blocked (no `user-scalable=no`), and there is no custom zoom control.
- **Interface language:** English only; localising the app's own interface is out of scope. Translated text carries `lang="<target>"` and originals carry `lang="<detected source>"`.
- **Status:** uploading → translating → ready / failed is announced through a polite live region. When a Translation is ready, focus moves to the result heading; on failure it moves to the error message.
- **Image result screen** (amends [The Image Translation result screen](07-image-translation-result-screen.md)):
  - **Narrow screens (< 768 px):** the layout stacks, with the Image pinned to the top at up to 40% of the screen height and the cards scrolling underneath.
  - **Selection model:** a persistent **selected block** is added. Tapping or clicking a card selects it and highlights its region; tapping it again or outside clears it. Tapping a region selects its card and scrolls to it. Hover (desktop) still previews.
  - **Keyboard:** the cards are in the Tab order. Focus previews like hover, and Enter/Space selects. There are no custom shortcuts.
  - **Highlight:** a two-layer outline (dark outer and white inner, each at least 2px) with a light fill, and the other regions dimmed. This keeps 3:1 non-text contrast over any photo (WCAG 1.4.11).
  - **Screen readers:** the card list is the accessible content (a list; each item holds the translation and the original). The region overlay is `aria-hidden`. The Image's alt text is the file name plus "N text blocks found".
