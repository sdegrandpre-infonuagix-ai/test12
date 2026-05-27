# Ralph Fix Plan

## Stories to Implement

### Foundation — Tailwind Migration (Precursor)
> Goal: Migrate test12's inline `<style>`-block CSS to Tailwind utility classes, with a proper PostCSS+CLI build step, preserving all existing brand tokens and user-visible appearance. This is the hard prerequisite for all switcher epics.

- [x] Story 0.1: Add Tailwind build pipeline
- [x] Story 0.2: Configure Tailwind theme with existing brand tokens
- [x] Story 0.3: Migrate header chrome to Tailwind utilities
- [x] Story 0.4: Migrate channels section to Tailwind utilities
- [x] Story 0.5: Migrate compose form, orb, and agent-card to Tailwind utilities
- [x] Story 0.6: Migrate auth modal, PWA banner, body background to Tailwind utilities
- [x] Story 0.7: Update sw.js to include dist/tailwind.css and bump CACHE_VERSION
- [x] Story 0.8: Update deploy scripts to invoke build:css
  > As a **developer deploying test12**
  > I want **`deploy.ps1` and `deploy-dev.ps1` to invoke `npm run build:css` before bundling**
  > So that **production deploys always include the latest Tailwind output**.
  > AC: Given `deploy.ps1` and `deploy-dev.ps1` in their current state, When these scripts are updated, Then each script invokes `npm run build:css` as one of the first steps (before any bundling/upload), And the script fails fast (non-zero exit) if `build:css` fails — preventing deploys with stale or missing CSS, And `public/dist/tailwind.css` is included in whatever bundling/upload step ships static assets to S3/CloudFront
  > Spec: specs/planning-artifacts/epics.md#story-0-8
- [ ] Story 0.9: Final regression pass on existing flows
  > As a **test12 user**
  > I want **every existing flow to work identically after migration**
  > So that **the Tailwind migration is invisible to me as a user**.
  > AC: Given Stories 0.1-0.8 are complete, When the operator runs through the regression test list manually, Then each of the following flows works identically to pre-migration state, on iPhone Safari, Android Chrome, and desktop Chrome/Safari/Firefox:, And post a voice post in public feed (PTT mode), And reply to a post in public feed, And create a private channel, And join a private channel by ID, And send a message in a private channel, And voice-command mode switching from within PTT (*"switch to Sonnet"*, *"use OpenAI"*, *"change to xAI"*), And auto-read narration in public feed, And sign in / sign out flow, And PWA install banner appears and install works, And the orb animation pulses correctly in `connecting` state, And typed-text fallback in the compose form works
  > Spec: specs/planning-artifacts/epics.md#story-0-9
- [ ] Story 0.10: Verify existing UI accessibility baseline (UX-DR17)
  > As a **test12 user with assistive needs**
  > I want **the existing header chrome and core flows to meet WCAG 2.1 AA before the switcher commits to AA**
  > So that **the new switcher doesn't inherit unfixable accessibility debt from its surrounding context**.
  > AC: Given the Tailwind migration is complete (Stories 0.1-0.9 done), When an accessibility audit runs against `public/index.html` post-migration, Then axe-core or Lighthouse accessibility audit returns zero serious/critical violations on the unauthenticated landing, And zero serious/critical violations on the authenticated public-feed view, And zero serious/critical violations on a private-channel view, And any AA-level findings (contrast, focus, ARIA) on existing header chrome are documented as either fixed-in-this-story or filed as separate followup issues, And the existing voice-flow UI (orb, connect/disconnect, compose) is verified working with VoiceOver on iOS and macOS
  > Spec: specs/planning-artifacts/epics.md#story-0-10
### Visible Mode Status
> Goal: The user always knows where they are. Badge in the header shows current mode + cost tier; voice-command switches in PTT update the badge.

- [ ] Story 1.1: Establish vmode-* code region in index.html with MODES config and FSM shell
  > As a **developer building the switcher**
  > I want **a clearly-marked code region in `index.html` containing the `MODES` config and an FSM shell with an `idle` state**
  > So that **all subsequent switcher work has a defined home and the boundary against existing code is explicit**.
  > AC: Given Epic 0 is complete (Tailwind in place), When the new region is added to `index.html`, Then a banner comment marks the region: `// ═══ Voice-Mode Switcher (PRD: voice-mode-switcher) ═══` etc., per architecture's pattern rule, And a `const MODES = Object.freeze([...])` array exists with one entry per mode (`'llm'`, `'deluxe-claude'`, `'deluxe-xai'`, `'deluxe-openai'`), each containing `mode_id`, `mode_name` (e.g. "Haiku 4.5"), `family` (`'ptt' | 'realtime'`), `cost_tier` (`'free' | 'paid' | 'premium'`), `tier_label` (`'Free' | '$$' | '$$$'`), `caption`, `icon` (emoji string per existing convention), And a `vmodeFsm` object exists with `state: 'idle'` and a `transition(event, payload)` method that logs every transition via `console.log('[vmode-fsm] …')` per the architecture's logging pattern, And the FSM region adds zero new files (per AR12), And no symbol outside this region is mutated (existing code unchanged)
  > Spec: specs/planning-artifacts/epics.md#story-1-1
