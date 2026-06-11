# Tailwind Migration — Regression Checklist (Story 0.9)

This is the manual gate for Story 0.9 ("Final regression pass on
existing flows"). The migration in Stories 0.1–0.8 should have left
visible behaviour unchanged. Walk through every flow on each device in
the matrix and confirm no regression.

Before starting:
- Run `npm install`, then `npm run build:css`.
- Confirm automated checks pass: `npm test` (runs the full
  @playwright/test suite — tailwind-smoke, class-coverage, a11y, vmode).
- Open the app in a private/incognito window so a stale service-worker
  cache from `test12-v5` doesn't mask issues. The new SW
  (`test12-v6`, Story 0.7) will register on first load.

## Device matrix
| Device | Browser |
|---|---|
| iPhone (Safari) | iOS Safari, real device |
| iPad (Safari) | iPadOS Safari, real device |
| Android phone | Chrome |
| Desktop | Chrome |
| Desktop | Safari (macOS) |
| Desktop | Firefox |

For each device, walk through every flow below. Tick off as you go.

## Flows (per Story 0.9 AC)

### Voice posting
- [ ] Post a voice post in the public feed (PTT mode)
- [ ] Reply to a post in the public feed
- [ ] Auto-read narration plays back in the public feed

### Private channels
- [ ] Create a private channel
- [ ] Join a private channel by ID
- [ ] Send a message in a private channel

### Voice-command mode switching from within PTT
- [ ] "switch to Sonnet"
- [ ] "use OpenAI"
- [ ] "change to xAI"

### Auth & PWA
- [ ] Sign in flow (Google / Apple / phone+OTP all reachable)
- [ ] Sign out flow
- [ ] PWA install banner appears for an installable browser
- [ ] PWA install completes

### Voice-flow UI details
- [ ] Orb pulses correctly in `connecting` state (rotating/dimmed)
- [ ] Orb pulses correctly in `listening` state
- [ ] Orb morphs to purple in `speaking` state
- [ ] Connect/Disconnect buttons render and behave identically
- [ ] Typed-text fallback in the compose form posts successfully

### Visual identity
- [ ] Header (login link / Profile / Sign out buttons) is pixel-identical
- [ ] `#addon-usage-bars` (top of page when authed) render and update
- [ ] Channels list (active highlight, hover lift, mobile padding) unchanged
- [ ] Agent card glassmorphism + backdrop blur unchanged
- [ ] Body ambient gradient (radial teal + purple) visible behind chrome
- [ ] Auth modal (ChatGPT-style white card on dark backdrop) unchanged
- [ ] PWA install banner (when shown) is centered on bottom

## Automated checks (run before manual)
- `npm run build:css` — produces `public/dist/tailwind.css` in <5s
- `npm test` — full @playwright/test suite:
  - tailwind-smoke — all 14 brand tokens compile to the expected
    color/shadow values
  - class-coverage — every `class="..."` token in `public/index.html`
    resolves to a CSS rule (catches "I forgot to migrate this" regressions)
  - a11y-audit — zero serious/critical WCAG 2.1 AA violations across the
    three view states
  - vmode-config — MODES config + FSM shell invariants (Story 1.1)
- Run a single file with e.g. `npm run test:a11y` / `npm run test:vmode`,
  or `npm run test:ui` for the interactive watch UI.

## Known caveats (not regressions)
- `.login-field-label`, `.login-field-wrap`, `.login-title` were dead
  CSS before the migration (no element used them). The migration moved
  them into the Tailwind component layer, where Tailwind correctly
  purges unused component rules. Net effect on rendering: zero.
- Tailwind preflight (loaded before the inline `<style>` block) resets
  some defaults — but the inline rules still in `<style>` win the
  cascade because they come later in source order.
