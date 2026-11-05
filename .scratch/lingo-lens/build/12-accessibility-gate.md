# 12: Accessibility gate

Spec: [../spec.md](../spec.md) (Status, errors and accessibility)

**What to build:** Lingo Lens meets WCAG 2.2 AA in practice. Automated checks guard every screen state on each pull request, and a manual keyboard and screen-reader pass confirms the experience before prod. The manual pass is HITL.

**Blocked by:** [06: Image result interaction and responsive layout](06-image-result-interaction-and-responsive-layout.md), [10: Failures, part 2: Image errors and No text found](10-failures-image-errors-and-no-text-found.md)

**Status:** ready-for-agent

- [ ] axe runs in the PR workflow on every state: empty, picking, each rejection, uploading, translating, Document ready, Image result (with a block selected), each failure category, Expired and Refused
- [ ] Every screen is checked at 320, 768 and desktop widths, with no horizontal scrolling and no zoom blocking
- [ ] A manual pass with NVDA + Edge and VoiceOver + Safari (HITL) covers the full Document and Image flows and each error, including the live-region announcements and focus moves; findings are fixed or ticketed
- [ ] A checklist of the manual pass is recorded with its date and outcome
