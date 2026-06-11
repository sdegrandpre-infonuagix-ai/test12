---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-02b-vision
  - step-02c-executive-summary
  - step-03-success
  - step-04-journeys
  - step-05-domain-skipped
  - step-06-innovation-skipped
  - step-07-project-type
  - step-08-scoping
  - step-09-functional
  - step-10-nonfunctional
  - step-11-polish
  - step-12-complete
inputDocuments:
  - path: 'README.md'
    type: 'project-context'
    note: 'Existing test12 app overview — used as background context, NOT as scope. PARTIALLY STALE: README still describes MySQL persistence (voice_post table) and xAI-Grok-only voice stack. Actual codebase uses DynamoDB primary + SQLite local fallback (better-sqlite3); has OpenAI Realtime + Anthropic Claude integrations; Stripe billing with Standard/Deluxe tiers; OAuth (Google, Apple); phone+OTP auth; usage metering and addon-minutes model. Trust the codebase, not the README, on tech-stack and feature surface.'
documentCounts:
  briefs: 0
  research: 0
  brainstorming: 0
  projectDocs: 1
workflowType: 'prd'
project_name: 'test12'
author: 'BMad'
date: '2026-05-27'
classification:
  projectType: 'web_app'
  domain: 'general'
  complexity: 'low'
  projectContext: 'brownfield'
  notes:
    - 'Domain complexity is low, but session-lifecycle / state-transition complexity is medium-high (clean teardown of streaming audio sessions)'
    - 'Carry-forward: trust-contract framing — switcher is more than a control; mode signaling + transition safety are first-class'
    - 'Carry-forward: cost-sensitive multi-modal product — segmentation matters for non-anglophone / international users'
    - 'Carry-forward: session-lifecycle correctness as NFR + defined transition matrix as functional requirement'
---

# Product Requirements Document - test12

**Author:** BMad
**Date:** 2026-05-27

## Executive Summary

