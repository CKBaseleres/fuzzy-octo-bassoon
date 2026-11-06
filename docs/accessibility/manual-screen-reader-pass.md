# Lingo Lens: manual keyboard and screen-reader pass

The automated gate (`npm run test:a11y`, the `a11y` job in `pr.yml`) runs axe on every screen state at 320, 768 and 1280 px. It can't hear announcements, judge reading order or feel focus moves. This pass covers that. It must be done before the first prod deploy (spec: "Accessibility bar"; ticket 12).

## How to run it

- Two set-ups, both required:
  - **NVDA + Edge** (Windows, current versions). Browse mode by default; use Tab for focus order.
  - **VoiceOver + Safari** (macOS, current versions). Also do the Image flow once on **iOS Safari with VoiceOver** (phone, portrait).
- Use the dev environment, with real files: a small PDF, a DOCX, a photo of a sign with 3 or more blocks of text, a blank photo (for No text found), a 20+ MB image, a `.zip`, an encrypted PDF.
- Use the keyboard only (no mouse) on desktop. On iOS use swipe and double tap.
- Hard-to-reach states (Refused, Expired, Service problem): ask a developer to flip the kill switch (`TRANSLATIONS_ENABLED=false`) for Refused, or to wait out the sweep for Expired. Otherwise run `npm run test:a11y` locally with `--headed --debug` to pause on that state: the SPA is real, only the network is faked.
- For each row, write **Pass**, or **Fail** plus what you heard or saw. A Fail is fixed, or ticketed under `.scratch/lingo-lens/`, before prod.

## Record

| Set-up | Tester | Date | Outcome (Pass / Fail: n findings) | Findings (ticket links) |
| --- | --- | --- | --- | --- |
| NVDA + Edge |  |  |  |  |
| VoiceOver + Safari (macOS) |  |  |  |  |
| VoiceOver + iOS Safari |  |  |  |  |

## 1. Page and form (empty, picking)

| # | Do | Listen / look for | NVDA | VO macOS |
| --- | --- | --- | --- | --- |
| 1.1 | Load the page | Title "Lingo Lens"; one h1 "Lingo Lens"; a "Translate a file" region; page language English |  |  |
| 1.2 | Tab through the form | Order: file picker ("File to translate", hint "Documents up to 40 MB · Images up to 20 MB"), "Translate into" (hint about detection), Translate (dimmed/unavailable) |  |  |
| 1.3 | Pick a PDF, choose French | The PDF note "Scanned pages in mixed PDFs may stay untranslated." is reachable and read in full; Translate is now available |  |  |
| 1.4 | Visible focus | Every focused control has a visible focus ring at 100% and 200% zoom |  |  |
| 1.5 | Zoom to 400% (or 320 px window) | No sideways scrolling; nothing cut off or overlapping |  |  |

## 2. Rejections (category 1, before any upload)

For each: `.zip`, empty file, 41 MB PDF, 21 MB image, encrypted PDF, 40×40 px image.

| # | Do | Listen / look for | NVDA | VO macOS |
| --- | --- | --- | --- | --- |
| 2.1 | Pick the file | The message is announced (or read when moving back to the field) as the field's error; it is tied to "File to translate" |  |  |
| 2.2 | Tab on | Translate is unavailable; nothing was uploaded |  |  |

## 3. Document flow

| # | Do | Listen / look for | NVDA | VO macOS |
| --- | --- | --- | --- | --- |
| 3.1 | Press Translate | "Uploading…" then "Translating…" announced politely, without moving focus and without being repeated |  |  |
| 3.2 | Wait for ready | Focus moves to the h2 "Your translation is ready"; it is read; "Saved as <name>…" is reachable next |  |  |
| 3.3 | Save again, New Translation | Both buttons named and work by Enter/Space; New Translation returns to the empty form |  |  |
| 3.4 | Download failed (dev: block the blob host in devtools) | Focus moves to "Download failed."; the group is named by that text; Try again is next in Tab order |  |  |

## 4. Image flow (also on iOS VoiceOver)

| # | Do | Listen / look for | NVDA | VO macOS | VO iOS |
| --- | --- | --- | --- | --- | --- |
| 4.1 | Translate the sign photo | Status announcements as 3.1; on ready focus moves to the h2 (the file name) |  |  |  |
| 4.2 | Read the header | Badges: "<Source> (detected) → <Target>", "Ready", "N text blocks", and the handwriting warning when shown; Copy translated text, New Translation |  |  |  |
| 4.3 | The Image | Alt text "<file name>, N text blocks found"; the region shapes are NOT read (overlay is hidden) |  |  |  |
| 4.4 | The cards | A list named "Translated text" with N items; each translation is pronounced in the target language, each original in the source language (voice switches) |  |  |  |
| 4.5 | Tab to a card | Focus previews the region (visible highlight on the Image); Enter/Space selects; the selected card is announced as current; again clears it |  |  |  |
| 4.6 | Show original switch | Named "Show original", announces on/off; off hides the originals |  |  |  |
| 4.7 | Copy translated text | "Copied" is announced |  |  |  |
| 4.8 | 320 px / phone portrait | Image pinned at the top (up to 40% height), cards scroll beneath; tapping a region scrolls its card into view below the Image, not under it. **iOS Safari:** check that the pinned Image doesn't jump when the toolbar shows/hides (`40vh` vs `40dvh`, ticket 06 note) |  |  |  |
| 4.9 | Highlight contrast | On a light and on a dark photo, the selected region's outline is clearly visible (dark + white halo) |  |  |  |

## 5. Failures (focus moves to the message)

For each: focus lands on the message, the message is read in full (it is a named group), the reference code is reachable, and the one action (if any) is next in Tab order.

| # | State | Expected text / action | NVDA | VO macOS |
| --- | --- | --- | --- | --- |
| 5.1 | Upload failed | "The upload didn’t finish…" / Try again |  |  |
| 5.2 | Refused, hourly | "You’ve reached the hourly limit. Try again in N minutes." above the form, focused, no action; the form stays usable |  |  |
| 5.3 | Refused, daily / kill switch | "Lingo Lens has reached today’s limit. Try again tomorrow." |  |  |
| 5.4 | Can’t translate (damaged, protected, bad dimensions, generic) | The matching sentence / Choose another file |  |  |
| 5.5 | No text found (blank photo) | Focus goes to the warning "No text found…", not the h2; Image shown with alt "<file>, no text found"; Choose another file is the only action |  |  |
| 5.6 | Service problem | "Something went wrong on our side. Try again." (or, when Azure throttles, "Lingo Lens is busy, try again in a minute.") / Try again |  |  |
| 5.7 | Expired | "This translation has expired, please start again." / Translate again |  |  |
| 5.8 | After Try again / Translate again fails again | Focus moves to the new message again |  |  |
