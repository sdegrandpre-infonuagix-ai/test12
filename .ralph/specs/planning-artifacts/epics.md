---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
status: 'complete'
completedAt: '2026-05-27'
inputDocuments:
  - path: '_bmad-output/planning-artifacts/prd.md'
    type: 'prd'
    note: 'Primary requirements source. 31 FRs + 19 NFRs scoping the voice-mode switcher.'
  - path: '_bmad-output/planning-artifacts/architecture.md'
    type: 'architecture'
    note: '24 architectural decisions (5 critical, 17 important, 6 deferred for Phase 2+). Defines server endpoints, MCP tools, db helpers, FSM, patterns. Anticipatory guidance for epic ordering.'
  - path: '_bmad-output/planning-artifacts/ux-design-specification.md'
    type: 'ux'
    note: '7 vmode-* components, 5 user flows, Tailwind precursor commitment, WCAG 2.1 AA target.'
  - path: '_bmad-output/planning-artifacts/implementation-readiness-report-2026-05-27-v2-post-ux-arch.md'
    type: 'readiness-report'
    note: 'v2 readiness check. Status: triplet ready, epics are the remaining gap. This file resolves that gap.'
  - path: 'README.md'
    type: 'project-context'
    note: 'Existing test12 app overview. PARTIALLY STALE on tech stack — trust the codebase + PRD/Architecture frontmatter.'
  - path: '.github/issue-drafts/sonnet-4-6-label-impl-mismatch.md'
    type: 'tracked-issue'
    note: 'Companion code-fix tracker. Surfaces in Epic 6 (optional follow-on).'
workflowType: 'epics-and-stories'
project_name: 'test12'
user_name: 'BMad'
date: '2026-05-27'
mode: 'create'
focus: 'voice-mode-switcher'
---

# test12 - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for the **voice-mode switcher** feature in test12, decomposing the requirements from the PRD, UX Design, and Architecture into implementable stories.

**Scope reminder:** Brownfield extension to existing deployed app. No new top-level JS files (Tailwind precursor excepted), no new persistence schemas, no new external integrations. Operator-team-of-one velocity constraint. PRD MVP estimate: ~7-9 days of engineering after the Tailwind precursor ships.

## Requirements Inventory

### Functional Requirements

**Voice Mode Control:**

- FR1: User can see the currently active voice mode at any time without opening a menu, navigating away, or refreshing the page.
- FR2: User can switch from any voice mode to any other voice mode without a page refresh.
- FR3: User can escape from any realtime-streaming mode to a PTT mode in a single action.
- FR4: User can distinguish the PTT family of modes from the realtime-streaming family of modes in the switcher UI.
- FR5: User can perform mode switching identically while viewing the public feed or while inside any private channel.
- FR6: User can continue to use voice-command mode switching (e.g. *"switch to Sonnet"*) from within PTT modes as exists today.

**Cost Transparency:**

- FR7: User can see the cost tier (free vs paid; tier identity if paid) of every available voice mode before selecting it.
- FR8: User can see the cost tier of the currently active voice mode at all times.
- FR9: User can distinguish cost tiers without relying on color alone.

**Session Lifecycle Management:**

- FR10: System cleanly terminates any active realtime-streaming session when the user exits that mode.
- FR11: System releases the microphone and audio context on mode exit so that no orphan audio session persists after a switch.
- FR12: System halts billing-meter accrual for a paid mode at the moment the user exits that mode, with no silent post-exit accrual.
- FR13: User's draft text in the compose box is preserved across any mode switch.
- FR14: User's scroll position is preserved across any mode switch.
- FR15: User's current conversational step (e.g. mid-confirmation, mid-reply) is preserved across mode switches, except where the defined mid-flight transition policy specifies otherwise.

**Mid-Flight Transition Safety:**

- FR16: System detects when the user has audio in progress (mid-recording or mid-streaming) at the moment of a mode-switch attempt.
- FR17: User is asked to confirm before any mode switch that would discard in-progress audio.
- FR18: System never silently drops in-progress audio as a side effect of a mode switch.

**MCP Tool Surface:**

- FR19: Connected MCP agent can query the user's current voice mode.
- FR20: Connected MCP agent can set the user's voice mode to any of the four supported modes.
- FR21: Connected MCP agent can return the user to a PTT mode via a single, parameter-less tool call.
- FR22: MCP-initiated mode switches honor the same session-lifecycle guarantees as UI-initiated switches (clean teardown, state preservation, billing-meter halt, mid-flight safety).
- FR23: MCP mode-control tools authenticate the calling agent as a specific user and only affect that user's session — never another user's.

**Observability & Telemetry:**

- FR24: System records each mode-switch attempt with mode-from, mode-to, source (UI vs MCP), and timestamp.
- FR25: System records the outcome of each mode-switch attempt (success, failure, timeout) and its end-to-end duration.
- FR26: System records the duration of every realtime-streaming session.
- FR27: System records "escape" events distinctly — any exit from a paid mode back into a PTT mode while audio was in progress.
- FR28: Operator can aggregate mode-switch, session-duration, and escape-rate data per voice mode and per realtime provider to inform the realtime-provider bake-off decision.

**Accessibility:**

- FR29: User can navigate and operate the mode switcher using only the keyboard.
- FR30: User of a screen reader is informed of the currently active voice mode and is announced of mode changes as they happen.
- FR31: User with the `prefers-reduced-motion` setting experiences no motion-dependent transitions in the switcher UI.

**Total: 31 FRs across 7 capability areas, sequentially numbered, no gaps.**

### NonFunctional Requirements

**Performance:**

- NFR1: Mode-switch UI feedback (tap → "new mode active" UI state) completes in ≤500 ms at p95, measured client-side.
- NFR2: Realtime-streaming WebSocket teardown (socket close + audio resource release) completes in ≤200 ms at p95.
- NFR3: Server-side `addon_sessions` row finalization is committed within ≤500 ms of mode-exit signal.
- NFR4: MCP mode-control tool calls return in ≤1 s end-to-end at p95.
- NFR5: Switcher render on initial page load adds ≤100 ms to TTI and never blocks the existing `connect-btn`.
- NFR6: Mode-switch and telemetry recording never block the user-facing action — telemetry writes are fire-and-forget.

**Security:**

- NFR7: All MCP mode-control tool calls authenticate the caller as a specific user via existing middleware. Unauthenticated calls rejected with HTTP 401.
- NFR8: An authenticated MCP agent can only modify the voice mode of the user it is authenticated as. Cross-user manipulation rejected with HTTP 403 and logged.
- NFR9: Realtime-provider API keys (XAI/OPENAI/ANTHROPIC) never sent to the client.
- NFR10: Billing-meter state is readable by the user only for their own account, never exposed to a third-party agent.

**Reliability:**