test12 is a voice-first PWA (public threaded feed + private 1-on-1 channels,
installable on mobile, served as a single-page `index.html`) that offers four
voice modes today, organized into two families. The **PTT family** ("tap to
speak") dispatches the user's transcribed input through Claude — either
**Haiku 4.5** on the Standard tier (free baseline) or **Sonnet 4.6** on the
Deluxe-Claude tier (paid). The **realtime family** holds a persistent
streaming WebSocket open to a voice model — either **xAI `grok-voice-latest`**
on the Deluxe-xAI tier (paid; strongest non-English accent across 25
languages) or **OpenAI `gpt-realtime-2`** on the Deluxe-OpenAI tier (paid;
anglophone accent in non-English).

Mode switching today is asymmetric. **PTT modes already have voice-command
mode switching** — the in-app dispatcher (`dispatchIntent` in
`index.html`) recognizes phrases like *"switch to Sonnet"*, *"use xAI"*,
*"change to OpenAI"* and updates `VA_MODE` accordingly, so a PTT user can
voice-hop between all four modes. **But once in a realtime WS session**,
the user's voice no longer reaches the in-app dispatcher — it streams
directly to xAI or OpenAI — so the only ways out are the existing
mode-specific Disconnect button or a full page refresh. There is no global
UI control that exposes the current mode, its cost tier, or a one-tap
escape. A refresh destroys mid-reply context, scroll position, and any
in-progress voice flow. This is both a UX dead-end and a real billing
trap: realtime sessions consume Stripe-metered "Deluxe" addon minutes
from the user's account, so a user stuck in OpenAI Realtime is actively
burning a paid balance with no easy escape. The harm is sharpest for
non-anglophone users, who get the worst-quality output from the priciest
mode.

This PRD scopes a global, header-level voice-mode switcher that lets users
move freely among all four modes without page reload, with clean teardown of
any active realtime WebSocket session, preservation of in-flight state
(drafts, current conversational step, scroll), and transparent cost-tier
signaling on each mode. The switcher belongs in global chrome because the
mode is global to the SPA: it applies identically whether the user is
viewing the public feed or an active private channel (both are sections of
the same `index.html`, switched via in-page state, not routing).

This is the first move in a broader product direction — **the user, not the
vendor, controls the voice-AI dial.** Within the four modes, the **realtime
family is in a bake-off** (xAI `grok-voice-latest` vs OpenAI
`gpt-realtime-2`): eventually one realtime provider wins and the other gets
removed from the codebase, collapsing the lineup from four modes to three.
The **PTT family** (Haiku 4.5 Standard / Sonnet 4.6 Deluxe-Claude) is a
permanent tier distinction, not a bake-off. The underlying mode-switching
primitive is foundational and will outlive the realtime bake-off without
rework.

### What Makes This Special

Most voice and AI-assisted products commit the user to a single provider per
account or per session: you opt in once and the cost, accent, and language
coverage you get is whatever the vendor chose for you. test12 treats voice
mode as a **first-class, user-controlled dimension** — visible, switchable
per-session, and always with a free fallback (PTT) one tap away.

The core insight: realtime voice AI is finally cheap and capable enough to
multiplex, but the trade-offs (free vs paid, PTT vs persistent stream,
accent quality, language breadth, latency, model class) are deeply
user-specific and context-specific. A user posting a quick English status
is well served by free Haiku PTT; a user with the Deluxe-Claude tier may
prefer Sonnet PTT for richer interactions; a user replying in Spanish
wants xAI realtime's accent; a user accidentally on OpenAI realtime needs
to bail out before billing accumulates. The product's job is to put that
choice in front of the user and make it reversible — not to hide it.

The hero moment is **the escape**: a user accidentally trapped in a paid
realtime mode finds the switcher, taps once, lands back in free PTT with
their draft and conversational context intact. *"I'm not trapped."* That
moment of relief is the contract this feature ships.

## Project Classification

- **Project Type:** Single-page PWA (monolithic `public/index.html` ~164 KB
  served by Express; service worker `public/sw.js` for offline shell;
  iOS-tuned manifest with `display:standalone` and
  `orientation:portrait-primary`; mobile-first design). **DynamoDB**
  primary persistence via AWS SDK with **SQLite (`better-sqlite3`) local
  fallback** for dev/offline; AWS API Gateway WebSockets for private
  channels; xAI and OpenAI realtime WebSockets for voice streaming. Four
  voice modes today, tracked client-side by the `VA_MODE` global:
  **PTT family** — `'llm'` (Claude Haiku 4.5, Standard tier) and
  `'deluxe-claude'` (Claude Sonnet 4.6 per UI label, Deluxe-Claude tier,
  both via `/api/claude-chat`); **Realtime family** — `'deluxe-xai'`
  (xAI `grok-voice-latest` via `wss://api.x.ai/v1/realtime`) and
  `'deluxe-openai'` (OpenAI `gpt-realtime-2` via
  `wss://api.openai.com/v1/realtime`). Stripe-based billing with metered
  addon minutes for the three paid tiers (Deluxe-Claude, Deluxe-xAI,
  Deluxe-OpenAI), plus OAuth (Google/Apple) and phone+OTP authentication.
- **Domain:** General (voice-first social/messaging — no regulated-industry
  constraints)
- **Complexity:** Low at the domain level; medium-high on session-lifecycle
  and state-transition correctness (clean teardown of streaming audio
  sessions, defined behavior for mode switches mid-recording, mid-confirm,
  mid-auto-read; metered-billing implications make clean teardown a
  financial-correctness concern, not just a UX one)
- **Project Context:** Brownfield — the test12 app is deployed at
  https://test12.net with realtime modes already wired in; this PRD scopes
  a UX/feature addition (the switcher) plus the session-lifecycle plumbing
  it requires

## Success Criteria

### User Success

- **The escape works.** A user in any paid realtime mode can return to PTT in
  one tap, without page refresh, with their in-flight state (draft text,
  scroll position, current conversational step) intact.
- **Mode visibility is constant.** At any moment, a user can tell which mode
  they're in and what cost tier it implies, without opening a menu or
  refreshing.
- **Switching feels safe, not punishing.** Users who try a realtime mode out
  of curiosity should be willing to do so again, because the cost of exit is
  zero. Trust grows with exposure.
- **The escape works from voice assistants too.** A user already in a voice
  conversation with an MCP-connected assistant (Claude, Grok, etc.) can ask
  "switch me back to push-to-talk" and the assistant performs the escape via
  MCP tool — without the user having to find or tap the UI control. The
  escape contract is honored at both the human-UI layer and the
  agent-protocol layer.
- **Emotional benchmark — "I'm not trapped."** The product never strands a
  user in a paid state they didn't intend.

### Business Success

- **Realtime adoption goes up, not down, after the switcher ships.** A
  reversible mode is a tried mode. The bake-off itself depends on this.
- **Refresh-to-escape behavior drops to near zero.** Refreshes during an
  active realtime session are a reliable signal of "user wanted out" and
  should be measurable in client logs before/after.
- **Support load drops.** Any tickets, complaints, or churn signals tagged
  "stuck in mode" / "burned minutes I didn't want" / "can't switch back"
  drop to near zero.
- **Provider-evaluation data improves.** With reversible switching, users
  sample both realtime providers more readily, generating cleaner A/B
  signal on which one to keep. The eventual provider decision becomes
  evidence-based rather than founder-intuition-based.

### Technical Success

- **Clean session teardown.** Every mode-exit closes WebSocket / audio /
  streaming-API handles deterministically. No leaked sessions, no orphan
  background audio, no "phantom" billing accrual after exit.
- **Financial correctness.** Stripe-metered addon minutes stop accruing the
  moment the user exits a paid mode — measurable as `usage_logs` /
  `addon_sessions` records that end within tolerance of the UI exit
  timestamp.
- **Perceived-instant switching.** Mode switch completes in ≤500 ms at p95,
  measured from user tap to "new mode active" UI state.
- **State preservation.** Across every defined transition (see Functional
  Requirements step), the user's draft text, scroll position, and current
  conversational step survive the switch.
- **Mode-switch capability is exposed as MCP tools** registered in
  `mcp-tools.js`: at minimum `switch_to_ptt` (the escape primitive), and
  ideally also `get_voice_mode` + `set_voice_mode` as the general-purpose
  pair. Tools follow the existing snake_case naming and shared-registration
  pattern (loaded by both `server.js` stdio transport and `mcp-http.js`).
  Tool invocations produce the same clean teardown and state preservation
  as UI-driven switches — no separate code path.
- **No regressions** in existing flows: posting, threading, private-channel
  realtime delivery, auto-read narration, voice-reply matching.

### Measurable Outcomes

| Metric | Target | Source |
|---|---|---|
| 1-tap escape success rate (realtime → PTT) | ≥99% | client telemetry |
| Mode-switch latency p95 | ≤500 ms | client telemetry |
| Refresh-during-realtime-session rate | down ≥80% vs pre-switcher baseline | client logs |
| "Stuck in mode" support tickets | down ≥90% | support tracker |
| Phantom-billing incidents (minutes accrued after exit) | 0 | `addon_sessions` audit |
| % of users who try realtime ≥twice in a session | up vs baseline | session analytics |
| Draft-preservation rate across mode switches | 100% (mid-recording transitions excepted, per spec) | client telemetry |
| MCP `switch_to_ptt` tool invocation success rate | ≥99% | server logs |
| MCP escape parity: tool-driven exits leave no orphan sessions | 100% | `addon_sessions` audit |

## Product Scope

### MVP — Minimum Viable Product

The smallest thing that closes the trap:

- Global header control showing **current mode** (one of the four) with a
  **cost-tier badge** (Free / $$ / $$$ — Haiku is Free, Sonnet and the
  two realtime modes are paid Deluxe tiers)
- Tap on the control opens a switcher offering all four modes, grouped
  visually by family (PTT family / Realtime family) so the
  interaction-pattern difference is legible
- **The currently-broken direction works without refresh:**
  realtime → any PTT mode (and realtime → other realtime). Within-PTT
  switching already works via voice-command in `dispatchIntent`; the new
  UI control surfaces it visibly for the first time
- **Clean teardown** of any active realtime streaming WebSocket on exit
  (WS close, `MediaStreamTrack.stop()`, `AudioContext.close()`,
  server-side `addon_sessions` finalization, billing-meter stop)
- **State preservation** for draft text and scroll position across the
  switch. Mid-recording / mid-confirmation behavior gets an explicit
  defined policy (e.g. "discard with confirmation prompt" — exact policy
  decided in the requirements step)
- Works identically whether the user is viewing the public feed or an
  active private channel (both are in-page sections of the same SPA)
- **MCP tool: `switch_to_ptt`** (and ideally the `get_voice_mode` /
  `set_voice_mode` pair) registered in `mcp-tools.js`, callable by any
  connected MCP client. Same teardown + state-preservation guarantees as
  the UI control. This is *not* optional for MVP — the escape must be
  reachable both by tap and by voice-assistant-driven tool call, otherwise
  the "trust contract" only holds for users who happen to be looking at
  the screen.
- Telemetry events for switch attempts, switch successes, switch
  durations, and any teardown failures

### Growth Features (Post-MVP)

Make switching feel native, not just functional:

- **Bidirectional mode switching** with full state preservation in both
  directions
- **Inline session-cost display** ("0.6 minutes used in this realtime
  session") so users see what they're spending in real time
- **Smart transition handling** mid-recording (e.g. "finish current
  recording with old mode, then switch" instead of discard)
- **Per-channel mode memory** — the app remembers your last mode in each
  private channel
- **Language-aware mode hints** — if a user is replying in Spanish on PTT,
  surface a one-tap suggestion to try Grok (better non-English accent)
- **Compact mode for mobile** — switcher collapses gracefully on small
  screens
- **MCP tools surface cost and language metadata** — `get_voice_mode`
  returns not just the mode but its cost tier and language strengths, so
  assistants can recommend a switch contextually ("you're replying in
  Spanish — want me to switch you to Grok for better accent?").

### Vision (Future)

What this primitive enables once it's solid:

- **Three-mode reality.** The realtime bake-off concludes, the losing
  realtime provider is removed, and the switcher simplifies from 4 modes
  to 3 (PTT-Haiku, PTT-Sonnet, surviving realtime). The PTT family
  remains intact as the permanent Standard/Deluxe-Claude tier choice.
  The primitive survives the lineup change with zero UX rework.
- **Account-balance-aware switching.** If a user's addon minutes are near
  exhausted, the switcher proactively offers PTT and surfaces a top-up
  option.
- **Per-context defaults.** New private channels default to a mode chosen
  for the conversation type (e.g. cross-language → Grok; quick text-only
  → PTT).
- **User mode preferences as a first-class profile setting**, not just a
  session-level choice — once we know what users actually do, persistent
  defaults follow.
- **Mode switching becomes agent-orchestrated.** A connected assistant
  proactively manages the user's voice mode based on observed context
  (language detected, addon balance, conversation type) — with the user
  always retaining one-tap manual override.

## User Journeys

### Journey 1 — Maria: The Escape (Primary User, Success Path)

**Opening scene.** Maria is a Spanish-speaking school administrator in
Bogotá who opens test12 (installed as a PWA on her phone home screen)
during a break. She wants to record a quick voice update for the
parents' channel. She sees four modes grouped in the header switcher:
**PTT family** — "Haiku 4.5 (Free)", "Sonnet 4.6 ($$)"; **Realtime
family** — "xAI Grok ($$)", "OpenAI Realtime ($$$)". Out of curiosity
she taps the most premium-looking one. The OpenAI Realtime WebSocket
opens; her mic is now live-streaming and metered minutes begin
counting down from her Deluxe-OpenAI addon balance.

**Rising action.** Maria starts to record in Spanish, and the playback
response comes back in a flat anglophone accent that doesn't match
her cadence. She doesn't like it. Pre-feature, her only escape was
to refresh the page — destroying her partly-composed reply and her
scroll position in the parent thread. *Today, she just looks at the
header.* The current mode is clearly labeled. Next to it is a
switcher.

**Climax.** She taps the switcher, taps "Haiku 4.5 (Free)" at the top
of the PTT family. In under half a second the cost-tier badge updates
to "Free", the OpenAI WebSocket closes cleanly behind the scenes
(`MediaStreamTrack.stop()`, `AudioContext.close()`, server-side
`addon_sessions` row finalized), her addon meter freezes, her draft
text is still in the compose box, and the thread is still scrolled
to where she was. She didn't lose her place. She didn't lose money
she didn't intend to spend.

**Resolution.** Maria finishes her parent update in PTT-Haiku mode —
which faithfully renders her Spanish and costs nothing. She
publishes, thanks the system, and closes the tab. *"I'm not
trapped"* — the feeling the product is designed to deliver.

**Requirements revealed:** global header mode control · cost-tier
signaling · realtime-to-PTT one-tap transition · clean session
teardown (audio + WebSocket + billing meter) · draft preservation ·
scroll preservation · cost-tier-accurate labeling per mode.

---

### Journey 2 — David: The Mid-Recording Switch (Primary User, Edge Case)

**Opening scene.** David is a power user testing test12 for his own
team. He's deliberately exploring all four modes back-to-back. He's
on xAI Grok Realtime, talking into the mic — mid-sentence, dictating
a reply — when he decides he wants to try PTT-Sonnet for the same
message to compare quality.

**Rising action.** He taps the mode switcher while still speaking.
This is the edge case the feature must handle gracefully: a transition
mid-recording. Two policies could apply — discard current
in-progress audio, or finish it under the old mode and then switch.
The product must have a defined behavior, not silently drop audio.

**Climax.** A brief modal appears: *"Switching to Sonnet 4.6 will
discard your current xAI Realtime recording. Continue?"* with options
[Switch] [Stay]. David taps Switch. The xAI WebSocket tears down
cleanly, the modal dismisses, the header now shows "Sonnet 4.6 ($$)",
the compose box is ready for a fresh tap-to-speak recording.

**Resolution.** No silent data loss. No bug-report-worthy weirdness.
David appreciates that the system *asked* rather than assumed —
because his trust survives the transition.

**Requirements revealed:** defined policy for mid-recording transitions
· confirmation UI for destructive switches · same teardown guarantees
as Journey 1 · no silent audio drops · audio-in-progress state
detection.

---

### Journey 3 — Sofia: The Agent-Driven Escape (MCP User)

**Opening scene.** Sofia uses test12 from her desk while a Claude
voice-assistant session runs in another tab, connected to test12 via
the MCP HTTP transport. She's juggling a few tasks and clicked into
OpenAI Realtime by accident a few minutes ago — her addon meter is
ticking down and she's not even looking at the test12 tab. She's
focused on Claude.

**Rising action.** She says to Claude: *"I think I'm in the
expensive voice mode in test12. Can you put me back in push-to-talk?"*
Claude — which sees test12's MCP tool catalog — finds `switch_to_ptt`,
confirms it doesn't need any parameters, and calls it.

**Climax.** The server executes the same logic the UI control would
fire: clean teardown of Sofia's OpenAI Realtime WebSocket, billing
meter halts, `VA_MODE` flips to `'llm'` (PTT-Haiku, the free
baseline), state preserved. Claude tells Sofia: *"Done — you're back
in Push-to-talk mode with Haiku 4.5. The OpenAI Realtime session
has been closed and billing has stopped."* Sofia glances at the
test12 tab and the header now shows "Haiku 4.5 (Free)" with her
draft still there.

**Resolution.** Sofia never had to switch tabs, never had to tap a
control, never even had to look. The escape contract holds at the
agent layer as well as the UI layer — which is exactly what a
voice-first product owes its users.

**Requirements revealed:** MCP tool `switch_to_ptt` registered in
shared `mcp-tools.js` · MCP tool parity with UI control (same
teardown, same state preservation, same billing-meter behavior) ·
optional companion tools `get_voice_mode` / `set_voice_mode` for
richer agent reasoning · per-user authentication on MCP tool calls
(escape must apply to *that* user's session, not someone else's).

---

### Journey 4 — BMad: The Bake-Off Decision (Operator/Admin)

**Opening scene.** BMad — operator of test12 — wants to decide which
**realtime** provider survives the bake-off (xAI `grok-voice-latest`
vs OpenAI `gpt-realtime-2` — the PTT family is not part of the
bake-off; Haiku and Sonnet are a permanent tier distinction). The
mode switcher has been live for several weeks. The whole point of
shipping reversible switching was to give the realtime evaluation
phase honest signal: only when users can freely enter and exit
realtime modes does sampling data mean anything.

**Rising action.** BMad pulls usage data — `usage_logs`,
`addon_sessions`, mode-switch telemetry. He segments by realtime
provider only: session durations, language distribution per realtime
provider, the rate at which users *re-enter* a realtime mode after
exiting (a strong signal of "I liked it"), and the rate of
escapes-from-realtime-mid-session into any PTT mode (a strong
signal of "this realtime mode failed me"). He also reads PTT-family
data separately to understand Haiku vs Sonnet preference, but that's
informational, not bake-off material.

**Climax.** The data shows xAI Grok Realtime is preferred ~3:1 over
OpenAI Realtime for non-English replies, and roughly even for
English. Overall realtime-reentry rate is higher for Grok across
user segments. The realtime provider call writes itself.

**Resolution.** BMad removes the OpenAI Realtime code path in a
follow-up release. The mode switcher now shows three modes —
"Haiku 4.5 (Free)", "Sonnet 4.6 ($$)", "xAI Grok ($$)" — and **the
switcher component itself is unchanged**. The primitive outlives
the realtime bake-off, exactly as the vision predicted.

**Requirements revealed:** mode-switch telemetry events (attempt,
success, failure, latency, source [UI vs MCP], teardown status) ·
per-mode session duration logged · re-entry counting · escape-to-PTT
detection · query/aggregation surface for operator analytics (which
in this codebase likely means structured `usage_logs` rows or a
small admin endpoint) · component architecture that gracefully
accepts mode-list shrinkage from 4 → 3 without rework.

### Journey Requirements Summary

The four journeys collectively reveal these capability areas:

| Capability | Sourced from |
|---|---|
| Global header mode control with cost-tier badging | Maria, BMad |
| One-tap realtime → PTT escape | Maria, Sofia |
| Clean session teardown (audio + WS + billing) | Maria, David, Sofia |
| Draft + scroll + conversational-step preservation | Maria, David |
| Defined mid-recording / mid-confirmation transition policy + confirmation UI | David |
| MCP tools: `switch_to_ptt` (MVP) + `get_voice_mode`/`set_voice_mode` (recommended) | Sofia |
| MCP-to-UI parity (same teardown, same state preservation) | Sofia |
| Per-user auth on MCP mode calls | Sofia |
| Mode-switch telemetry (attempt/success/failure/latency/source) | BMad |
| Per-mode session duration + re-entry + escape-rate logging | BMad |
| Operator query surface for mode-usage analytics | BMad |
| Component architecture that handles 4→3 mode lineup change | BMad |

## Web App Specific Requirements

### Project-Type Overview

test12 is a **single-page PWA** delivered as a monolithic
`public/index.html` (~164 KB) served by an Express backend. All UI —
public feed, private channels list, agent card, addon-usage bars,
auth flow, aliases panel — lives on one page; navigation between
"public" and a specific private channel is in-page state change
(`activeChannelId`), not a route change. A service worker
(`public/sw.js`, cache version `test12-v5`) gives offline shell
behavior: static assets cache-first, HTML network-first with cache
fallback, and `/api/*` + `/mcp` **never cached**.

The mode switcher therefore adds **one component to one HTML
document**, and lives alongside the existing global `VA_MODE`
state variable that already holds the current voice agent
(`'llm' | 'deluxe-claude' | 'deluxe-xai' | 'deluxe-openai'`).
Forward mode-switching from PTT (`llm` / `deluxe-claude`) already
exists via `dispatchIntent` — voice commands like *"switch to
OpenAI"* set `VA_MODE` and call `updateAgentUI()`. The PRD scope
is to (a) add a visible UI control surfacing that mode state and
its cost tier, and (b) make mode-switch reachable from inside a
realtime WS session (where voice no longer goes through
`dispatchIntent` and the current Disconnect button is the only
exit).

### Browser Matrix

Inherits the existing app's capability floor — no new
requirements:

- **WebRTC + `MediaDevices.getUserMedia`** with the existing
  audio config (`{ sampleRate: 24000, channelCount: 1,
  echoCancellation: true, noiseSuppression: true }`) — required
  for every mode
- **Web Audio API / `AudioContext`** — needed for clean release
  on mode-exit teardown in realtime modes
- **`WebSocket`** — used by both realtime modes
  (`wss://api.x.ai/v1/realtime?model=grok-voice-latest` and
  `wss://api.openai.com/v1/realtime?model=gpt-realtime-2`) and by
  private-channel real-time delivery
- **Service Worker API** — already required for the PWA shell
- **ES2020+ JavaScript**
- **Mobile Safari (iOS 15+) and Mobile Chrome** must be supported
  identically — the PWA is portrait-locked (`orientation:
  portrait-primary` in `manifest.json`) and the cost-trap pain
  hits hardest on phones where refresh is most disruptive

### Responsive Design

The app is **mobile-first** by manifest (portrait-primary,
standalone display, Apple PWA meta tags). The mode switcher must
fit that profile, not the other way around:

- **Mobile (the design target):** Switcher renders in the header
  region alongside the existing `header-login-link` / `Profile` /
  `Sign out` buttons. Compact pill or icon-with-badge showing
  current mode + cost-tier. Tap reveals the full switcher in a
  bottom sheet or popover.
- **Desktop (≥768 px):** Same pill expands inline to show current
  mode label + cost-tier badge; dropdown/popover for switching.
- **Tap targets ≥44 × 44 px** to match iOS HIG and the existing
  header button sizing.
- **Never hidden behind a hamburger.** The cost-trap escape
  control must be visible at all times in authenticated chrome.
- **Cost-tier visibility integrates with the existing
  `#addon-usage-bars` element** (currently at the bottom of the
  page, populated when addon usage data is loaded). MVP can keep
  the bars where they are; the header switcher exposes cost tier
  per mode independently. Growth can consolidate or cross-link
  the two.

### Performance Targets

The mode switcher's testable performance criteria are formalized in
**NFR1–NFR6** (Non-Functional Requirements > Performance) and are not
duplicated here. In summary: switch latency ≤500 ms p95, WS teardown
≤200 ms p95, billing-meter halt ≤500 ms, MCP tool round-trip ≤1 s.

Two platform-specific constraints not captured by the NFRs:

- **Service worker cache-hit behavior** for static assets must remain
  unchanged from the current PWA shell (`public/sw.js` cache version
  `test12-v5`); adding the switcher must not bust the cache or change
  the cache strategy for existing static assets.
- **No regression** in initial page-load TTI: the switcher must not
  delay the existing `connect-btn` or `orb` from becoming
  interactive vs the pre-switcher baseline.

### SEO Strategy

**Not applicable.** test12 is an installable PWA behind auth.
`index.html` serves both the pre-auth landing and the
authenticated app via in-page state, but the switcher only renders
post-auth. No new `<meta>`, schema.org, or canonical concerns.

### Accessibility Level

The switcher is in a voice-first app, but UI accessibility still
matters — users may be in PTT mode driving the UI with keyboard
or assistive tech, and "users in a trap" sometimes aren't using
voice at the moment they need to escape.

- **Keyboard-navigable.** Switcher receives focus in document
  order alongside existing header buttons (`header-login-link`,
  `Profile`, `Sign out`), expands on Enter/Space, modes are
  arrow-key navigable within the open switcher. Escape closes
  without changing mode.
- **Screen-reader-announceable.** Current mode is announced as
  *"Voice mode: Sonnet 4.6, Deluxe-Claude tier"* or equivalent.
  Mode change triggers a live-region announcement: *"Switched to
  Haiku 4.5, Standard tier. OpenAI Realtime session closed."*
- **Cost-tier signaling is not color-only.** Free / $$ / $$$
  uses text or symbol differentiation in addition to color, so
  the existing teal/amber/red palette used by `aub-fill.ok`,
  `.warn`, `.full` doesn't strand colorblind users.
- **`prefers-reduced-motion` respected.** Existing transitions
  (e.g. `transition: width 0.6s ease` on `.aub-fill`) get
  short-circuited; the switcher should follow the same rule.
- **`aria-current`** on the active mode within the open
  switcher.

### Implementation Considerations

- **Where the code lives.** Add the switcher inline in
  `public/index.html` — that's the project convention; there are
  no separate JS modules in `public/`. The component reads from
  and writes to the existing `VA_MODE` global, calls the existing
  `updateAgentUI()` to refresh the orb / button label, and adds
  a new teardown helper for the realtime-WS exit path that today
  is owned by the Disconnect button.
- **Teardown contract per mode.** Each mode registers an exit
  step:
  - `llm` / `deluxe-claude` (PTT): cancel any in-flight
    `/api/claude-chat` fetch; clear any pending `ptSpeak` audio.
  - `deluxe-xai`: close `wss://api.x.ai/v1/realtime` socket;
    `MediaStreamTrack.stop()` on the mic track; close the
    `AudioContext`; signal server to finalize the active
    `addon_sessions` row.
  - `deluxe-openai`: same as above against
    `wss://api.openai.com/v1/realtime`.
  Mode-switch never proceeds until the previous mode's exit
  resolves (or times out with explicit failure telemetry).
- **MCP tool registration.** Add `switch_to_ptt` (and
  recommended `get_voice_mode` / `set_voice_mode`) to the existing
  `mcp-tools.js` registry. The server-side tool handler updates a
  per-session "desired mode" record that the client polls or
  receives via the existing WebSocket pathway used for private
  channels; on receipt the client runs the same teardown +
  state-machine path as a UI-driven switch.
- **Per-user auth on MCP mode tools.** Use the same auth
  middleware as existing user-scoped MCP tools
  (`get_addon_usage`, `set_alias`, etc.). Verify against the
  current MCP transport auth model in `mcp-http.js` /
  `mcp-tools.js`.
- **Service-worker compatibility.** The switcher UI and its
  JS are part of the cached `index.html` shell, so a new
  switcher rolls out on next network refresh (network-first HTML
  policy in `sw.js`). MCP/API calls (`switch_to_ptt` etc.) are
  never cached per `sw.js:49-55`, so no service-worker
  invalidation concerns for the tool path.
- **No new dependencies.** The feature is buildable with the
  current `package.json` — no new npm packages needed for state
  machine, MCP tooling, or UI components.
- **No persistence in MVP.** Mode is per-tab via `VA_MODE`;
  reload starts fresh. Per-user persistent mode default is
  explicitly Growth (would require a small `users.default_mode`
  column plus a settings endpoint).
- **Fix the Sonnet label/impl gap incidentally** (worth
  surfacing here even if not strictly switcher work): client
  UI labels the Deluxe-Claude mode "Sonnet 4.6" but
  `app.js:1171` requests `'claude-sonnet-4-5'`. Tracked
  separately as a GitHub issue draft at
  `.github/issue-drafts/sonnet-4-6-label-impl-mismatch.md`.
  Natural to bundle with switcher work since both touch mode
  metadata, but not a blocker for switcher MVP.

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP Approach:** **Problem-solving MVP** — close the cost-trap UX
dead-end and restore user agency over voice-mode selection. This is
not a market-validation MVP (the market exists; users are on
test12.net today, refreshing to escape paid modes) and it is not a
platform MVP (the mode-switcher is a primitive within an existing
app, not a new surface). The single fastest path to validated
learning is: ship the escape, measure refresh-during-realtime rate
collapse, then iterate.

**Resource Requirements:** This is sized for the **solo-operator
codebase** that test12 is today.

- **Engineering:** one developer with full context on `index.html`'s
  voice-flow code (`VA_MODE`, `dispatchIntent`, `updateAgentUI`,
  realtime WS connect/disconnect paths). Realistic effort
  ≈ 7–9 working days end-to-end for the MVP, broken down roughly as:
  - UI switcher component + cost-tier badge + grouping by family: ~2 days
  - Realtime-WS teardown contract (per-mode `exit()` handlers, billing-meter halt signaling, state preservation): ~2 days
  - MCP tool registration (`switch_to_ptt` + recommended `get_voice_mode` / `set_voice_mode`) + client-side mode-state delivery pathway: ~2 days
  - Telemetry events + manual test pass across the 4-mode × N-transition matrix on mobile + desktop + PWA-installed: ~2 days
  - Buffer for the inevitable subtle issues in audio session lifecycle: ~1 day
- **Other roles:** none required for MVP. No designer (use existing
  header styling tokens and `addon-usage-bars` color palette); no
  separate QA (the operator owns testing); no PM (the operator owns
  product).
- **Out-of-codebase dependencies:** none — no new npm packages, no
  infra changes, no new tables (mode state is per-tab/session).

### MVP Feature Set (Phase 1) — Reference

The MVP feature list and Phase 2/3 roadmap are defined in detail in
the **Product Scope** section above. This Scoping section does not
duplicate them; it commits to the *strategic boundaries* around that
list:

- **MVP scope is locked to "make the trap escapable, in UI and via
  MCP."** Cost-tier visibility, clean teardown, state preservation,
  mid-recording confirmation policy, and the `switch_to_ptt` MCP
  tool are all in. Anything beyond is Phase 2 or later.
- **The Disconnect button stays where it is for MVP.** The switcher
  duplicates its function from a different entry point; we don't
  re-architect the existing connect/disconnect flow as part of this
  PRD.
- **No new persistence in MVP.** Per-user default mode, per-channel
  mode memory, persistent profile preference — all explicitly Phase 2.
- **No new analytics infra.** Telemetry rides on the existing
  `usage_logs` / `addon_sessions` schema and adds mode-switch event
  rows of the same shape. Any operator dashboard work is Phase 2.

### Risk Mitigation Strategy

**Technical Risks**

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Race condition between client mode-switch and server-side `addon_sessions` row finalization, causing "phantom billing" of seconds after exit | Medium | High (violates a stated success criterion) | Server-side teardown handler must finalize the row atomically on receiving the exit signal *before* acknowledging the switch to the client. Telemetry alerts on any `addon_sessions.ended_at` timestamp that lags the corresponding UI-exit telemetry by >500 ms. |
| MCP-tool-driven mode switch needs a server→client push pathway; today this exists only for active private-channel WebSockets, not for the public feed | Medium | Medium | MVP can use **client polling** of `get_voice_mode` from the agent side after `switch_to_ptt` to confirm, plus a short-lived "desired mode" record on the user row that the client picks up on next user-initiated request. A push channel via the existing private-channel WS infra is a Phase 2 enhancement. |
| State-preservation regression — the switcher might inadvertently drop draft text or scroll position because of how the existing in-page state change works | Medium | Medium | Explicit unit/integration tests for the transition matrix (4 modes × N transition triggers × {draft non-empty, scroll non-zero, mid-recording}) before merge. State preservation is a stated success-criterion target of 100%. |
| Regression in existing voice flows because the switcher touches the same monolithic `index.html` (~164 KB) that owns posting, threading, channels, auth, and existing voice-command mode switching | Medium | High | All existing user journeys (posting, replying, channel navigation, private-channel realtime, voice-command mode switching from within PTT) get an explicit manual regression pass before each merge. The PWA service worker's network-first HTML policy means rollout is safe to roll back via a simple deploy. |
| Audio session teardown leaks (handle, mic indicator, AudioContext) — browsers will not garbage-collect orphan audio sessions cleanly and users notice the persistent mic indicator | Low | Medium | The per-mode `exit()` contract explicitly enumerates teardown steps (WS close, `MediaStreamTrack.stop()`, `AudioContext.close()`, server signal). Mid-recording transitions tested specifically because they're the most likely leak vector. |

**Market Risks**

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Cost-tier signaling (visible `$$$` next to OpenAI Realtime) suppresses paid-tier adoption and harms the realtime bake-off signal | Low-Medium | Medium (could distort bake-off data) | Signaling is informational, not gating — users can still tap into any tier with one tap. If observed adoption suppression is material, the visual weight of the badge can be tuned (smaller, lower contrast) without redesigning the switcher. The *opposite* risk (no signaling, users keep falling into traps) is larger and is the reason for shipping. |
| Users on the realtime providers' free tiers (where applicable) misinterpret cost-tier badges as their personal cost, when actual billing is operator-funded | Low | Low | Cost-tier labels reflect the **tier price** (Standard / Deluxe-X), not "your personal balance." Microcopy makes this clear: "Deluxe-OpenAI: priciest tier" rather than "$0.50/min." Account-balance-aware microcopy is explicitly Phase 2 (Growth). |
| The realtime bake-off concludes faster than expected and the switcher's 4-mode design feels stale before it's even fully battle-tested | Low | Low | The switcher component is architected to render N modes from a config array (`MODES = [...]`). Removing OpenAI is a one-line config change. The 4→3 collapse is explicit MVP architecture — see Implementation Considerations (Step 7). |

**Resource Risks**

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Solo-operator development velocity stalls because of competing priorities (existing feature work, customer support, infra) | High (inherent to solo-operator context) | Medium | The MVP can be implemented in a stepwise series of small merges, each independently shippable: (1) header switcher with no behavior change (just visual), (2) teardown contract per mode, (3) realtime→PTT escape wiring, (4) MCP tool. Each merge delivers some user value and reduces work-in-flight. |
| Engineering effort exceeds the 7–9 day estimate by ≥2× because of unforeseen complexity in the realtime session teardown paths | Medium | Medium | Time-box each piece. If any single piece exceeds 2× estimate, escalate to a scope decision: cut the most expensive Growth-adjacent MVP item (likely the MCP tool's full parity if it's the blocker) — though the user has explicitly committed MCP-tool as non-negotiable, so the more likely cut is mid-recording confirmation UI (Journey 2) which becomes "discard silently with a toast." |
| MCP tool work blocks because the per-user auth model in `mcp-http.js` doesn't cleanly support per-session mode-state push | Medium | Medium | MVP fallback (acknowledged in Technical Risks above): polling-based confirmation instead of push. Documented as a known limitation; Phase 2 upgrades to push via the existing private-channel WS infra. |

## Functional Requirements

### Voice Mode Control

- FR1: User can see the currently active voice mode at any time without
  opening a menu, navigating away, or refreshing the page.
- FR2: User can switch from any voice mode to any other voice mode
  without a page refresh.
- FR3: User can escape from any realtime-streaming mode to a PTT mode in
  a single action.
- FR4: User can distinguish the PTT family of modes from the
  realtime-streaming family of modes in the switcher UI.
- FR5: User can perform mode switching identically while viewing the
  public feed or while inside any private channel.
- FR6: User can continue to use voice-command mode switching (e.g.
  *"switch to Sonnet"*) from within PTT modes as exists today.

### Cost Transparency

- FR7: User can see the cost tier (free vs paid; tier identity if paid)
  of every available voice mode before selecting it.
- FR8: User can see the cost tier of the currently active voice mode at
  all times.
- FR9: User can distinguish cost tiers without relying on color alone.

### Session Lifecycle Management

- FR10: System cleanly terminates any active realtime-streaming
  session when the user exits that mode.
- FR11: System releases the microphone and audio context on mode exit
  so that no orphan audio session persists after a switch.
- FR12: System halts billing-meter accrual for a paid mode at the
  moment the user exits that mode, with no silent post-exit accrual.
- FR13: User's draft text in the compose box is preserved across any
  mode switch.
- FR14: User's scroll position is preserved across any mode switch.
- FR15: User's current conversational step (e.g. mid-confirmation,
  mid-reply) is preserved across mode switches, except where the
  defined mid-flight transition policy specifies otherwise.

### Mid-Flight Transition Safety

- FR16: System detects when the user has audio in progress
  (mid-recording or mid-streaming) at the moment of a mode-switch
  attempt.
- FR17: User is asked to confirm before any mode switch that would
  discard in-progress audio.
- FR18: System never silently drops in-progress audio as a side effect
  of a mode switch.

### MCP Tool Surface

- FR19: Connected MCP agent can query the user's current voice mode.
- FR20: Connected MCP agent can set the user's voice mode to any of the
  four supported modes.
- FR21: Connected MCP agent can return the user to a PTT mode via a
  single, parameter-less tool call.
- FR22: MCP-initiated mode switches honor the same session-lifecycle
  guarantees as UI-initiated switches (clean teardown, state
  preservation, billing-meter halt, mid-flight safety).
- FR23: MCP mode-control tools authenticate the calling agent as a
  specific user and only affect that user's session — never another
  user's.

### Observability & Telemetry

- FR24: System records each mode-switch attempt with mode-from,
  mode-to, source (UI vs MCP), and timestamp.
- FR25: System records the outcome of each mode-switch attempt
  (success, failure, timeout) and its end-to-end duration.
- FR26: System records the duration of every realtime-streaming
  session.
- FR27: System records "escape" events distinctly — any exit from a
  paid mode back into a PTT mode while audio was in progress.
- FR28: Operator can aggregate mode-switch, session-duration, and
  escape-rate data per voice mode and per realtime provider to inform
  the realtime-provider bake-off decision.

### Accessibility

- FR29: User can navigate and operate the mode switcher using only the
  keyboard.
- FR30: User of a screen reader is informed of the currently active
  voice mode and is announced of mode changes as they happen.
- FR31: User with the `prefers-reduced-motion` setting experiences no
  motion-dependent transitions in the switcher UI.

## Non-Functional Requirements

### Performance

- NFR1: Mode-switch UI feedback (tap → "new mode active" UI state)
  completes in ≤500 ms at p95, measured client-side from the user
  interaction event to the mode-active render.
- NFR2: Realtime-streaming WebSocket teardown (socket close + audio
  resource release) completes in ≤200 ms at p95 after the
  mode-exit signal is issued.
- NFR3: Server-side `addon_sessions` row finalization (billing-meter
  halt) is committed within ≤500 ms of mode-exit, measured from the
  exit signal to the database write timestamp.
- NFR4: MCP mode-control tool calls (`switch_to_ptt`,
  `set_voice_mode`, `get_voice_mode`) return to the calling agent in
  ≤1 s end-to-end at p95, including any required server-side
  teardown.
- NFR5: Initial page-load render of the mode switcher control adds
  ≤100 ms to time-to-interactive vs the pre-switcher baseline, and
  never blocks the existing `connect-btn` from becoming
  interactive.
- NFR6: Mode-switch and telemetry recording never block the
  user-facing action — telemetry writes are fire-and-forget from the
  client's perspective.

### Security

- NFR7: All MCP mode-control tool calls authenticate the caller as
  a specific user using the same auth middleware as existing
  user-scoped MCP tools (`get_addon_usage`, `set_alias`).
  Unauthenticated calls are rejected with HTTP 401 / equivalent
  MCP error.
- NFR8: An authenticated MCP agent can only modify the voice mode
  of the user it is authenticated as. Cross-user mode manipulation
  attempts are rejected with HTTP 403 / equivalent MCP error and
  logged.
- NFR9: Realtime-provider API keys (`XAI_API_KEY`,
  `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`) are never sent to the
  client. The switcher and its teardown logic only call
  server-mediated endpoints or pre-existing client-side
  WebSocket-bridge code that already handles auth tokens
  server-side.
- NFR10: Billing-meter state (active `addon_sessions` rows,
  remaining addon minutes) is readable by the user only for their
  own account and never exposed in mode-switch telemetry or MCP
  tool responses to a third-party agent.

### Reliability

- NFR11: Zero tolerance for phantom billing — across all
  mode-switch events in a measurement window, the count of
  `addon_sessions` rows that show meter accrual after a recorded
  mode-exit telemetry event is zero. (Drives audit alerting; ties
  to a stated Measurable Outcome.)
- NFR12: No regression in existing voice flows: every existing
  user journey (posting, threading, voice-reply matching,
  private-channel realtime delivery, auto-read narration,
  voice-command-driven mode switching from within PTT) passes a
  full manual regression test before each merge that touches
  `index.html`.
- NFR13: Audio session teardown is leak-free — after any mode-exit,
  the browser shows no persistent mic indicator from test12 and no
  `MediaStreamTrack` belonging to test12 is in the `live` state.
  Verified by exercising every transition in the mode matrix.
- NFR14: MCP tool calls that fail mid-teardown (network error,
  server crash, etc.) leave the user's mode state internally
  consistent — either fully on the previous mode (rollback) or
  fully on the target mode (forward), never in a halfway state with
  an orphan session.
- NFR15: The mode switcher and its teardown logic continue to
  function correctly when the service worker is serving a cached
  `index.html` shell (i.e., the user is on an older client version
  than the latest deploy). New server-side MCP tools degrade
  gracefully — a missing tool returns a clean error rather than
  hanging the client.

### Accessibility

- NFR16: Mode switcher conforms to **WCAG 2.1 Level AA** for all
  user-facing controls (the badge, the trigger button, the
  expanded switcher list, the mid-flight confirmation modal).
- NFR17: Mode switcher is verified working with iOS Safari
  VoiceOver and macOS Safari VoiceOver. On Android, Chrome
  TalkBack functionality is verified.
- NFR18: Mode switcher meets a minimum **3:1 contrast ratio** for
  the cost-tier badge text against its background across all
  badge variants (Free / $$ / $$$), in addition to the
  text-or-symbol differentiation required by FR9.
- NFR19: All cost-tier badge state changes and mode transitions
  are announced via an ARIA live region with `aria-live="polite"`
  so screen-reader users are not interrupted but are kept in
  sync.