- [ ] Story 1.2: Add vmode-aria-live region to header chrome
  > As a **screen-reader user**
  > I want **an ARIA live region in the header chrome that announces mode changes**
  > So that **I'm informed when the voice mode changes for any reason**.
  > AC: Given the header chrome in `index.html`, When a new element is added, Then `<div id="vmode-aria-live" aria-live="polite" aria-atomic="true" class="sr-only">` exists as a sibling of the existing `header-login-link` / `header-auth-btns`, And the element has `sr-only` Tailwind class (visually hidden but screen-reader-readable), And a helper function `announceVoiceMode(text)` in the vmode region updates the element's text content, And calling `announceVoiceMode('Switched to Haiku 4.5, Standard tier.')` produces the announcement on iOS Safari VoiceOver
  > Spec: specs/planning-artifacts/epics.md#story-1-2
- [ ] Story 1.3: Build vmode-badge component (display-only)
  > As a **test12 user**
  > I want **a header pill that shows my current voice mode and its cost tier**
  > So that **I can see at a glance which mode is active and what it costs me**.
  > AC: Given the existing header chrome and the MODES config from Story 1.1, When the `vmode-badge` is rendered, Then the badge appears in the header alongside `header-login-link` / `Profile` / `Sign out`, And the badge displays an icon + mode name + center-dot + cost-tier chip (e.g. "🎙️ Haiku · Free"), And the badge background color matches the cost tier: teal for `vmode-badge-free`, amber for `-paid`, red for `-premium`, And the cost-tier chip text uses literal "Free" / "$$" / "$$$" symbols (text-and-color redundancy per FR9), And the badge is a native `<button type="button">` with `aria-label="Voice mode: {modeName}, {tierName} tier. Tap to switch."` and `aria-expanded="false"` (placeholder; sheet wiring comes in Epic 2), And tap-target dimensions are ≥44 × 44 px (via padding) per existing iOS HIG convention, And focus-visible state applies a 2 px teal ring (`focus-visible:ring-2 focus-visible:ring-brand-teal`), And `active:scale-95` provides tactile feedback on tap, And the badge is hidden when no user is authenticated (matches existing `header-auth-btns` display logic), And for the four `MODES` entries, the badge renders correctly in all four variants on iPhone, iPad, and desktop
  > Spec: specs/planning-artifacts/epics.md#story-1-3