- NFR11: Zero phantom billing — no `addon_sessions` row has meter accrual after a recorded mode-exit event (30 s slack per architecture's revised interpretation under client-direct WS).
- NFR12: No regression in existing voice flows (posting, threading, voice-reply matching, private-channel realtime delivery, auto-read narration, voice-command-driven mode switching from within PTT).
- NFR13: Audio session teardown is leak-free — no persistent mic indicator, no live `MediaStreamTrack`.
- NFR14: MCP tool calls that fail mid-teardown leave mode state internally consistent (eventually-consistent within 30 s per architecture's interpretation).
- NFR15: Switcher and teardown logic continue to function when service worker serves a cached `index.html`. New server-side MCP tools degrade gracefully if missing.

**Accessibility:**

- NFR16: Mode switcher conforms to WCAG 2.1 Level AA for all user-facing controls.
- NFR17: Mode switcher verified working with iOS Safari VoiceOver, macOS Safari VoiceOver, Android Chrome TalkBack, Windows Firefox NVDA.
- NFR18: Mode switcher meets minimum 3:1 contrast ratio for cost-tier badge text across all variants, in addition to text/symbol differentiation.
- NFR19: All cost-tier badge state changes and mode transitions announced via ARIA live region with `aria-live="polite"`.

**Total: 19 NFRs across 4 quality attributes, sequentially numbered, no gaps.**

### Additional Requirements

Technical requirements from Architecture that affect implementation (these are derived from architectural decisions, not from PRD FRs/NFRs):

- **AR1: Tailwind CSS build pipeline.** Add PostCSS + Tailwind CLI build step producing `public/dist/tailwind.css`. New files: `tailwind.config.js`, `postcss.config.js` at root. New devDependencies: `tailwindcss`, `postcss`, `autoprefixer`. New npm scripts: `build:css`, `watch:css`. Deploy scripts (`deploy.ps1`, `deploy-dev.ps1`) invoke `build:css` before bundling. This is a **precursor migration epic** that ships separately before any switcher work.
- **AR2: Four new HTTP endpoints in `app.js`:**
  - `GET /api/voice-mode` — read current mode + pending bridge record
  - `POST /api/voice-mode/end-session` — client informs server of WS close
  - `POST /api/voice-mode/heartbeat` — keep-alive while realtime WS active
  - `GET /api/admin/voice-mode-stats` — operator analytics (admin auth)
- **AR3: Three new MCP tools in `mcp-tools.js`:** `switch_to_ptt` (no params), `get_voice_mode` (no params), `set_voice_mode` (`{mode_id}`).
- **AR4: Nine new helper functions in `db.js`:** `finalizeAddonSession`, `recordHeartbeat`, `autoFinalizeStaleHeartbeats`, `getDesiredMode`, `setDesiredMode`, `clearDesiredMode`, `recordVoiceModeSwitch`, `getVoiceModeStats`, `getCurrentVoiceModeState`.
- **AR5: `addon_sessions` schema extension.** Add `last_heartbeat` attribute (DynamoDB: flexible, no migration; SQLite: `ALTER TABLE addon_sessions ADD COLUMN last_heartbeat TEXT`). Also extend `usage_logs` schema for switcher telemetry fields (`mode_from`, `mode_to`, `source`, `outcome`, `duration_ms`, `error_class`).
- **AR6: Transient "desired mode" data namespace in DynamoDB.** Used for MCP→client bridge. TTL ~60s. Per-user.
- **AR7: SEC1 pre-flight verification.** Half-day code-reading task on `/api/session` and `/api/openai-session` before Epic 4 (MCP) begins: verify ephemeral token TTL (recommend ≤60-90s), per-user scoping, per-user rate limiting. Fix if needed.
- **AR8: Service worker CACHE_VERSION bump.** From `test12-v5` to `test12-v6`, once at end of Tailwind migration. Include `dist/tailwind.css` in `STATIC_ASSETS`.
- **AR9: Heartbeat-timeout cleanup mechanism.** Lazy check on every `addon_sessions` read invokes `db.autoFinalizeStaleHeartbeats()` to auto-finalize rows where `last_heartbeat` is >30s stale and `ended_at` is NULL.
- **AR10: Polling cadence keyed to `document.visibilityState`** — 5s when visible, 30s when hidden; switch immediately on `visibilitychange` event.
- **AR11: Server-side mode validation list.** `const VOICE_MODE_IDS = Object.freeze(['llm', 'deluxe-claude', 'deluxe-xai', 'deluxe-openai'])` at top of `mcp-tools.js`, used by `set_voice_mode` and `switch_to_ptt`.
- **AR12: All vmode-* code in named region of `index.html`** — banner comment `// ═ Voice-Mode Switcher`; no new client JS files.
- **AR13: Source-attribution enum has four values:** `'ui' | 'mcp' | 'voice-command' | 'ui-retry'` (last one for toast "Try again" replays).
- **AR14: Companion code-level fix tracked in `.github/issue-drafts/sonnet-4-6-label-impl-mismatch.md`** — server requests `claude-sonnet-4-5` but UI labels mode "Sonnet 4.6". Not switcher scope but natural to bundle.

### UX Design Requirements

Actionable UX work items from `ux-design-specification.md`. Each is specific enough to generate a story with testable acceptance criteria.

**Tailwind precursor:**

- UX-DR1: Tailwind config — `tailwind.config.js` with `theme.extend.colors` (brand.teal `#1595b2`, brand.amber `#f59e0b`, brand.red `#ef4444`, surface.dark `#050810`, surface.dark-elevated `#1e293b`, text.primary `#e2e8f0`, text.muted `#64748b`, overlay.teal-faint/soft/medium/edge), `theme.extend.spacing` (custom scale matching existing `0.4rem`/`6px`/`14px` rhythm), `theme.extend.boxShadow` (`shadow.hover`, `shadow.sheet`), `theme.extend.fontFamily.sans` (Inter).
- UX-DR2: Migrate `public/index.html`'s inline `<style>` block (~1,100 lines) to Tailwind utilities. Preserve all existing brand tokens. Maintain visual continuity (users perceive no change). Test every existing flow for regression.

**Switcher components (7 vmode-* primitives):**

- UX-DR3: `vmode-badge` component — pill in header chrome, 4 variants (`-free`/`-paid`/`-premium` + transition state). Icon + mode name + center-dot + tier chip. Tap target ≥44×44px. `aria-label="Voice mode: {modeName}, {tierName} tier. Tap to switch."`. `aria-expanded`/`aria-controls` attributes. Focus ring via `focus-visible:ring-2 focus-visible:ring-brand-teal`. `active:scale-95` tap feedback.
- UX-DR4: `vmode-sheet` component — bottom sheet on mobile (`<sm`), popover anchored to badge on desktop (`md:+`). Slides up (mobile) / fades in (desktop) with `motion-safe:` gating. Native `<dialog>` element. Focus trap. Esc/backdrop-tap/Cancel dismisses. `aria-labelledby` to "Voice Mode" title.
- UX-DR5: `vmode-row` component — two-line card (mode name + caption). `<button>` element with `aria-current="true"` on selected. Hover state (`bg-overlay-teal-faint`), tap-flash state (`bg-overlay-teal-medium` for 150ms). Row height ≥48px for tap target.
- UX-DR6: `vmode-row-chip` component — small pill at right of row + trailing element of badge. 3 variants (`-free` teal/`-paid` amber/`-premium` red). `aria-hidden="true"` (info conveyed via parent's aria-label). Content: literal "Free"/"$$"/"$$$" (text + symbol redundancy per FR9).
- UX-DR7: `vmode-section-label` component — small uppercase label above each family group (PTT/REALTIME). `<h3>` element. Matches existing `.aub-label` style: 0.6rem, weight 700, letter-spacing 0.04em, color `text.muted`.
- UX-DR8: `vmode-confirm-modal` component — mid-flight discard confirmation. `<dialog role="alertdialog">`. Body copy template: *"Switching to {newMode} will discard your current {oldMode} recording. Continue?"* Buttons: [Stay] (secondary, leftward) [Switch] (primary teal, rightward, focused-on-open). Backdrop-tap does NOT dismiss (intentional friction). Esc dismisses with implicit Stay.
- UX-DR9: `vmode-toast` component — error notification at top of viewport. `role="status"`. Body: *"Switch failed. You're still in {OldMode}."* Actions: [Try again] [Refresh] [×]. Auto-dismiss after 8s, pause-on-hover (desktop).

**Accessibility infrastructure:**

- UX-DR10: ARIA live region — single `<div id="vmode-aria-live" aria-live="polite" aria-atomic="true" class="sr-only">` in header chrome, persistent. Format: *"Switched to {newMode}, {tier} tier. {Old realtime session, if any} closed."* (success) and *"Switch failed. Voice mode is still {OldMode}."* (failure).
- UX-DR11: WCAG 2.1 AA verification — axe-core/Lighthouse audit returns zero serious/critical violations for switcher code. Contrast: all cost-tier badge color pairs ≥3:1; body text on dark surfaces ≥4.5:1. Focus rings on all interactive elements.
- UX-DR12: Screen-reader matrix verification — switcher tested on iOS Safari VoiceOver, macOS Safari VoiceOver, Android Chrome TalkBack, Windows Firefox NVDA. All flows (Flow 1-5 from UX spec) verified.
- UX-DR13: Reduced-motion handling — all animations gated behind `motion-safe:` Tailwind variant. With `prefers-reduced-motion: reduce`: sheet/popover appears instantly; tap-flash shortened to 50ms (still fires — informational, not decorative); transition-state opacity dim is instant (no animation curve).
- UX-DR14: Keyboard-only navigation — full Tab/Shift+Tab/Enter/Space/Esc/arrow-key coverage for badge, sheet rows, modal buttons, toast actions. Focus order matches visual order. Esc dismisses overlays.

**Responsive design:**

- UX-DR15: 768px breakpoint — switcher transitions from bottom-sheet (mobile pattern) to anchored popover (desktop pattern) at `md:` breakpoint. Badge gains room for longer mode name on desktop.
- UX-DR16: Mobile viewport test matrix — switcher works at 320px (smallest target), 375px (iPhone SE), 414px (iPhone Plus). PWA-installed iOS context verified separately from in-browser context.

**Companion audit:**

- UX-DR17: Existing UI accessibility baseline audit — separate task before MVP launch. Verify surrounding header chrome (`.header-login-link`, `Profile`, `Sign out` buttons) meets WCAG 2.1 AA so switcher doesn't inherit unfixable a11y debt.

**Total: 17 UX Design Requirements (1 design-token foundation, 1 migration, 7 components, 5 accessibility infrastructure, 2 responsive, 1 companion).**

### FR Coverage Map

**Functional Requirements:**

- FR1 (mode visible always) — Epic 1
- FR2 (switch any to any) — Epic 2
- FR3 (one-tap realtime escape) — Epic 2
- FR4 (PTT/Realtime family distinction) — Epic 1
- FR5 (works on public + private channels) — Epic 1 (visibility) + Epic 2 (switching)
- FR6 (voice-command mode switching preserved) — Epic 1
- FR7 (tier visible before selecting) — Epic 1
- FR8 (current tier always visible) — Epic 1
- FR9 (tier distinguishable without color alone) — Epic 1
- FR10 (clean realtime session teardown) — Epic 2
- FR11 (mic + audio context released) — Epic 2
- FR12 (billing meter halt) — Epic 2
- FR13 (draft preserved) — Epic 2
- FR14 (scroll preserved) — Epic 2
- FR15 (conversational step preserved) — Epic 2
- FR16 (audio-in-progress detection) — Epic 3
- FR17 (confirmation before discard) — Epic 3
- FR18 (no silent audio drops) — Epic 3
- FR19 (MCP query current mode) — Epic 4
- FR20 (MCP set any mode) — Epic 4
- FR21 (MCP switch_to_ptt) — Epic 4
- FR22 (MCP-to-UI parity) — Epic 4
- FR23 (MCP per-user auth) — Epic 4
- FR24 (telemetry: each attempt logged) — Epic 2 (telemetry schema + UI/voice-command writes); Epic 4 adds MCP source
- FR25 (telemetry: outcome + duration) — Epic 2 (writes); Epic 4 adds MCP-sourced writes
- FR26 (realtime session duration recorded) — Epic 2
- FR27 (escape events distinctly recorded) — Epic 2
- FR28 (operator can aggregate) — Epic 5
- FR29 (keyboard nav) — Epic 1 (badge) + Epic 2 (sheet) + Epic 3 (modal)
- FR30 (screen reader announcements) — Epic 1 (ARIA live region + voice-command source) + Epic 2 (announcements fire on switch) + Epic 3 (modal-related)
- FR31 (reduced motion) — Epic 1 (badge transitions) + Epic 2 (sheet/transition state) + Epic 3 (modal animation)

**Non-Functional Requirements (cross-cutting; primary epic in bold):**

- NFR1 (switch UI ≤500ms p95) — **Epic 2** (primary); Epic 1 establishes baseline
- NFR2 (WS teardown ≤200ms p95) — **Epic 2**
- NFR3 (addon_sessions finalize ≤500ms) — **Epic 2**
- NFR4 (MCP tool ≤1s p95) — **Epic 4**
- NFR5 (switcher render ≤100ms TTI) — **Epic 1**
- NFR6 (telemetry fire-and-forget) — **Epic 2** + Epic 4
- NFR7 (MCP auth) — **Epic 4**
- NFR8 (cross-user isolation) — **Epic 4**
- NFR9 (API keys never reach client) — verified by **Epic 4 SEC1 pre-flight story**
- NFR10 (billing state user-scoped) — **Epic 4** + Epic 5
- NFR11 (zero phantom billing) — **Epic 2** (heartbeat mechanism)
- NFR12 (no regression in existing flows) — **All epics** (each epic includes regression pass per merge)
- NFR13 (audio teardown leak-free) — **Epic 2**
- NFR14 (atomic rollback / eventually consistent within 30s) — **Epic 2** (retry + heartbeat fallback)
- NFR15 (service worker version skew handling) — **Epic 0** (cache bump) + Epic 2 (graceful degradation)
- NFR16 (WCAG 2.1 AA) — **Epic 1, 2, 3** (each component-bearing epic)
- NFR17 (screen-reader matrix) — **Epic 2** (full matrix verification)
- NFR18 (3:1 contrast on badges) — **Epic 1**
- NFR19 (ARIA live announcements) — **Epic 1** (region setup) + **Epic 2** (announcements fire)

**Additional Requirements (from Architecture):**

- AR1 (Tailwind build pipeline) — Epic 0
- AR2 (4 endpoints) — Epic 2 (end-session, heartbeat), Epic 4 (voice-mode read), Epic 5 (admin stats)
- AR3 (3 MCP tools) — Epic 4
- AR4 (9 db helpers) — Epic 2 (most), Epic 4 (desired-mode helpers), Epic 5 (stats helper)
- AR5 (schema extensions) — Epic 2 (addon_sessions.last_heartbeat, usage_logs fields)
- AR6 (desired-mode namespace) — Epic 4
- AR7 (SEC1 pre-flight) — Epic 4 (first story)
- AR8 (CACHE_VERSION bump) — Epic 0
- AR9 (lazy-check heartbeat cleanup) — Epic 2
- AR10 (visibility-keyed polling) — Epic 4
- AR11 (server-side validation list) — Epic 4
- AR12 (vmode-* region in index.html) — Epic 1 (region established)
- AR13 (source-attribution enum) — Epic 1 (initial three values: ui/voice-command/mcp-placeholder), Epic 4 (mcp actual usage), Epic 2 (ui-retry added with toast)
- AR14 (Sonnet 4.5/4.6 model ID fix) — Epic 6 (optional)

**UX Design Requirements:**

- UX-DR1 (Tailwind config) — Epic 0
- UX-DR2 (migrate index.html styles) — Epic 0
- UX-DR3 (vmode-badge) — Epic 1
- UX-DR4 (vmode-sheet) — Epic 2
- UX-DR5 (vmode-row) — Epic 2
- UX-DR6 (vmode-row-chip) — Epic 1 (used in badge) + Epic 2 (used in rows)
- UX-DR7 (vmode-section-label) — Epic 2 (only used in sheet)
- UX-DR8 (vmode-confirm-modal) — Epic 3
- UX-DR9 (vmode-toast) — Epic 2
- UX-DR10 (ARIA live region) — Epic 1
- UX-DR11 (WCAG 2.1 AA verification) — Epic 1 (badge), Epic 2 (sheet/toast), Epic 3 (modal)
- UX-DR12 (screen-reader matrix) — Epic 2 (full matrix on switching flows)
- UX-DR13 (reduced-motion handling) — Epic 1 (badge) + Epic 2 (sheet/transition) + Epic 3 (modal)
- UX-DR14 (keyboard navigation) — Epic 1 (badge focus) + Epic 2 (sheet nav) + Epic 3 (modal nav)
- UX-DR15 (768px breakpoint) — Epic 2 (sheet↔popover transition)
- UX-DR16 (mobile viewport test matrix) — Epic 2 (primary test surface)
- UX-DR17 (existing UI a11y baseline audit) — Companion task, not an epic story (could be filed as a separate issue or done during Epic 0 a11y verification)

## Epic List

### Epic 0: Foundation — Tailwind Migration (Precursor)

**This is a technical-foundation epic** (precursor) — it does not
deliver user-visible behavior change by itself. It exists to enable
Epics 1-5 to be authored in Tailwind per the UX commitment, without
forcing a parallel two-styling-systems period in `index.html`.

**Standalone deliverable:** test12 ships in production with
identical user-visible appearance, but authored in Tailwind utility
classes instead of inline `<style>`-block CSS. Service-worker
cache bumps once (`test12-v5` → `test12-v6`). All existing flows
(posting, threading, channels, auth, etc.) work identically.

**Independence:** Stands alone — does not require any switcher
epic to function. Conversely, it is a hard prerequisite for all
switcher epics (no `vmode-*` code ships before this completes).

**Requirements covered:** AR1, UX-DR1, UX-DR2, AR8 (CACHE_VERSION
bump at end), AR9 (deploy scripts)

---

### Epic 1: Visible Mode Status (the user always knows where they are)

**User outcome:** A user opens test12 and can see at all times which
voice mode is active and what cost tier it implies. Glance-and-know.
The badge sits in the header chrome alongside Profile/Sign-out
buttons. Voice-command mode switching from within PTT
(*"switch to Sonnet"*) continues to work as it does today and
updates the badge correctly.

**Standalone deliverable:** Badge visible in header showing current
mode + cost tier. Voice-command mode switching from PTT updates the
badge. **No tap-to-switch yet** — that's Epic 2. Sheet does not open.
User benefit: when stuck in a paid mode by accident, the user at
least *knows* they're in it (and can use the existing Disconnect
button or refresh to escape until Epic 2 ships).

**Independence:** Stands alone. Does not require Epic 2-5 to
function. Provides the visual primitive that Epic 2 will make
interactive.

**Requirements covered:** FR1, FR4, FR5 (visibility part), FR6, FR7
(displayed in badge), FR8, FR9, FR30 (mode-change announcement on
voice-command switch), partial FR29 (badge focusable), partial NFR16
(badge a11y), partial UX-DR3, UX-DR6, UX-DR10 (ARIA live region),
UX-DR11 (axe-core on badge), UX-DR13 (reduced motion on badge),
AR12 (vmode-* region), D1 (MODES config), FE1 (FSM shell), FE3
(extend updateAgentUI), FE5 (source attribution wiring)

---

### Epic 2: The Escape (one-tap exit from any mode, work intact)

**User outcome:** A user tapped into a paid realtime mode by
accident — or just done with it — can return to free PTT in two
taps (badge → row). Draft text, scroll position, conversational
step all survive the switch. The realtime WebSocket closes cleanly;
the addon-minute meter freezes; the browser's mic indicator
disappears. The hero moment from the PRD lands.

**Standalone deliverable:** Full tap-to-switch functionality across
all four modes via the UI. Two-party teardown choreography
implemented (client closes WS, server finalizes `addon_sessions`).
Heartbeat-based phantom-billing prevention active. ARIA
announcements fire. Error toast appears on teardown failure with
working Try Again / Refresh actions. Mid-flight audio is silently
discarded for MVP shipped from this epic (Epic 3 adds the
confirmation modal).

**Independence:** Builds on Epic 1's badge + FSM, but stands alone
once Epic 1 ships. Does not require Epics 3-5 to function. Delivers
the trust contract for users who tap deliberately.

**Requirements covered:** FR2, FR3, FR5 (switching across channels),
FR10, FR11, FR12, FR13, FR14, FR15, FR24, FR25, FR26, FR27
(escape-event tagging), partial FR29 (sheet keyboard nav),
partial FR30 (announcements on switch), FR31, UX-DR4 (sheet),
UX-DR5 (row), UX-DR9 (toast), UX-DR12 (screen-reader matrix on
switching flow), UX-DR13 (reduced motion sheet), UX-DR14 (keyboard
nav sheet), UX-DR15 (768px breakpoint), UX-DR16 (mobile viewport
test), AR2 (`/api/voice-mode/end-session`, `/api/voice-mode/heartbeat`),
AR4 (most db helpers), AR5 (schema extensions), AR9 (lazy-check
heartbeat cleanup), API3 (two-party teardown), API4 (client-direct
WS confirmed), OPS1 (heartbeat tracking), NFR1, NFR2, NFR3, NFR6,
NFR11, NFR12, NFR13, NFR14, NFR15

---

### Epic 3: Trust-Preserving Mid-Flight Switches

**User outcome:** A user attempting to switch modes while audio is
actively recording or streaming gets a clear, named confirmation
before any work is lost. *"Switching to Sonnet 4.6 will discard
your current xAI Realtime recording. Continue?"* with [Stay]
[Switch]. The Stay path is frictionless undo; the Switch path
proceeds with full teardown. No silent audio drops.

**Standalone deliverable:** Audio-in-progress detection wired into
the FSM. `vmode-confirm-modal` component appears at the right
moment and only at the right moment (non-mid-flight switches are
not blocked). Modal copy correctly names both source and target
modes. Backdrop-tap explicitly does not dismiss (intentional
friction); Esc dismisses with implicit Stay.

**Independence:** Builds on Epic 2's switching flow; Epic 2's
"silently discard mid-flight audio" behavior is replaced by Epic
3's confirmation flow. Stands alone once Epic 2 ships.

**Requirements covered:** FR16, FR17, FR18, FE4 (discard-with-confirmation
policy), UX-DR8 (vmode-confirm-modal), partial FR29 (modal
keyboard nav), partial FR30 (modal-related announcements),
partial FR31 (modal animation respects reduced motion)

---

### Epic 4: Agent-Driven Mode Control (the escape works from voice assistants too)

**User outcome:** A user talking to a connected MCP agent (Claude,
Grok, or any MCP-aware client) in another tab can ask the agent to
switch test12's voice mode. The agent invokes `switch_to_ptt`
(or `set_voice_mode`); the server records the request; the next
client poll picks it up; teardown completes per the Epic 2
contract. The agent tells the user "Done." User glances at the
test12 tab and sees the new mode with state preserved.

**Standalone deliverable:** Three MCP tools registered
(`switch_to_ptt`, `get_voice_mode`, `set_voice_mode`). Server
endpoint `GET /api/voice-mode` returns current + pending desired
mode. Transient "desired mode" bridge records in DynamoDB with
60s TTL. Client polling loop active (5s visible / 30s hidden).
Per-user auth on MCP tools rejects cross-user manipulation.
**SEC1 pre-flight verification of `/api/session` and
`/api/openai-session` ephemeral-token TTL + per-user scoping
completes before this epic merges to main.**

**Independence:** Builds on Epic 2's teardown contract. Stands
alone once Epic 2 ships. Does not require Epics 3 or 5 to function.

**Requirements covered:** FR19, FR20, FR21, FR22, FR23, AR2
(`/api/voice-mode`), AR3 (3 MCP tools), AR4 (bridge-record helpers),
AR6 (desired-mode namespace), AR7 (SEC1 pre-flight as story),
AR10 (visibility-keyed polling cadence), AR11 (server-side
validation list), AR13 (`source: 'mcp'` attribution wired),
API1 (tool design), API2 (polling pathway), SEC1, NFR4, NFR7,
NFR8, NFR9, NFR10

---

### Epic 5: Bake-Off Analytics (operator can decide which realtime provider wins)

**User outcome:** The operator (BMad) can query mode-switch and
session-duration data per voice mode and per realtime provider via
a single admin endpoint. The data is sufficient to decide which
realtime provider — xAI Grok or OpenAI Realtime — survives the
bake-off and gets to stay in the codebase.

**Standalone deliverable:** `GET /api/admin/voice-mode-stats`
endpoint returns aggregated metrics: per-mode session count,
per-mode average duration, escape rate from each realtime mode,
re-entry rate to each realtime mode, per-realtime-provider breakdown.
Admin auth (existing `ADMIN_SECRET_KEY` pattern) gates access.

**Independence:** Builds on Epic 2's telemetry writes and Epic 4's
source attribution. Stands alone once Epic 4 ships. Does not require
any future epic.

**Requirements covered:** FR28, AR2 (`/api/admin/voice-mode-stats`),
AR4 (`getVoiceModeStats` helper), API5 (admin endpoint pattern)

---

### Epic 6: Companion Fix — Sonnet 4.5/4.6 Model ID (Optional)

**User outcome:** Users on the Deluxe-Claude tier actually receive
the Sonnet 4.6 inference they see promised in the UI, instead of
the Sonnet 4.5 currently delivered by `app.js:1171`.

**Standalone deliverable:** Server-side model ID in `app.js:1171`
updated from `'claude-sonnet-4-5'` to `'claude-sonnet-4-6'` (and
extracted into a named constant alongside `CLAUDE_MODEL` to prevent
future drift). Existing test of the `/api/claude-chat` flow on the
Deluxe-Claude tier confirms Sonnet 4.6 behavior.

**Independence:** Fully independent of all switcher epics. Can ship
at any time. Tracked separately at
`.github/issue-drafts/sonnet-4-6-label-impl-mismatch.md`.

**Requirements covered:** AR14

---

## Epic 0: Foundation — Tailwind Migration (Precursor)

Migrate test12's inline `<style>`-block CSS to Tailwind utility classes, with a proper PostCSS+CLI build step, preserving all existing brand tokens and user-visible appearance. This is the hard prerequisite for all switcher epics.

### Story 0.1: Add Tailwind build pipeline

As a **developer maintaining test12**,
I want **a PostCSS+Tailwind CLI build pipeline configured**,
So that **I can author styles in Tailwind utilities and produce a purged production CSS bundle**.

**Acceptance Criteria:**

**Given** the repo at its current state with no build step
**When** `npm install` runs after this story's `package.json` changes are merged
**Then** `tailwindcss`, `postcss`, and `autoprefixer` are installed as devDependencies
**And** `npm run build:css` produces `public/dist/tailwind.css` from `public/index.html`'s utility class usage
**And** `npm run watch:css` runs the same build in watch mode for development iteration
**And** `public/dist/` is added to `.gitignore` (build output, not source)
**And** the build completes in under 5 seconds for the existing codebase size

### Story 0.2: Configure Tailwind theme with existing brand tokens

As a **developer authoring switcher and future components**,
I want **`tailwind.config.js` to expose test12's existing brand tokens as named Tailwind classes**,
So that **I can write `bg-brand-teal` instead of `bg-[#1595b2]` and the tokens are documented in one place**.

**Acceptance Criteria:**

**Given** `tailwind.config.js` exists from Story 0.1
**When** the file is configured per UX-DR1
**Then** `theme.extend.colors` contains `brand.teal #1595b2`, `brand.amber #f59e0b`, `brand.red #ef4444`, `surface.dark #050810`, `surface.dark-elevated #1e293b`, `text.primary #e2e8f0`, `text.muted #64748b`, and the four `overlay.teal-*` translucent variants
**And** `theme.extend.fontFamily.sans` is `['Inter', 'sans-serif']`
**And** `theme.extend.boxShadow` includes `shadow.hover` (matches `.channel-panel:hover`) and `shadow.sheet`
**And** `theme.extend.spacing` includes the existing irregular scale (`0.4rem`, `6px`, `14px`, etc.) as named tokens
**And** `content` glob covers `public/index.html` so utility classes used there are detected by the purge step
**And** a smoke test (rendering one element styled with `bg-brand-teal text-text-primary`) renders the correct color

### Story 0.3: Migrate header chrome to Tailwind utilities

As a **test12 user**,
I want **the header (login link, profile, sign-out buttons, addon-usage-bars) to look and behave identically after migration**,
So that **I see no visual change but the codebase has been moved off inline CSS for the header region**.

**Acceptance Criteria:**

**Given** the existing `.header-login-link`, `#header-auth-btns`, `#addon-usage-bars` and related rules in the `<style>` block
**When** these styles are migrated to Tailwind utilities applied directly in the HTML (with `@apply`-composed `header-login-link` component class if reuse warrants)
**Then** the rendered header in production is pixel-identical to the pre-migration state (verified by side-by-side screenshot on iPhone, iPad, desktop)
**And** the `<style>`-block rules for these elements are removed
**And** all hover/focus/active interaction states still behave identically
**And** the inline `data-key="key"` addon-usage-bar rendering logic (from `index.html:1966+`) continues to update progress bars correctly

### Story 0.4: Migrate channels section to Tailwind utilities

As a **test12 user**,
I want **the public-channel and private-channels sections to look identical after migration**,
So that **posting, reading, and channel navigation are visually unchanged**.

**Acceptance Criteria:**

**Given** the `.channels-section`, `.channel-panel`, `.channel-panel.active`, `.ch-name`, `.ch-meta`, `.ch-id`, `.ch-messages`, `.ch-empty` rules
**When** these styles are migrated to Tailwind utilities
**Then** public-channel and private-channels-created/joined sections render pixel-identical to pre-migration
**And** active-channel highlight, hover translateY/box-shadow effects, mobile responsive padding all behave identically
**And** the existing `setActiveChannel()`, `loadPublicPosts()`, `loadPrivateChannels()` functions continue to update DOM correctly

### Story 0.5: Migrate compose form, orb, and agent-card to Tailwind utilities

As a **test12 user**,
I want **the agent card, orb animation, connect/disconnect buttons, and compose forms to look and behave identically**,
So that **the voice-flow UI (the primary user surface) is visually unchanged**.

**Acceptance Criteria:**

**Given** `.agent-card`, `.orb`, `.orb-ring`, `.btn`, `.btn-primary`, `.btn-danger`, `.btn-ghost`, `.compose-form`, `.compose-input`, `.compose-btn`, `#status`, `#logs`, `#text-prompt-form`, `#text-prompt-input`, `#text-prompt-send`, `.aliases-section`
**When** these styles are migrated to Tailwind utilities
**Then** the agent card and orb pulse animation render identically (including `connecting` state, transition timings)
**And** Connect/Disconnect/text-input/text-send buttons render and behave identically
**And** the compose form for the public-channel posts identically
**And** the typed-text fallback flow still works

### Story 0.6: Migrate auth modal, PWA banner, body background to Tailwind utilities

As a **test12 user**,
I want **the auth modal (Login/OTP), PWA install banner, and ambient body background to look identical**,
So that **the auth and PWA-install flows are visually unchanged**.

**Acceptance Criteria:**

**Given** the auth-modal CSS, `#pwa-banner` CSS, `body::before` ambient-gradient pseudo-element, and `body` base styles
**When** these styles are migrated to Tailwind utilities (with `body::before` either preserved as one of the few remaining hand-written rules OR re-expressed as a positioned `<div>`)
**Then** the auth modal renders identically; login/OTP/profile flows work as before
**And** the PWA install banner renders identically; the install prompt fires correctly
**And** the body background ambient gradient is visually identical (subtle radial gradients in upper-left and lower-right)
**And** the iOS `-webkit-fill-available` viewport fix is preserved

### Story 0.7: Update sw.js to include dist/tailwind.css and bump CACHE_VERSION

As a **returning test12 user after the Tailwind migration ships**,
I want **the service worker to fetch the new CSS and cache it cleanly**,
So that **my installed PWA picks up the new styles on next launch with at most a one-time slow load**.

**Acceptance Criteria:**

**Given** the Tailwind migration is otherwise complete and `public/dist/tailwind.css` is produced by the build
**When** `public/sw.js` is updated
**Then** `CACHE_VERSION` is bumped from `'test12-v5'` to `'test12-v6'`
**And** `STATIC_ASSETS` includes `'/dist/tailwind.css'`
**And** the cache-first strategy for static CSS files matches `/\.css$/` (already covered by the existing static-asset matcher)
**And** the activate handler purges the old `test12-v5` cache (existing logic; verified to still work)
**And** a returning user with the old service-worker cache experiences exactly ONE slow load on first visit after deploy, then normal speed thereafter

### Story 0.8: Update deploy scripts to invoke build:css

As a **developer deploying test12**,
I want **`deploy.ps1` and `deploy-dev.ps1` to invoke `npm run build:css` before bundling**,
So that **production deploys always include the latest Tailwind output**.

**Acceptance Criteria:**

**Given** `deploy.ps1` and `deploy-dev.ps1` in their current state
**When** these scripts are updated
**Then** each script invokes `npm run build:css` as one of the first steps (before any bundling/upload)
**And** the script fails fast (non-zero exit) if `build:css` fails — preventing deploys with stale or missing CSS
**And** `public/dist/tailwind.css` is included in whatever bundling/upload step ships static assets to S3/CloudFront

### Story 0.9: Final regression pass on existing flows

As a **test12 user**,
I want **every existing flow to work identically after migration**,
So that **the Tailwind migration is invisible to me as a user**.

**Acceptance Criteria:**

**Given** Stories 0.1-0.8 are complete
**When** the operator runs through the regression test list manually
**Then** each of the following flows works identically to pre-migration state, on iPhone Safari, Android Chrome, and desktop Chrome/Safari/Firefox:
**And** post a voice post in public feed (PTT mode)
**And** reply to a post in public feed
**And** create a private channel
**And** join a private channel by ID
**And** send a message in a private channel
**And** voice-command mode switching from within PTT (*"switch to Sonnet"*, *"use OpenAI"*, *"change to xAI"*)
**And** auto-read narration in public feed
**And** sign in / sign out flow
**And** PWA install banner appears and install works
**And** the orb animation pulses correctly in `connecting` state
**And** typed-text fallback in the compose form works

### Story 0.10: Verify existing UI accessibility baseline (UX-DR17)

As a **test12 user with assistive needs**,
I want **the existing header chrome and core flows to meet WCAG 2.1 AA before the switcher commits to AA**,
So that **the new switcher doesn't inherit unfixable accessibility debt from its surrounding context**.

**Acceptance Criteria:**

**Given** the Tailwind migration is complete (Stories 0.1-0.9 done)
**When** an accessibility audit runs against `public/index.html` post-migration
**Then** axe-core or Lighthouse accessibility audit returns zero serious/critical violations on the unauthenticated landing
**And** zero serious/critical violations on the authenticated public-feed view
**And** zero serious/critical violations on a private-channel view
**And** any AA-level findings (contrast, focus, ARIA) on existing header chrome are documented as either fixed-in-this-story or filed as separate followup issues
**And** the existing voice-flow UI (orb, connect/disconnect, compose) is verified working with VoiceOver on iOS and macOS

---

## Epic 1: Visible Mode Status

The user always knows where they are. Badge in the header shows current mode + cost tier; voice-command switches in PTT update the badge.

### Story 1.1: Establish vmode-* code region in index.html with MODES config and FSM shell

As a **developer building the switcher**,
I want **a clearly-marked code region in `index.html` containing the `MODES` config and an FSM shell with an `idle` state**,
So that **all subsequent switcher work has a defined home and the boundary against existing code is explicit**.

**Acceptance Criteria:**

**Given** Epic 0 is complete (Tailwind in place)
**When** the new region is added to `index.html`
**Then** a banner comment marks the region: `// ═══ Voice-Mode Switcher (PRD: voice-mode-switcher) ═══` etc., per architecture's pattern rule
**And** a `const MODES = Object.freeze([...])` array exists with one entry per mode (`'llm'`, `'deluxe-claude'`, `'deluxe-xai'`, `'deluxe-openai'`), each containing `mode_id`, `mode_name` (e.g. "Haiku 4.5"), `family` (`'ptt' | 'realtime'`), `cost_tier` (`'free' | 'paid' | 'premium'`), `tier_label` (`'Free' | '$$' | '$$$'`), `caption`, `icon` (emoji string per existing convention)
**And** a `vmodeFsm` object exists with `state: 'idle'` and a `transition(event, payload)` method that logs every transition via `console.log('[vmode-fsm] …')` per the architecture's logging pattern
**And** the FSM region adds zero new files (per AR12)
**And** no symbol outside this region is mutated (existing code unchanged)

### Story 1.2: Add vmode-aria-live region to header chrome

As a **screen-reader user**,
I want **an ARIA live region in the header chrome that announces mode changes**,
So that **I'm informed when the voice mode changes for any reason**.

**Acceptance Criteria:**

**Given** the header chrome in `index.html`
**When** a new element is added
**Then** `<div id="vmode-aria-live" aria-live="polite" aria-atomic="true" class="sr-only">` exists as a sibling of the existing `header-login-link` / `header-auth-btns`
**And** the element has `sr-only` Tailwind class (visually hidden but screen-reader-readable)
**And** a helper function `announceVoiceMode(text)` in the vmode region updates the element's text content
**And** calling `announceVoiceMode('Switched to Haiku 4.5, Standard tier.')` produces the announcement on iOS Safari VoiceOver

### Story 1.3: Build vmode-badge component (display-only)

As a **test12 user**,
I want **a header pill that shows my current voice mode and its cost tier**,
So that **I can see at a glance which mode is active and what it costs me**.

**Acceptance Criteria:**

**Given** the existing header chrome and the MODES config from Story 1.1
**When** the `vmode-badge` is rendered
**Then** the badge appears in the header alongside `header-login-link` / `Profile` / `Sign out`
**And** the badge displays an icon + mode name + center-dot + cost-tier chip (e.g. "🎙️ Haiku · Free")
**And** the badge background color matches the cost tier: teal for `vmode-badge-free`, amber for `-paid`, red for `-premium`
**And** the cost-tier chip text uses literal "Free" / "$$" / "$$$" symbols (text-and-color redundancy per FR9)
**And** the badge is a native `<button type="button">` with `aria-label="Voice mode: {modeName}, {tierName} tier. Tap to switch."` and `aria-expanded="false"` (placeholder; sheet wiring comes in Epic 2)
**And** tap-target dimensions are ≥44 × 44 px (via padding) per existing iOS HIG convention
**And** focus-visible state applies a 2 px teal ring (`focus-visible:ring-2 focus-visible:ring-brand-teal`)
**And** `active:scale-95` provides tactile feedback on tap
**And** the badge is hidden when no user is authenticated (matches existing `header-auth-btns` display logic)
**And** for the four `MODES` entries, the badge renders correctly in all four variants on iPhone, iPad, and desktop

### Story 1.4: Hook badge render into updateAgentUI()

As a **test12 user**,
I want **the badge to update whenever `VA_MODE` changes for any reason**,
So that **the badge is never out-of-sync with the actual active mode**.

**Acceptance Criteria:**

**Given** the existing `updateAgentUI()` function in `index.html` (around line 2492) is called from multiple paths
**When** `updateAgentUI()` is extended
**Then** a single new line invokes `renderVoiceModeBadge()` at the end of `updateAgentUI()` (extend, don't replace — per FE3 / NFR12)
**And** changing `VA_MODE` from `'llm'` to `'deluxe-claude'` and calling `updateAgentUI()` updates the badge label to "Sonnet 4.6 · $$" with amber background
**And** changing `VA_MODE` to `'deluxe-xai'` updates to "xAI Grok · $$" with amber
**And** changing to `'deluxe-openai'` updates to "OpenAI Realtime · $$$" with red
**And** all existing flows that called `updateAgentUI()` (plan/mode discovery, voice-command switch, connect/disconnect) continue to work as before — orb pulse, button label, status text unchanged
**And** the regression test list for existing voice-command mode switching (Story 0.9) still passes

### Story 1.5: Wire dispatchIntent voice-command switches through vmodeFsm

As a **PTT-mode user**,
I want **my voice command "switch to Sonnet" (or "use xAI", or "change to OpenAI") to flow through the FSM and produce a telemetry event with `source: 'voice-command'`**,
So that **the operator's bake-off analytics correctly attribute voice-command-driven switches**.

**Acceptance Criteria:**

**Given** the existing `dispatchIntent()` regex match block (around `index.html:2396-2410`) that recognizes mode-switch voice commands
**When** the regex matches successfully
**Then** the existing code path that sets `VA_MODE = agentSwitch` is preserved (so voice-command behavior is unchanged from the user's perspective per FR6)
**And** a new call is added: `vmodeFsm.transition('voice_command_match', { mode_id: agentSwitch, source: 'voice-command' })` immediately after the `VA_MODE` set and before the existing `await ptSpeak(...)` reply
**And** the FSM transition handler logs `[vmode-fsm] idle → idle (voice_command_match, source=voice-command, mode={agentSwitch})`
**And** calling `announceVoiceMode(...)` is invoked with the format *"Switched to {newMode}, {tier} tier."* per NFR19
**And** for the four legal voice-command-recognized mode names (Haiku 4.5, Sonnet 4.6, xAI, OpenAI), the FSM transitions and the badge updates correctly
**And** the existing `ptSpeak('Switched to ${label}.')` voice reply continues to fire (no regression)

### Story 1.6: Telemetry schema extension for mode_switch event_type

As a **operator (BMad) preparing for the realtime bake-off**,
I want **the `usage_logs` table to support a `mode_switch` event_type with structured fields**,
So that **subsequent epics can write mode-switch telemetry rows without further schema work**.

**Acceptance Criteria:**

**Given** the existing `usage_logs` table in DynamoDB and SQLite (per `db.js:53`)
**When** the schema extension lands
**Then** in DynamoDB, no migration is needed (flexible attribute schema); a new helper `db.recordVoiceModeSwitch(userId, params)` writes a row with `event_type: 'mode_switch'`, plus `mode_from`, `mode_to`, `source` (`'ui' | 'mcp' | 'voice-command' | 'ui-retry' | 'system'`), `outcome` (`'success' | 'failure' | 'rollback' | 'auto-finalized'`), `duration_ms`, `error_class` (nullable)
**And** in SQLite, the `usage_logs` CREATE TABLE statement in `db.js initSqlite()` is extended to include columns for the new fields (with `IF NOT EXISTS` or `ALTER TABLE ADD COLUMN` idempotent pattern)
**And** calling `db.recordVoiceModeSwitch('user-phone-123', { mode_from: 'llm', mode_to: 'deluxe-claude', source: 'voice-command', outcome: 'success', duration_ms: 0 })` writes a single row visible on next query
**And** the recordVoiceModeSwitch call is invoked from the FSM transition handler in Story 1.5 (so voice-command switches start producing telemetry immediately)
**And** existing reads/writes of `usage_logs` for other event types (e.g. `'claude_chat'`) are unaffected

---

## Epic 2: The Escape

One-tap exit from any mode, with state preservation and clean teardown. The hero feature.

### Story 2.1: Build vmode-sheet, vmode-row, vmode-row-chip, vmode-section-label components (sheet opens, no row selection yet)

As a **test12 user**,
I want **tapping the badge to open a sheet (mobile) or popover (desktop) showing all 4 modes grouped by family**,
So that **I can see my options laid out clearly**.

**Acceptance Criteria:**

**Given** the badge from Epic 1
**When** I tap the badge
**Then** on mobile (<768px), a bottom sheet slides up from the bottom over ~250ms ease-out (motion-safe gated; instant for reduced-motion)
**And** on desktop (≥768px), a popover anchored below-right of the badge fades in over ~150ms
**And** the sheet contains: drag handle (mobile only), "Voice Mode" title (`<h2>`), `vmode-section-label` "PTT" header, two `vmode-row` cards (Haiku 4.5 and Sonnet 4.6), `vmode-section-label` "REALTIME" header, two `vmode-row` cards (xAI Grok and OpenAI Realtime), Cancel button (mobile only)
**And** each `vmode-row` shows mode icon + name + caption + `vmode-row-chip` (Free / $$ / $$$ — text and color)
**And** the currently-active mode's row has `aria-current="true"` and `bg-overlay-teal-faint` background with "✓ Current" marker in caption
**And** the sheet is a native `<dialog>` element with `aria-labelledby` to the "Voice Mode" title
**And** Esc dismisses; backdrop tap dismisses (mobile only — desktop has click-outside)
**And** Cancel button dismisses
**And** the badge's `aria-expanded` toggles between `false` and `true` based on sheet state
**And** Row tap does nothing yet (handler comes in Story 2.6) — rows show tap-flash visual feedback only

### Story 2.2: Add addon_sessions.last_heartbeat schema attribute

As a **system maintaining session-correctness under client-direct WS architecture**,
I want **`addon_sessions` rows to track a `last_heartbeat` timestamp**,
So that **stale rows whose client closed without notifying can be auto-finalized**.

**Acceptance Criteria:**

**Given** the existing `addon_sessions` table in DynamoDB and SQLite (per `db.js:66`)
**When** the schema is extended
**Then** in DynamoDB, no migration is needed; the new attribute is written on each heartbeat
**And** in SQLite, the `addon_sessions` CREATE TABLE statement is extended to include `last_heartbeat TEXT` (NULL by default for existing rows)
**And** a `db.recordHeartbeat(userId, sessionId)` helper sets `last_heartbeat` to the current ISO 8601 timestamp on the row
**And** calling `db.recordHeartbeat(...)` returns successfully whether or not the row already had a previous heartbeat

### Story 2.3: POST /api/voice-mode/heartbeat endpoint

As a **test12 client in an active realtime session**,
I want **a server endpoint to receive my heartbeats**,
So that **the server knows my session is still alive and can avoid auto-finalizing my row**.

**Acceptance Criteria:**

**Given** the new `db.recordHeartbeat()` helper from Story 2.2
**When** `POST /api/voice-mode/heartbeat` is registered in `app.js`
**Then** the endpoint requires `requireAuth` middleware (per A2)
**And** the request body accepts `{ mode_id }` (the mode currently active, for cross-check)
**And** on success, the endpoint returns `{ ok: true }` with HTTP 200 in under 100 ms
**And** on auth failure, returns 401 per existing pattern
**And** the endpoint never blocks; if the underlying `db.recordHeartbeat()` fails, the endpoint logs the error and still returns 200 (heartbeat is fire-and-forget for the client per NFR6)

### Story 2.4: db.autoFinalizeStaleHeartbeats lazy-check

As a **system enforcing NFR11 (zero phantom billing) under client-direct WS**,
I want **stale `addon_sessions` rows auto-finalized when read**,
So that **a row whose client died without notifying gets cleaned up within ~30 seconds**.

**Acceptance Criteria:**

**Given** the heartbeat-writing logic from Stories 2.2 and 2.3
**When** any `addon_sessions` read function in `db.js` is called (`db.getAddonSession()`, `db.getCurrentVoiceModeState()`, `db.getVoiceModeStats()`)
**Then** the function first calls a new helper `db.autoFinalizeStaleHeartbeats()` which scans for rows where `ended_at IS NULL AND last_heartbeat < (now - 30s)`
**And** each such row gets `ended_at = last_heartbeat`, `duration_secs` computed as `last_heartbeat - started_at`, and a telemetry row written with `source: 'system'`, `outcome: 'auto-finalized'`
**And** the lazy-check completes in under 50 ms typical (single index scan in DynamoDB)
**And** rows without any `last_heartbeat` (NULL — never started receiving heartbeats) are eligible for cleanup only after `started_at + 30s` has passed
**And** after auto-finalization, the original calling read function returns up-to-date data

### Story 2.5: db.finalizeAddonSession + POST /api/voice-mode/end-session endpoint

As a **test12 client exiting a realtime mode**,
I want **a server endpoint to finalize my billing row when I close the WS**,
So that **my addon-minute meter halts at the moment of WS close**.

**Acceptance Criteria:**

**Given** the existing `addon_sessions` schema with `last_heartbeat` (Story 2.2)
**When** `POST /api/voice-mode/end-session` is registered in `app.js` and `db.finalizeAddonSession(userId, wsCloseTimestamp)` is added to `db.js`
**Then** the endpoint requires `requireAuth`
**And** the body accepts `{ mode_id, ws_close_timestamp }` (ISO 8601)
**And** on call, `db.finalizeAddonSession` sets `ended_at = ws_close_timestamp` and computes `duration_secs` for the user's open `addon_sessions` row matching `mode_id`
**And** `db.recordVoiceModeSwitch(userId, { mode_from: mode_id, mode_to: <pending or null>, source: <pending; populated by Story 2.6's caller>, outcome: 'success', duration_ms: <pending> })` is also called within the same handler
**And** the endpoint responds `{ ok: true }` in under 500 ms (per NFR3)
**And** if no open row exists (e.g. already finalized by heartbeat cleanup), the endpoint returns 200 with `{ ok: true, note: 'already finalized' }` (idempotent)
**And** server-side errors (DB unavailable) return 500 with `{ error: '...' }` per existing pattern

### Story 2.6: Wire row tap → FSM transition → teardown → mode flip (the actual switching!)

As a **test12 user**,
I want **tapping a different mode in the sheet to actually switch my voice mode**,
So that **I can escape a paid mode in two taps (badge → row)**.

**Acceptance Criteria:**

**Given** the components from Story 2.1 and the server endpoint from Story 2.5
**When** I tap a `vmode-row` for a mode different from my current one
**Then** the row briefly flashes (`bg-overlay-teal-medium` for ~150 ms)
**And** the sheet dismisses (fade-out ~100ms; instant for reduced-motion)
**And** the FSM transitions: `idle → switching`
**And** the badge enters transition state: text reads "Switching…", opacity dimmed to `60%`, pointer-events disabled
**And** if current mode is realtime: client closes `rtWs` (`rtWs.close()`), calls `MediaStreamTrack.stop()` on the mic track, calls `AudioContext.close()` on `rtAudioCtx`
**And** client calls `POST /api/voice-mode/end-session` with `{ mode_id: oldMode, ws_close_timestamp: <now ISO 8601> }`
**And** on success (200), `VA_MODE` flips to the new mode, `updateAgentUI()` is called (which calls `renderVoiceModeBadge()` per Story 1.4), badge updates to new mode/color at full opacity, FSM transitions to `idle`
**And** `db.recordVoiceModeSwitch` is called server-side with `source: 'ui'`, `outcome: 'success'`, `duration_ms: <measured>`
**And** the end-to-end UI feedback completes in ≤500 ms p95 per NFR1
**And** the user's draft text in the compose box, scroll position, and any conversational state (e.g. mid-confirmation flag) are unchanged across the switch (FR13-FR15)
**And** if the new mode is also realtime, the user must tap "Connect" again — this story does NOT auto-establish the new realtime WS

### Story 2.7: Heartbeat emitter — every 10s while realtime WS is active

As a **system tracking realtime session liveness under client-direct WS**,
I want **the client to emit heartbeats every 10 seconds while a realtime WS is active**,
So that **server-side `last_heartbeat` stays fresh and stale-session cleanup only fires when the client truly dies**.

**Acceptance Criteria:**

**Given** the existing realtime-WS connect logic around `index.html:2664-2730` and the heartbeat endpoint from Story 2.3
**When** `rtWs` is in OPEN state (after `rtWs.onopen` fires)
**Then** a `setInterval` timer (stored in a module-scoped `vmodeHeartbeatTimer`) fires every `HEARTBEAT_INTERVAL_MS = 10000` and calls `fetch('/api/voice-mode/heartbeat', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ mode_id: VA_MODE }) })`
**And** the heartbeat is fire-and-forget — failures are logged via `console.warn('[vmode-heartbeat] failed:', err)` but do not interrupt the user
**And** the timer is cleared (`clearInterval(vmodeHeartbeatTimer)`) when the WS closes (either user-initiated via Story 2.6 teardown OR unexpected close)
**And** the timer is also cleared if the FSM transitions to `failed` state
**And** no heartbeat is emitted while in a PTT mode (where no realtime WS exists)

### Story 2.8: Build vmode-toast component with retry behavior

As a **test12 user whose mode-switch attempt failed**,
I want **a clear toast notification telling me what happened and offering Try Again / Refresh actions**,
So that **I'm informed without being blocked and can take action**.

**Acceptance Criteria:**

**Given** the FSM from prior stories and the teardown choreography from Story 2.6
**When** any step of teardown fails (network error, server 500, retries exhausted)
**Then** the FSM transitions: `switching → failed`
**And** `VA_MODE` rolls back to the original mode (the WS may still be closed client-side; this is the known weakening per architecture's NFR14 interpretation)
**And** the badge returns to the old mode at full opacity
**And** a `vmode-toast` appears at the top of the viewport, sliding down over ~200ms
**And** the toast contains: text *"Switch failed. You're still in {OldMode}."*, [Try again] button, [Refresh] link, [×] dismiss button
**And** the toast has `role="status"` (implicit `aria-live="polite"`); ARIA live region also announces *"Switch failed. Voice mode is still {OldMode}."*
**And** the toast auto-dismisses after 8 seconds (pauses on hover on desktop)
**And** [Try again] re-triggers the originally-attempted switch with `source: 'ui-retry'` (so retry attempts are distinguishable in telemetry)
**And** [Refresh] reloads the page
**And** [×] dismisses immediately
**And** the toast background is amber-tinted, not red (informational, not alarming, per UX spec)

### Story 2.9: ARIA announcements on successful switch

As a **screen-reader user switching voice modes via the UI**,
I want **a clear announcement of the new mode and any closed realtime session**,
So that **I know the switch completed and what state I'm now in**.

**Acceptance Criteria:**

**Given** the successful-switch path from Story 2.6 and the ARIA live region from Story 1.2
**When** a UI-initiated mode switch completes successfully
**Then** `announceVoiceMode()` is called within 100ms of the badge updating to the new mode
**And** the announcement format is *"Switched to {newMode}, {tier} tier. {Old realtime session, if any} closed."* — e.g. *"Switched to Haiku 4.5, Standard tier. OpenAI Realtime session closed."*
**And** if the old mode was a PTT mode (not realtime), the "session closed" clause is omitted — e.g. *"Switched to Sonnet 4.6, Deluxe-Claude tier."*
**And** the announcement fires regardless of whether the user is sighted (it does not duplicate any visible toast or status text)
**And** the announcement is verified working on iOS Safari VoiceOver

### Story 2.10: Keyboard navigation + reduced-motion support for the sheet

As a **keyboard-only user or reduced-motion user**,
I want **the sheet to be fully operable via keyboard and to respect my motion preferences**,
So that **the switcher is accessible regardless of input device or motion sensitivity**.

**Acceptance Criteria:**

**Given** the sheet from Story 2.1
**When** I navigate using only the keyboard
**Then** Tab on the badge opens the sheet (same effect as a tap)
**And** focus moves into the sheet to the first focusable element (the first `vmode-row`)
**And** Tab / Shift+Tab cycles among the row `<button>`s and the Cancel button (mobile)
**And** Enter or Space on a row triggers the same FSM transition as a tap
**And** Esc dismisses the sheet without changing the mode and returns focus to the badge
**And** Arrow Up / Arrow Down also moves focus among rows (matching iOS Settings convention)
**And** when `prefers-reduced-motion: reduce` is set, the sheet appears/dismisses instantly (no slide or fade animation), the tap-flash is shortened to 50ms, and the badge transition-state opacity change is instant (no animation curve)
**And** all interactive elements (badge, rows, Cancel button, toast actions) show a 2px teal focus ring on `focus-visible`

### Story 2.11: Full regression pass on existing flows

As a **test12 user**,
I want **every existing voice flow to continue working identically after Epic 2 ships**,
So that **I get the new escape capability without losing anything I rely on**.

**Acceptance Criteria:**

**Given** Stories 2.1-2.10 are complete
**When** the operator runs through the full regression test list manually
**Then** posting a voice post in public feed works identically (PTT mode)
**And** replying to a post in public feed works identically
**And** creating/joining/sending in private channels works identically
**And** voice-command mode switching from PTT (Story 1.5 flow) continues to work AND now also opens the badge update behavior correctly
**And** the existing Connect / Disconnect buttons for realtime modes work identically — entering and exiting realtime via the legacy path still functions
**And** auto-read narration works identically
**And** sign-in / sign-out works identically
**And** PWA install flow works identically
**And** addon-usage-bars at the bottom of the page continue to update correctly
**And** axe-core / Lighthouse audit returns zero serious/critical violations introduced by the new vmode-* code
**And** screen-reader matrix (iOS VoiceOver, macOS VoiceOver, Android TalkBack, Windows NVDA) verified on Flow 1 (the escape) from UX spec

---

## Epic 3: Trust-Preserving Mid-Flight Switches

A user attempting to switch mode while audio is recording or streaming gets a named confirmation before losing work.

### Story 3.1: Build vmode-confirm-modal component

As a **test12 user about to discard in-progress work**,
I want **a clear, named confirmation modal**,
So that **I know exactly what I'll lose before I confirm**.

**Acceptance Criteria:**

**Given** Epic 2 is complete (switching flow operational)
**When** the `vmode-confirm-modal` is rendered
**Then** the modal is a native `<dialog role="alertdialog">` element, centered in viewport with a 50% black backdrop
**And** the body copy template is *"Switching to {newMode} will discard your current {oldMode} recording. Continue?"* with placeholders filled at render time
**And** two buttons render: `[Stay]` (secondary, left, neutral background) and `[Switch]` (primary, right, teal background)
**And** on open, focus moves to `[Stay]` (the safer default) per the architecture's defensive-UX principle
**And** Esc dismisses with implicit `[Stay]`
**And** backdrop tap does NOT dismiss (intentional friction — the one exception to the universal "outside-click closes" pattern)
**And** modal animations respect `prefers-reduced-motion` (instant fade-in for reduced motion)
**And** `aria-labelledby` points to the modal's heading text
**And** the modal does not render when not needed (no `display:none` ghost; conditional render)

### Story 3.2: Wire audio-in-progress detection into FSM

As a **system protecting users from accidental work loss**,
I want **the FSM to detect when audio is in progress at the moment of a switch attempt**,
So that **mid-flight switches can trigger the confirmation modal**.

**Acceptance Criteria:**

**Given** the existing `rtIsConnected` global from `index.html:2664-2730` and the FSM from Epic 2
**When** a row-tapped transition fires (`vmodeFsm.transition('row_tapped', { mode_id, source: 'ui' })`)
**Then** the FSM checks for audio in progress in this order:
**And** if current mode is realtime (`'deluxe-xai'` or `'deluxe-openai'`) AND `rtIsConnected === true` → audio-in-progress = TRUE
**And** if current mode is PTT AND the user is in active recording (mic indicator visible / `MediaRecorder.state === 'recording'`) → audio-in-progress = TRUE
**And** if neither: audio-in-progress = FALSE; FSM proceeds directly to `switching` state per Epic 2 Story 2.6 (no behavior change)
**And** if audio-in-progress = TRUE: FSM transitions to `mid_flight_modal` state, modal renders with old and new mode names
**And** the audio-in-progress detection completes synchronously (no async checks blocking the row-tap response)

### Story 3.3: Integrate modal Switch/Stay into FSM transition flow

As a **test12 user at the mid-flight confirmation**,
I want **Stay to silently return me to my recording and Switch to proceed with full teardown**,
So that **the modal is a meaningful safety net, not a friction**.

**Acceptance Criteria:**

**Given** the modal from Story 3.1 and the detection from Story 3.2
**When** the modal is open and user taps `[Stay]`
**Then** FSM transitions: `mid_flight_modal → idle`; modal dismisses; sheet does NOT reopen; user remains in the original mode with the recording continuing exactly as before; no telemetry row is written (no action taken)
**When** user taps `[Switch]`
**Then** FSM transitions: `mid_flight_modal → switching`; modal dismisses; the in-progress audio is discarded (for realtime: `rtWs.close()`; for PTT: any active `MediaRecorder.stop()`); teardown choreography from Epic 2 Story 2.6 proceeds normally
**And** the resulting telemetry row tagged with `outcome: 'success'` per Epic 2 includes an additional flag `mid_flight_discard: true` so operator analytics can distinguish clean switches from mid-flight switches
**And** the ARIA live announcement (per Story 2.9) is extended: *"Switched to {newMode}, {tier} tier. {Old session, if any} closed. In-progress recording discarded."*
**And** if `prefers-reduced-motion: reduce`, the modal fade is instant

---

## Epic 4: Agent-Driven Mode Control

Connected MCP agents (Claude, Grok, etc.) can switch the user's voice mode on behalf of the user. The escape works from voice assistants too.

### Story 4.1: SEC1 pre-flight verification of ephemeral token hygiene

As a **operator deploying agent-driven mode control**,
I want **the existing `/api/session` and `/api/openai-session` endpoints verified for ephemeral token TTL and per-user scoping**,
So that **expanding the MCP surface doesn't expand the leaked-token attack surface**.

**Acceptance Criteria:**

**Given** the existing token-minting endpoints in `app.js`
**When** code review of these endpoints completes
**Then** a brief written verification (in PR description or a new section of `architecture.md`) documents:
**And** current ephemeral token TTL on each endpoint (in seconds)
**And** whether tokens are scoped per-user (via the provider's `user` field or equivalent)
**And** whether the endpoints themselves are rate-limited per user
**And** if TTL is >5 minutes, this story includes a code change tightening it to ≤90 seconds
**And** if tokens are not per-user-scoped, this story includes a code change adding the authenticated user's ID as the provider's `user` field
**And** if rate-limiting is missing, this story includes a per-user rate limit of ~5 token requests per minute
**And** post-verification, both endpoints are confirmed to mint short-TTL, per-user-scoped, rate-limited tokens

### Story 4.2: Desired-mode bridge data layer

As a **system bridging MCP agent intent to client action under polling-based push**,
I want **a transient per-user "desired mode" record in DynamoDB with TTL**,
So that **MCP-driven mode changes can be picked up by the client on next poll**.

**Acceptance Criteria:**

**Given** the existing `test12-data` DynamoDB table
**When** new helpers are added to `db.js`
**Then** `db.setDesiredMode(userId, modeId)` writes/updates a record with `last_set_at` (ISO 8601) and TTL ~60 seconds (using DynamoDB native TTL)
**And** `db.getDesiredMode(userId)` returns the record if present, or `null`
**And** `db.clearDesiredMode(userId)` deletes the record explicitly (called after client picks up)
**And** `db.getCurrentVoiceModeState(userId)` returns `{ current: { mode_id, mode_name, family, cost_tier, tier_label }, desired: <similar or null>, version: <ISO 8601 timestamp> }`
**And** the `current` mode is derived from the user's most recent open `addon_sessions` row (if realtime) or defaults to `'llm'` (free PTT) if no open paid session
**And** TTL'd records auto-expire from DynamoDB without manual cleanup needed

### Story 4.3: GET /api/voice-mode endpoint

As a **test12 client polling for MCP-driven mode changes**,
I want **a single endpoint to read my current and pending desired mode**,
So that **I can detect when an MCP agent has requested a switch**.

**Acceptance Criteria:**

**Given** the data layer from Story 4.2
**When** `GET /api/voice-mode` is registered in `app.js`
**Then** the endpoint requires `requireAuth` (per A2)
**And** the response shape is `{ current: { mode_id, mode_name, family, cost_tier, tier_label }, desired: { mode_id, ... } | null, version: <ISO 8601> }` per architecture's mode-state JSON shape
**And** the response includes an `ETag` header equal to the `version` field, so subsequent polls can use `If-None-Match` for cheap 304s when nothing has changed
**And** the endpoint internally invokes `db.autoFinalizeStaleHeartbeats()` per Story 2.4 (lazy-check pattern)
**And** the endpoint responds in under 100ms typical, well within the budget

### Story 4.4: Register switch_to_ptt, get_voice_mode, set_voice_mode MCP tools

As a **MCP agent acting on behalf of a user**,
I want **three MCP tools to query and change the user's voice mode**,
So that **users can ask me to switch them out of paid modes by voice**.

**Acceptance Criteria:**

**Given** the existing `mcp-tools.js` registry pattern
**When** three new `server.tool(...)` registrations are added
**Then** `const VOICE_MODE_IDS = Object.freeze(['llm', 'deluxe-claude', 'deluxe-xai', 'deluxe-openai'])` is declared at the top of `mcp-tools.js` (per AR11)
**And** `get_voice_mode` takes no parameters and returns the same shape as `GET /api/voice-mode` for the authenticated user
**And** `set_voice_mode` takes `{ mode_id: <one of VOICE_MODE_IDS> }`, writes a desired-mode bridge record via `db.setDesiredMode`, and returns `{ ok: true, status: 'requested', previous_mode_id, requested_mode_id, message: 'Mode switch requested, will complete on next client sync.' }`
**And** if `set_voice_mode` is called with the user's current mode (no-op case), it returns `{ ok: true, status: 'completed', previous_mode_id, requested_mode_id, message: 'Already on requested mode.' }` WITHOUT writing a bridge record or telemetry row
**And** `switch_to_ptt` takes no parameters and is exactly equivalent to `set_voice_mode({ mode_id: 'llm' })`
**And** all three tools use per-user auth via existing MCP middleware (per NFR7/A1)
**And** an authenticated agent for User A calling `set_voice_mode` cannot affect User B's mode (per NFR8 — cross-user isolation enforced)
**And** tool descriptions follow existing snake_case + clear language convention so other tool catalogs can discover them
**And** tools are registered in BOTH the stdio transport (`server.js`) and the HTTP transport (`mcp-http.js`) automatically since they share `mcp-tools.js`

### Story 4.5: Client polling loop with visibility-keyed cadence + MCP bridge pickup

As a **test12 user with an MCP agent connected**,
I want **the client to detect an agent-initiated mode switch within ~5 seconds while the tab is visible**,
So that **agent-driven escapes feel reasonably prompt**.

**Acceptance Criteria:**

**Given** the GET /api/voice-mode endpoint from Story 4.3 and the FSM from Epic 2
**When** the client polling loop is added to the vmode-* region
**Then** when `document.visibilityState === 'visible'`: a `setInterval` polls `GET /api/voice-mode` every `POLL_INTERVAL_ACTIVE_MS = 5000`
**And** when `document.visibilityState === 'hidden'`: polling cadence changes to `POLL_INTERVAL_BASELINE_MS = 30000`
**And** a `visibilitychange` event listener adjusts the interval immediately (clearInterval + setInterval with new value)
**And** polling uses `If-None-Match: <last ETag>` to take advantage of 304 responses (per Story 4.3)
**And** when the response contains a `desired` field that does not match `VA_MODE`: FSM transitions: `idle → switching` with `vmodeFsm.transition('mcp_bridge_picked_up', { mode_id: desired.mode_id, source: 'mcp' })`
**And** the resulting teardown choreography from Epic 2 Story 2.6 runs (rtWs.close, end-session POST, etc.)
**And** on successful completion, the client calls `POST /api/voice-mode/clear-desired` (or the end-session endpoint includes a `cleared_desired_mode: true` flag) — the bridge record is cleared so subsequent polls don't re-trigger
**And** the telemetry row written by Story 2.5 has `source: 'mcp'`
**And** if the new mode matches current mode (race condition where bridge was set after client already changed), the bridge is cleared without further action
**And** polling is paused when the FSM is in `switching` or `mid_flight_modal` states (avoid duplicate triggers)
**And** polling failures are logged but not surfaced as toasts (they're invisible to user per process pattern)

---

## Epic 5: Bake-Off Analytics

The operator can query mode-switch and session-duration data per voice mode and per realtime provider to inform the bake-off decision.

### Story 5.1: db.getVoiceModeStats aggregation helper

As a **operator (BMad) preparing for the realtime bake-off decision**,
I want **a server-side aggregation helper that crunches mode-switch and session data**,
So that **the operator analytics endpoint can serve pre-aggregated JSON**.

**Acceptance Criteria:**

**Given** the existing `usage_logs` (with mode_switch event rows from Epic 2) and `addon_sessions` tables
**When** `db.getVoiceModeStats(windowSpec)` is added to `db.js`
**Then** `windowSpec` accepts `{ start_iso, end_iso }` and defaults to "last 30 days" if omitted
**And** the function returns an object with:
**And** `per_mode` — for each of the 4 modes: total session count, average duration_secs, total duration_secs, total switch_in_count, total switch_out_count
**And** `per_realtime_provider` — for `'deluxe-xai'` and `'deluxe-openai'` only: session counts, re-entry rate (users who entered the realtime mode more than once in a session), escape-to-PTT rate (sessions ended via switch to PTT family while audio in progress, distinguished by `mid_flight_discard: true` flag from Epic 3)
**And** `per_source` — count of mode-switch events by `source` (`'ui'`, `'mcp'`, `'voice-command'`, `'ui-retry'`, `'system'`)
**And** `error_summary` — count of `outcome: 'failure'` events grouped by `error_class`
**And** the function completes in under 2 seconds for a 30-day window with up to 10K rows (acceptable for an admin-only periodic query)

### Story 5.2: GET /api/admin/voice-mode-stats endpoint with admin auth

As a **operator**,
I want **a single admin endpoint returning the bake-off analytics**,
So that **I can decide which realtime provider survives the bake-off**.

**Acceptance Criteria:**

**Given** the aggregation helper from Story 5.1 and the existing `ADMIN_SECRET_KEY` pattern (per `.env.example`)
**When** `GET /api/admin/voice-mode-stats` is registered in `app.js`
**Then** the endpoint requires `requireAdminAuth` middleware (using `ADMIN_SECRET_KEY` per existing pattern)
**And** query parameters `?start=<ISO 8601>&end=<ISO 8601>` are accepted; if omitted, defaults to last 30 days
**And** the response body is the JSON object returned by `db.getVoiceModeStats(...)`
**And** the endpoint logs every access via `console.log` (per the logging pattern) with the requesting source for audit
**And** unauthorized access returns 401 with `{ error: 'admin auth required' }`
**And** the endpoint is documented in a top-of-`app.js` comment block (matching existing endpoint-banner pattern)

---

## Epic 6: Companion Fix — Sonnet 4.5/4.6 Model ID (Optional)

Aligns the server-side Anthropic model request with the UI label.

### Story 6.1: Fix Sonnet 4.5/4.6 model ID mismatch in app.js

As a **Deluxe-Claude tier user**,
I want **the server to actually request the Sonnet 4.6 model that the UI promises me**,
So that **I receive the inference quality I'm being told I'm getting**.

**Acceptance Criteria:**

**Given** `app.js:1171` currently `const model = isDeluxeClaude ? 'claude-sonnet-4-5' : CLAUDE_MODEL`
**When** this story merges
**Then** a new named constant `const CLAUDE_DELUXE_MODEL = 'claude-sonnet-4-6'` is declared near the existing `const CLAUDE_MODEL = 'claude-haiku-4-5'` line
**And** the model selection line becomes `const model = isDeluxeClaude ? CLAUDE_DELUXE_MODEL : CLAUDE_MODEL`
**And** `CLAUDE_INPUT_COST_PER_M` and `CLAUDE_OUTPUT_COST_PER_M` are reviewed; if Sonnet 4.6 pricing differs from Sonnet 4.5, the cost constants are updated to use the appropriate model-specific values (potentially via a small lookup map)
**And** an existing test of the `/api/claude-chat` flow on the Deluxe-Claude tier completes successfully and is verified to actually use Sonnet 4.6 (e.g., via Anthropic API response metadata)
**And** the GitHub issue draft at `.github/issue-drafts/sonnet-4-6-label-impl-mismatch.md` is filed as a real issue OR deleted (since this story closes the underlying gap)
**And** the existing `logUsage` call captures the model name correctly so cost tracking is accurate
