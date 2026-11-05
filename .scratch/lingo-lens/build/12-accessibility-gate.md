# 12: Accessibility gate

Spec: [../spec.md](../spec.md) (Status, errors and accessibility)

**What to build:** Lingo Lens meets WCAG 2.2 AA in practice. Automated checks guard every screen state on each pull request, and a manual keyboard and screen-reader pass confirms the experience before prod. The manual pass is HITL.

**Blocked by:** [06: Image result interaction and responsive layout](06-image-result-interaction-and-responsive-layout.md), [10: Failures, part 2: Image errors and No text found](10-failures-image-errors-and-no-text-found.md)

**Status:** ready-for-agent

- [x] axe runs in the PR workflow on every state: empty, picking, each rejection, uploading, translating, Document ready, Image result (with a block selected), each failure category, Expired and Refused
- [x] Every screen is checked at 320, 768 and desktop widths, with no horizontal scrolling and no zoom blocking
- [ ] A manual pass with NVDA + Edge and VoiceOver + Safari (HITL) covers the full Document and Image flows and each error, including the live-region announcements and focus moves; findings are fixed or ticketed
- [ ] A checklist of the manual pass is recorded with its date and outcome

**Agent notes (ticket-12):** the automated gate is `web/e2e/` (Playwright + `@axe-core/playwright` against `vite preview` of the real build, `/api` and Blob faked with `page.route`; 24 states × 320/768/1280). `npm run test:a11y` runs it, `npm run check` includes it, and `pr.yml` runs it as the `a11y` job. The checklist to fill in is [docs/accessibility/manual-screen-reader-pass.md](../../../docs/accessibility/manual-screen-reader-pass.md): the last two boxes stay open until a person runs it and records date and outcome.