- [ ] Story 1.4: Hook badge render into updateAgentUI()
  > As a **test12 user**
  > I want **the badge to update whenever `VA_MODE` changes for any reason**
  > So that **the badge is never out-of-sync with the actual active mode**.
  > AC: Given the existing `updateAgentUI()` function in `index.html` (around line 2492) is called from multiple paths, When `updateAgentUI()` is extended, Then a single new line invokes `renderVoiceModeBadge()` at the end of `updateAgentUI()` (extend, don't replace — per FE3 / NFR12), And changing `VA_MODE` from `'llm'` to `'deluxe-claude'` and calling `updateAgentUI()` updates the badge label to "Sonnet 4.6 · $$" with amber background, And changing `VA_MODE` to `'deluxe-xai'` updates to "xAI Grok · $$" with amber, And changing to `'deluxe-openai'` updates to "OpenAI Realtime · $$$" with red, And all existing flows that called `updateAgentUI()` (plan/mode discovery, voice-command switch, connect/disconnect) continue to work as before — orb pulse, button label, status text unchanged, And the regression test list for existing voice-command mode switching (Story 0.9) still passes
  > Spec: specs/planning-artifacts/epics.md#story-1-4
- [ ] Story 1.5: Wire dispatchIntent voice-command switches through vmodeFsm
  > As a **PTT-mode user**
  > I want **my voice command "switch to Sonnet" (or "use xAI", or "change to OpenAI") to flow through the FSM and produce a telemetry event with `source: 'voice-command'`**
  > So that **the operator's bake-off analytics correctly attribute voice-command-driven switches**.
  > AC: Given the existing `dispatchIntent()` regex match block (around `index.html:2396-2410`) that recognizes mode-switch voice commands, When the regex matches successfully, Then the existing code path that sets `VA_MODE = agentSwitch` is preserved (so voice-command behavior is unchanged from the user's perspective per FR6), And a new call is added: `vmodeFsm.transition('voice_command_match', { mode_id: agentSwitch, source: 'voice-command' })` immediately after the `VA_MODE` set and before the existing `await ptSpeak(...)` reply, And the FSM transition handler logs `[vmode-fsm] idle → idle (voice_command_match, source=voice-command, mode={agentSwitch})`, And calling `announceVoiceMode(...)` is invoked with the format *"Switched to {newMode}, {tier} tier."* per NFR19, And for the four legal voice-command-recognized mode names (Haiku 4.5, Sonnet 4.6, xAI, OpenAI), the FSM transitions and the badge updates correctly, And the existing `ptSpeak('Switched to ${label}.')` voice reply continues to fire (no regression)
  > Spec: specs/planning-artifacts/epics.md#story-1-5
- [ ] Story 1.6: Telemetry schema extension for mode_switch event_type
  > As a **operator (BMad) preparing for the realtime bake-off**
  > I want **the `usage_logs` table to support a `mode_switch` event_type with structured fields**
  > So that **subsequent epics can write mode-switch telemetry rows without further schema work**.
  > AC: Given the existing `usage_logs` table in DynamoDB and SQLite (per `db.js:53`), When the schema extension lands, Then in DynamoDB, no migration is needed (flexible attribute schema); a new helper `db.recordVoiceModeSwitch(userId, params)` writes a row with `event_type: 'mode_switch'`, plus `mode_from`, `mode_to`, `source` (`'ui' | 'mcp' | 'voice-command' | 'ui-retry' | 'system'`), `outcome` (`'success' | 'failure' | 'rollback' | 'auto-finalized'`), `duration_ms`, `error_class` (nullable), And in SQLite, the `usage_logs` CREATE TABLE statement in `db.js initSqlite()` is extended to include columns for the new fields (with `IF NOT EXISTS` or `ALTER TABLE ADD COLUMN` idempotent pattern), And calling `db.recordVoiceModeSwitch('user-phone-123', { mode_from: 'llm', mode_to: 'deluxe-claude', source: 'voice-command', outcome: 'success', duration_ms: 0 })` writes a single row visible on next query, And the recordVoiceModeSwitch call is invoked from the FSM transition handler in Story 1.5 (so voice-command switches start producing telemetry immediately), And existing reads/writes of `usage_logs` for other event types (e.g. `'claude_chat'`) are unaffected
  > Spec: specs/planning-artifacts/epics.md#story-1-6
### The Escape
> Goal: One-tap exit from any mode, with state preservation and clean teardown. The hero feature.

- [ ] Story 2.1: Build vmode-sheet, vmode-row, vmode-row-chip, vmode-section-label components (sheet opens, no row selection yet)
  > As a **test12 user**
  > I want **tapping the badge to open a sheet (mobile) or popover (desktop) showing all 4 modes grouped by family**
  > So that **I can see my options laid out clearly**.
  > AC: Given the badge from Epic 1, When I tap the badge, Then on mobile (<768px), a bottom sheet slides up from the bottom over ~250ms ease-out (motion-safe gated; instant for reduced-motion), And on desktop (≥768px), a popover anchored below-right of the badge fades in over ~150ms, And the sheet contains: drag handle (mobile only), "Voice Mode" title (`<h2>`), `vmode-section-label` "PTT" header, two `vmode-row` cards (Haiku 4.5 and Sonnet 4.6), `vmode-section-label` "REALTIME" header, two `vmode-row` cards (xAI Grok and OpenAI Realtime), Cancel button (mobile only), And each `vmode-row` shows mode icon + name + caption + `vmode-row-chip` (Free / $$ / $$$ — text and color), And the currently-active mode's row has `aria-current="true"` and `bg-overlay-teal-faint` background with "✓ Current" marker in caption, And the sheet is a native `<dialog>` element with `aria-labelledby` to the "Voice Mode" title, And Esc dismisses; backdrop tap dismisses (mobile only — desktop has click-outside), And Cancel button dismisses, And the badge's `aria-expanded` toggles between `false` and `true` based on sheet state, And Row tap does nothing yet (handler comes in Story 2.6) — rows show tap-flash visual feedback only
  > Spec: specs/planning-artifacts/epics.md#story-2-1
- [ ] Story 2.2: Add addon_sessions.last_heartbeat schema attribute
  > As a **system maintaining session-correctness under client-direct WS architecture**
  > I want **`addon_sessions` rows to track a `last_heartbeat` timestamp**
  > So that **stale rows whose client closed without notifying can be auto-finalized**.
  > AC: Given the existing `addon_sessions` table in DynamoDB and SQLite (per `db.js:66`), When the schema is extended, Then in DynamoDB, no migration is needed; the new attribute is written on each heartbeat, And in SQLite, the `addon_sessions` CREATE TABLE statement is extended to include `last_heartbeat TEXT` (NULL by default for existing rows), And a `db.recordHeartbeat(userId, sessionId)` helper sets `last_heartbeat` to the current ISO 8601 timestamp on the row, And calling `db.recordHeartbeat(...)` returns successfully whether or not the row already had a previous heartbeat
  > Spec: specs/planning-artifacts/epics.md#story-2-2
- [ ] Story 2.3: POST /api/voice-mode/heartbeat endpoint
  > As a **test12 client in an active realtime session**
  > I want **a server endpoint to receive my heartbeats**
  > So that **the server knows my session is still alive and can avoid auto-finalizing my row**.
  > AC: Given the new `db.recordHeartbeat()` helper from Story 2.2, When `POST /api/voice-mode/heartbeat` is registered in `app.js`, Then the endpoint requires `requireAuth` middleware (per A2), And the request body accepts `{ mode_id }` (the mode currently active, for cross-check), And on success, the endpoint returns `{ ok: true }` with HTTP 200 in under 100 ms, And on auth failure, returns 401 per existing pattern, And the endpoint never blocks; if the underlying `db.recordHeartbeat()` fails, the endpoint logs the error and still returns 200 (heartbeat is fire-and-forget for the client per NFR6)
  > Spec: specs/planning-artifacts/epics.md#story-2-3
- [ ] Story 2.4: db.autoFinalizeStaleHeartbeats lazy-check
  > As a **system enforcing NFR11 (zero phantom billing) under client-direct WS**
  > I want **stale `addon_sessions` rows auto-finalized when read**
  > So that **a row whose client died without notifying gets cleaned up within ~30 seconds**.
  > AC: Given the heartbeat-writing logic from Stories 2.2 and 2.3, When any `addon_sessions` read function in `db.js` is called (`db.getAddonSession()`, `db.getCurrentVoiceModeState()`, `db.getVoiceModeStats()`), Then the function first calls a new helper `db.autoFinalizeStaleHeartbeats()` which scans for rows where `ended_at IS NULL AND last_heartbeat < (now - 30s)`, And each such row gets `ended_at = last_heartbeat`, `duration_secs` computed as `last_heartbeat - started_at`, and a telemetry row written with `source: 'system'`, `outcome: 'auto-finalized'`, And the lazy-check completes in under 50 ms typical (single index scan in DynamoDB), And rows without any `last_heartbeat` (NULL — never started receiving heartbeats) are eligible for cleanup only after `started_at + 30s` has passed, And after auto-finalization, the original calling read function returns up-to-date data
  > Spec: specs/planning-artifacts/epics.md#story-2-4
- [ ] Story 2.5: db.finalizeAddonSession + POST /api/voice-mode/end-session endpoint
  > As a **test12 client exiting a realtime mode**
  > I want **a server endpoint to finalize my billing row when I close the WS**
  > So that **my addon-minute meter halts at the moment of WS close**.
  > AC: Given the existing `addon_sessions` schema with `last_heartbeat` (Story 2.2), When `POST /api/voice-mode/end-session` is registered in `app.js` and `db.finalizeAddonSession(userId, wsCloseTimestamp)` is added to `db.js`, Then the endpoint requires `requireAuth`, And the body accepts `{ mode_id, ws_close_timestamp }` (ISO 8601), And on call, `db.finalizeAddonSession` sets `ended_at = ws_close_timestamp` and computes `duration_secs` for the user's open `addon_sessions` row matching `mode_id`, And `db.recordVoiceModeSwitch(userId, { mode_from: mode_id, mode_to: <pending or null>, source: <pending; populated by Story 2.6's caller>, outcome: 'success', duration_ms: <pending> })` is also called within the same handler, And the endpoint responds `{ ok: true }` in under 500 ms (per NFR3), And if no open row exists (e.g. already finalized by heartbeat cleanup), the endpoint returns 200 with `{ ok: true, note: 'already finalized' }` (idempotent), And server-side errors (DB unavailable) return 500 with `{ error: '...' }` per existing pattern
  > Spec: specs/planning-artifacts/epics.md#story-2-5
- [ ] Story 2.6: Wire row tap → FSM transition → teardown → mode flip (the actual switching!)
  > As a **test12 user**
  > I want **tapping a different mode in the sheet to actually switch my voice mode**
  > So that **I can escape a paid mode in two taps (badge → row)**.
  > AC: Given the components from Story 2.1 and the server endpoint from Story 2.5, When I tap a `vmode-row` for a mode different from my current one, Then the row briefly flashes (`bg-overlay-teal-medium` for ~150 ms), And the sheet dismisses (fade-out ~100ms; instant for reduced-motion), And the FSM transitions: `idle → switching`, And the badge enters transition state: text reads "Switching…", opacity dimmed to `60%`, pointer-events disabled, And if current mode is realtime: client closes `rtWs` (`rtWs.close()`), calls `MediaStreamTrack.stop()` on the mic track, calls `AudioContext.close()` on `rtAudioCtx`, And client calls `POST /api/voice-mode/end-session` with `{ mode_id: oldMode, ws_close_timestamp: <now ISO 8601> }`, And on success (200), `VA_MODE` flips to the new mode, `updateAgentUI()` is called (which calls `renderVoiceModeBadge()` per Story 1.4), badge updates to new mode/color at full opacity, FSM transitions to `idle`, And `db.recordVoiceModeSwitch` is called server-side with `source: 'ui'`, `outcome: 'success'`, `duration_ms: <measured>`, And the end-to-end UI feedback completes in ≤500 ms p95 per NFR1, And the user's draft text in the compose box, scroll position, and any conversational state (e.g. mid-confirmation flag) are unchanged across the switch (FR13-FR15), And if the new mode is also realtime, the user must tap "Connect" again — this story does NOT auto-establish the new realtime WS
  > Spec: specs/planning-artifacts/epics.md#story-2-6
- [ ] Story 2.7: Heartbeat emitter — every 10s while realtime WS is active
  > As a **system tracking realtime session liveness under client-direct WS**
  > I want **the client to emit heartbeats every 10 seconds while a realtime WS is active**
  > So that **server-side `last_heartbeat` stays fresh and stale-session cleanup only fires when the client truly dies**.
  > AC: Given the existing realtime-WS connect logic around `index.html:2664-2730` and the heartbeat endpoint from Story 2.3, When `rtWs` is in OPEN state (after `rtWs.onopen` fires), Then a `setInterval` timer (stored in a module-scoped `vmodeHeartbeatTimer`) fires every `HEARTBEAT_INTERVAL_MS = 10000` and calls `fetch('/api/voice-mode/heartbeat', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ mode_id: VA_MODE }) })`, And the heartbeat is fire-and-forget — failures are logged via `console.warn('[vmode-heartbeat] failed:', err)` but do not interrupt the user, And the timer is cleared (`clearInterval(vmodeHeartbeatTimer)`) when the WS closes (either user-initiated via Story 2.6 teardown OR unexpected close), And the timer is also cleared if the FSM transitions to `failed` state, And no heartbeat is emitted while in a PTT mode (where no realtime WS exists)
  > Spec: specs/planning-artifacts/epics.md#story-2-7
- [ ] Story 2.8: Build vmode-toast component with retry behavior
  > As a **test12 user whose mode-switch attempt failed**
  > I want **a clear toast notification telling me what happened and offering Try Again / Refresh actions**
  > So that **I'm informed without being blocked and can take action**.
  > AC: Given the FSM from prior stories and the teardown choreography from Story 2.6, When any step of teardown fails (network error, server 500, retries exhausted), Then the FSM transitions: `switching → failed`, And `VA_MODE` rolls back to the original mode (the WS may still be closed client-side; this is the known weakening per architecture's NFR14 interpretation), And the badge returns to the old mode at full opacity, And a `vmode-toast` appears at the top of the viewport, sliding down over ~200ms, And the toast contains: text *"Switch failed. You're still in {OldMode}."*, [Try again] button, [Refresh] link, [×] dismiss button, And the toast has `role="status"` (implicit `aria-live="polite"`); ARIA live region also announces *"Switch failed. Voice mode is still {OldMode}."*, And the toast auto-dismisses after 8 seconds (pauses on hover on desktop), And [Try again] re-triggers the originally-attempted switch with `source: 'ui-retry'` (so retry attempts are distinguishable in telemetry), And [Refresh] reloads the page, And [×] dismisses immediately, And the toast background is amber-tinted, not red (informational, not alarming, per UX spec)
  > Spec: specs/planning-artifacts/epics.md#story-2-8
- [ ] Story 2.9: ARIA announcements on successful switch
  > As a **screen-reader user switching voice modes via the UI**
  > I want **a clear announcement of the new mode and any closed realtime session**
  > So that **I know the switch completed and what state I'm now in**.
  > AC: Given the successful-switch path from Story 2.6 and the ARIA live region from Story 1.2, When a UI-initiated mode switch completes successfully, Then `announceVoiceMode()` is called within 100ms of the badge updating to the new mode, And the announcement format is *"Switched to {newMode}, {tier} tier. {Old realtime session, if any} closed."* — e.g. *"Switched to Haiku 4.5, Standard tier. OpenAI Realtime session closed."*, And if the old mode was a PTT mode (not realtime), the "session closed" clause is omitted — e.g. *"Switched to Sonnet 4.6, Deluxe-Claude tier."*, And the announcement fires regardless of whether the user is sighted (it does not duplicate any visible toast or status text), And the announcement is verified working on iOS Safari VoiceOver
  > Spec: specs/planning-artifacts/epics.md#story-2-9
- [ ] Story 2.10: Keyboard navigation + reduced-motion support for the sheet
  > As a **keyboard-only user or reduced-motion user**
  > I want **the sheet to be fully operable via keyboard and to respect my motion preferences**
  > So that **the switcher is accessible regardless of input device or motion sensitivity**.
  > AC: Given the sheet from Story 2.1, When I navigate using only the keyboard, Then Tab on the badge opens the sheet (same effect as a tap), And focus moves into the sheet to the first focusable element (the first `vmode-row`), And Tab / Shift+Tab cycles among the row `<button>`s and the Cancel button (mobile), And Enter or Space on a row triggers the same FSM transition as a tap, And Esc dismisses the sheet without changing the mode and returns focus to the badge, And Arrow Up / Arrow Down also moves focus among rows (matching iOS Settings convention), And when `prefers-reduced-motion: reduce` is set, the sheet appears/dismisses instantly (no slide or fade animation), the tap-flash is shortened to 50ms, and the badge transition-state opacity change is instant (no animation curve), And all interactive elements (badge, rows, Cancel button, toast actions) show a 2px teal focus ring on `focus-visible`
  > Spec: specs/planning-artifacts/epics.md#story-2-10
- [ ] Story 2.11: Full regression pass on existing flows
  > As a **test12 user**
  > I want **every existing voice flow to continue working identically after Epic 2 ships**
  > So that **I get the new escape capability without losing anything I rely on**.
  > AC: Given Stories 2.1-2.10 are complete, When the operator runs through the full regression test list manually, Then posting a voice post in public feed works identically (PTT mode), And replying to a post in public feed works identically, And creating/joining/sending in private channels works identically, And voice-command mode switching from PTT (Story 1.5 flow) continues to work AND now also opens the badge update behavior correctly, And the existing Connect / Disconnect buttons for realtime modes work identically — entering and exiting realtime via the legacy path still functions, And auto-read narration works identically, And sign-in / sign-out works identically, And PWA install flow works identically, And addon-usage-bars at the bottom of the page continue to update correctly, And axe-core / Lighthouse audit returns zero serious/critical violations introduced by the new vmode-* code, And screen-reader matrix (iOS VoiceOver, macOS VoiceOver, Android TalkBack, Windows NVDA) verified on Flow 1 (the escape) from UX spec
  > Spec: specs/planning-artifacts/epics.md#story-2-11
### Trust-Preserving Mid-Flight Switches
> Goal: A user attempting to switch mode while audio is recording or streaming gets a named confirmation before losing work.

- [ ] Story 3.1: Build vmode-confirm-modal component
  > As a **test12 user about to discard in-progress work**
  > I want **a clear, named confirmation modal**
  > So that **I know exactly what I'll lose before I confirm**.
  > AC: Given Epic 2 is complete (switching flow operational), When the `vmode-confirm-modal` is rendered, Then the modal is a native `<dialog role="alertdialog">` element, centered in viewport with a 50% black backdrop, And the body copy template is *"Switching to {newMode} will discard your current {oldMode} recording. Continue?"* with placeholders filled at render time, And two buttons render: `[Stay]` (secondary, left, neutral background) and `[Switch]` (primary, right, teal background), And on open, focus moves to `[Stay]` (the safer default) per the architecture's defensive-UX principle, And Esc dismisses with implicit `[Stay]`, And backdrop tap does NOT dismiss (intentional friction — the one exception to the universal "outside-click closes" pattern), And modal animations respect `prefers-reduced-motion` (instant fade-in for reduced motion), And `aria-labelledby` points to the modal's heading text, And the modal does not render when not needed (no `display:none` ghost; conditional render)
  > Spec: specs/planning-artifacts/epics.md#story-3-1
- [ ] Story 3.2: Wire audio-in-progress detection into FSM
  > As a **system protecting users from accidental work loss**
  > I want **the FSM to detect when audio is in progress at the moment of a switch attempt**
  > So that **mid-flight switches can trigger the confirmation modal**.
  > AC: Given the existing `rtIsConnected` global from `index.html:2664-2730` and the FSM from Epic 2, When a row-tapped transition fires (`vmodeFsm.transition('row_tapped', { mode_id, source: 'ui' })`), Then the FSM checks for audio in progress in this order:, And if current mode is realtime (`'deluxe-xai'` or `'deluxe-openai'`) AND `rtIsConnected === true` → audio-in-progress = TRUE, And if current mode is PTT AND the user is in active recording (mic indicator visible / `MediaRecorder.state === 'recording'`) → audio-in-progress = TRUE, And if neither: audio-in-progress = FALSE; FSM proceeds directly to `switching` state per Epic 2 Story 2.6 (no behavior change), And if audio-in-progress = TRUE: FSM transitions to `mid_flight_modal` state, modal renders with old and new mode names, And the audio-in-progress detection completes synchronously (no async checks blocking the row-tap response)
  > Spec: specs/planning-artifacts/epics.md#story-3-2
- [ ] Story 3.3: Integrate modal Switch/Stay into FSM transition flow
  > As a **test12 user at the mid-flight confirmation**
  > I want **Stay to silently return me to my recording and Switch to proceed with full teardown**
  > So that **the modal is a meaningful safety net, not a friction**.
  > AC: Given the modal from Story 3.1 and the detection from Story 3.2, When the modal is open and user taps `[Stay]`, Then FSM transitions: `mid_flight_modal → idle`; modal dismisses; sheet does NOT reopen; user remains in the original mode with the recording continuing exactly as before; no telemetry row is written (no action taken), When user taps `[Switch]`, Then FSM transitions: `mid_flight_modal → switching`; modal dismisses; the in-progress audio is discarded (for realtime: `rtWs.close()`; for PTT: any active `MediaRecorder.stop()`); teardown choreography from Epic 2 Story 2.6 proceeds normally, And the resulting telemetry row tagged with `outcome: 'success'` per Epic 2 includes an additional flag `mid_flight_discard: true` so operator analytics can distinguish clean switches from mid-flight switches, And the ARIA live announcement (per Story 2.9) is extended: *"Switched to {newMode}, {tier} tier. {Old session, if any} closed. In-progress recording discarded."*, And if `prefers-reduced-motion: reduce`, the modal fade is instant
  > Spec: specs/planning-artifacts/epics.md#story-3-3
### Agent-Driven Mode Control
> Goal: Connected MCP agents (Claude, Grok, etc.) can switch the user's voice mode on behalf of the user. The escape works from voice assistants too.

- [ ] Story 4.1: SEC1 pre-flight verification of ephemeral token hygiene
  > As a **operator deploying agent-driven mode control**
  > I want **the existing `/api/session` and `/api/openai-session` endpoints verified for ephemeral token TTL and per-user scoping**
  > So that **expanding the MCP surface doesn't expand the leaked-token attack surface**.
  > AC: Given the existing token-minting endpoints in `app.js`, When code review of these endpoints completes, Then a brief written verification (in PR description or a new section of `architecture.md`) documents:, And current ephemeral token TTL on each endpoint (in seconds), And whether tokens are scoped per-user (via the provider's `user` field or equivalent), And whether the endpoints themselves are rate-limited per user, And if TTL is >5 minutes, this story includes a code change tightening it to ≤90 seconds, And if tokens are not per-user-scoped, this story includes a code change adding the authenticated user's ID as the provider's `user` field, And if rate-limiting is missing, this story includes a per-user rate limit of ~5 token requests per minute, And post-verification, both endpoints are confirmed to mint short-TTL, per-user-scoped, rate-limited tokens
  > Spec: specs/planning-artifacts/epics.md#story-4-1
- [ ] Story 4.2: Desired-mode bridge data layer
  > As a **system bridging MCP agent intent to client action under polling-based push**
  > I want **a transient per-user "desired mode" record in DynamoDB with TTL**
  > So that **MCP-driven mode changes can be picked up by the client on next poll**.
  > AC: Given the existing `test12-data` DynamoDB table, When new helpers are added to `db.js`, Then `db.setDesiredMode(userId, modeId)` writes/updates a record with `last_set_at` (ISO 8601) and TTL ~60 seconds (using DynamoDB native TTL), And `db.getDesiredMode(userId)` returns the record if present, or `null`, And `db.clearDesiredMode(userId)` deletes the record explicitly (called after client picks up), And `db.getCurrentVoiceModeState(userId)` returns `{ current: { mode_id, mode_name, family, cost_tier, tier_label }, desired: <similar or null>, version: <ISO 8601 timestamp> }`, And the `current` mode is derived from the user's most recent open `addon_sessions` row (if realtime) or defaults to `'llm'` (free PTT) if no open paid session, And TTL'd records auto-expire from DynamoDB without manual cleanup needed
  > Spec: specs/planning-artifacts/epics.md#story-4-2
- [ ] Story 4.3: GET /api/voice-mode endpoint
  > As a **test12 client polling for MCP-driven mode changes**
  > I want **a single endpoint to read my current and pending desired mode**
  > So that **I can detect when an MCP agent has requested a switch**.
  > AC: Given the data layer from Story 4.2, When `GET /api/voice-mode` is registered in `app.js`, Then the endpoint requires `requireAuth` (per A2), And the response shape is `{ current: { mode_id, mode_name, family, cost_tier, tier_label }, desired: { mode_id, ... } | null, version: <ISO 8601> }` per architecture's mode-state JSON shape, And the response includes an `ETag` header equal to the `version` field, so subsequent polls can use `If-None-Match` for cheap 304s when nothing has changed, And the endpoint internally invokes `db.autoFinalizeStaleHeartbeats()` per Story 2.4 (lazy-check pattern), And the endpoint responds in under 100ms typical, well within the budget
  > Spec: specs/planning-artifacts/epics.md#story-4-3
- [ ] Story 4.4: Register switch_to_ptt, get_voice_mode, set_voice_mode MCP tools
  > As a **MCP agent acting on behalf of a user**
  > I want **three MCP tools to query and change the user's voice mode**
  > So that **users can ask me to switch them out of paid modes by voice**.
  > AC: Given the existing `mcp-tools.js` registry pattern, When three new `server.tool(...)` registrations are added, Then `const VOICE_MODE_IDS = Object.freeze(['llm', 'deluxe-claude', 'deluxe-xai', 'deluxe-openai'])` is declared at the top of `mcp-tools.js` (per AR11), And `get_voice_mode` takes no parameters and returns the same shape as `GET /api/voice-mode` for the authenticated user, And `set_voice_mode` takes `{ mode_id: <one of VOICE_MODE_IDS> }`, writes a desired-mode bridge record via `db.setDesiredMode`, and returns `{ ok: true, status: 'requested', previous_mode_id, requested_mode_id, message: 'Mode switch requested, will complete on next client sync.' }`, And if `set_voice_mode` is called with the user's current mode (no-op case), it returns `{ ok: true, status: 'completed', previous_mode_id, requested_mode_id, message: 'Already on requested mode.' }` WITHOUT writing a bridge record or telemetry row, And `switch_to_ptt` takes no parameters and is exactly equivalent to `set_voice_mode({ mode_id: 'llm' })`, And all three tools use per-user auth via existing MCP middleware (per NFR7/A1), And an authenticated agent for User A calling `set_voice_mode` cannot affect User B's mode (per NFR8 — cross-user isolation enforced), And tool descriptions follow existing snake_case + clear language convention so other tool catalogs can discover them, And tools are registered in BOTH the stdio transport (`server.js`) and the HTTP transport (`mcp-http.js`) automatically since they share `mcp-tools.js`
  > Spec: specs/planning-artifacts/epics.md#story-4-4
- [ ] Story 4.5: Client polling loop with visibility-keyed cadence + MCP bridge pickup
  > As a **test12 user with an MCP agent connected**
  > I want **the client to detect an agent-initiated mode switch within ~5 seconds while the tab is visible**
  > So that **agent-driven escapes feel reasonably prompt**.
  > AC: Given the GET /api/voice-mode endpoint from Story 4.3 and the FSM from Epic 2, When the client polling loop is added to the vmode-* region, Then when `document.visibilityState === 'visible'`: a `setInterval` polls `GET /api/voice-mode` every `POLL_INTERVAL_ACTIVE_MS = 5000`, And when `document.visibilityState === 'hidden'`: polling cadence changes to `POLL_INTERVAL_BASELINE_MS = 30000`, And a `visibilitychange` event listener adjusts the interval immediately (clearInterval + setInterval with new value), And polling uses `If-None-Match: <last ETag>` to take advantage of 304 responses (per Story 4.3), And when the response contains a `desired` field that does not match `VA_MODE`: FSM transitions: `idle → switching` with `vmodeFsm.transition('mcp_bridge_picked_up', { mode_id: desired.mode_id, source: 'mcp' })`, And the resulting teardown choreography from Epic 2 Story 2.6 runs (rtWs.close, end-session POST, etc.), And on successful completion, the client calls `POST /api/voice-mode/clear-desired` (or the end-session endpoint includes a `cleared_desired_mode: true` flag) — the bridge record is cleared so subsequent polls don't re-trigger, And the telemetry row written by Story 2.5 has `source: 'mcp'`, And if the new mode matches current mode (race condition where bridge was set after client already changed), the bridge is cleared without further action, And polling is paused when the FSM is in `switching` or `mid_flight_modal` states (avoid duplicate triggers), And polling failures are logged but not surfaced as toasts (they're invisible to user per process pattern)
  > Spec: specs/planning-artifacts/epics.md#story-4-5
### Bake-Off Analytics
> Goal: The operator can query mode-switch and session-duration data per voice mode and per realtime provider to inform the bake-off decision.

- [ ] Story 5.1: db.getVoiceModeStats aggregation helper
  > As a **operator (BMad) preparing for the realtime bake-off decision**
  > I want **a server-side aggregation helper that crunches mode-switch and session data**
  > So that **the operator analytics endpoint can serve pre-aggregated JSON**.
  > AC: Given the existing `usage_logs` (with mode_switch event rows from Epic 2) and `addon_sessions` tables, When `db.getVoiceModeStats(windowSpec)` is added to `db.js`, Then `windowSpec` accepts `{ start_iso, end_iso }` and defaults to "last 30 days" if omitted, And the function returns an object with:, And `per_mode` — for each of the 4 modes: total session count, average duration_secs, total duration_secs, total switch_in_count, total switch_out_count, And `per_realtime_provider` — for `'deluxe-xai'` and `'deluxe-openai'` only: session counts, re-entry rate (users who entered the realtime mode more than once in a session), escape-to-PTT rate (sessions ended via switch to PTT family while audio in progress, distinguished by `mid_flight_discard: true` flag from Epic 3), And `per_source` — count of mode-switch events by `source` (`'ui'`, `'mcp'`, `'voice-command'`, `'ui-retry'`, `'system'`), And `error_summary` — count of `outcome: 'failure'` events grouped by `error_class`, And the function completes in under 2 seconds for a 30-day window with up to 10K rows (acceptable for an admin-only periodic query)
  > Spec: specs/planning-artifacts/epics.md#story-5-1
- [ ] Story 5.2: GET /api/admin/voice-mode-stats endpoint with admin auth
  > As a **operator**
  > I want **a single admin endpoint returning the bake-off analytics**
  > So that **I can decide which realtime provider survives the bake-off**.
  > AC: Given the aggregation helper from Story 5.1 and the existing `ADMIN_SECRET_KEY` pattern (per `.env.example`), When `GET /api/admin/voice-mode-stats` is registered in `app.js`, Then the endpoint requires `requireAdminAuth` middleware (using `ADMIN_SECRET_KEY` per existing pattern), And query parameters `?start=<ISO 8601>&end=<ISO 8601>` are accepted; if omitted, defaults to last 30 days, And the response body is the JSON object returned by `db.getVoiceModeStats(...)`, And the endpoint logs every access via `console.log` (per the logging pattern) with the requesting source for audit, And unauthorized access returns 401 with `{ error: 'admin auth required' }`, And the endpoint is documented in a top-of-`app.js` comment block (matching existing endpoint-banner pattern)
  > Spec: specs/planning-artifacts/epics.md#story-5-2
### Companion Fix — Sonnet 4.5/4.6 Model ID (Optional)
> Goal: Aligns the server-side Anthropic model request with the UI label.

- [ ] Story 6.1: Fix Sonnet 4.5/4.6 model ID mismatch in app.js
  > As a **Deluxe-Claude tier user**
  > I want **the server to actually request the Sonnet 4.6 model that the UI promises me**
  > So that **I receive the inference quality I'm being told I'm getting**.
  > AC: Given `app.js:1171` currently `const model = isDeluxeClaude ? 'claude-sonnet-4-5' : CLAUDE_MODEL`, When this story merges, Then a new named constant `const CLAUDE_DELUXE_MODEL = 'claude-sonnet-4-6'` is declared near the existing `const CLAUDE_MODEL = 'claude-haiku-4-5'` line, And the model selection line becomes `const model = isDeluxeClaude ? CLAUDE_DELUXE_MODEL : CLAUDE_MODEL`, And `CLAUDE_INPUT_COST_PER_M` and `CLAUDE_OUTPUT_COST_PER_M` are reviewed; if Sonnet 4.6 pricing differs from Sonnet 4.5, the cost constants are updated to use the appropriate model-specific values (potentially via a small lookup map), And an existing test of the `/api/claude-chat` flow on the Deluxe-Claude tier completes successfully and is verified to actually use Sonnet 4.6 (e.g., via Anthropic API response metadata), And the GitHub issue draft at `.github/issue-drafts/sonnet-4-6-label-impl-mismatch.md` is filed as a real issue OR deleted (since this story closes the underlying gap), And the existing `logUsage` call captures the model name correctly so cost tracking is accurate
  > Spec: specs/planning-artifacts/epics.md#story-6-1

## Completed

## Notes
- Follow TDD methodology (red-green-refactor)
- One story per Ralph loop iteration
- Update this file after completing each story
