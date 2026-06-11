# test12 — Project Context

## Project Goals

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

## Success Metrics

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

## Scope Boundaries

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

## Design Guidelines

Foundation

### Design System Choice

**Approach: Tailwind CSS, after a separate codebase-wide migration epic.**

This UX specification commits the mode switcher to **Tailwind CSS** as
its styling foundation. test12 does not currently use Tailwind — the
codebase is monolithic `public/index.html` with inline `<style>`-block
CSS — so this UX spec also commits to a **precursor migration epic**
that must ship before mode-switcher implementation begins.

This is a deliberate sequencing decision: rather than introduce
Tailwind locally for one feature (creating two parallel styling
systems in the same file for an undetermined transition period), the
project migrates everything first, then authors new work natively.
Cleaner end-state, higher up-front cost, lower long-term drag.

### Precursor: Tailwind Migration Epic

**Status: To be authored.** This must complete before mode-switcher
implementation can start. Scope summary (subject to detailed epic
authoring):

- **Add a proper PostCSS + Tailwind CLI build step.** Not the CDN
  variants — those are unfit for production per Tailwind's own
  guidance and would degrade NFR5 (TTI). The CLI build produces a
  purged, minified CSS file shipped alongside `index.html`.
- **Configure `tailwind.config.js`** to preserve existing brand
  tokens — teal `#1595b2`, dark `#050810`, the `aub-fill` palette
  (`#1595b2` / `#f59e0b` / `#ef4444`), Inter typography, the
  translucent-teal overlay scale — as `theme.extend` entries. Users
  must not perceive a visual change after the migration.
- **Migrate `public/index.html` page-by-page.** All ~9000 lines of
  HTML markup get class-name churn; ~1100 lines of `<style>`-block
  CSS get deleted as replaced. Migration is structured so each
  commit is independently shippable and visually verifiable.
- **Preserve PWA shell semantics.** Bump `CACHE_VERSION` exactly
  once at the end of migration. The service worker's network-first
  HTML policy means a single returning-user cache cliff, not many.
- **Verify no regression** in posting, threading, channels, auth,
  aliases, addon-usage-bars, the orb animation, `body::before`
  ambient background, iOS `-webkit-fill-available` viewport fix,
  PWA install banner. Each is a regression candidate.
- **Update deploy scripts** (`deploy.ps1`, `deploy-dev.ps1`) to
  invoke the Tailwind build step before bundling.

Realistic estimate: **2–4 weeks** for a single operator with full
codebase context. Track separately in its own PRD or epic; this UX
spec assumes the work has shipped before switcher implementation
begins.

### Rationale for Tailwind (vs continuing custom)

Three reasons "migrate then build switcher in Tailwind" wins, even
though the precursor adds time:

1. **Utility-first scales better as the app grows.** test12 already
   shows the strain of inline CSS at 164 KB. Each new feature
   either duplicates existing patterns or invents new ad-hoc
   tokens. Tailwind's constraint system (only use tokens defined
   in config) keeps the design language consistent as the codebase
   adds features beyond the switcher.
2. **The switcher is the right "first new feature in Tailwind."**
   It's scoped, it has clear boundaries, and its visual primitives
   (badge, sheet, list rows, modal) are common enough that
   Tailwind's class library accelerates rather than impedes
   authoring. Building it natively in Tailwind avoids the technical
   debt of "we'll port this later."
3. **Operator-team-of-one architecture preference.** Tailwind's
   class-name approach trades some HTML verbosity for elimination
   of the "find the rule that styles this" problem. For solo
   maintenance, this is a net win — every style is co-located with
   the markup it affects.

### Rationale for "migration first, then switcher" (vs "switcher in Tailwind, migrate later")

Two scenarios were considered and rejected:

- **"Switcher in Tailwind, migrate the rest later."** Rejected because
  it creates two parallel styling systems in the same `index.html`
  for an indefinite transition period. Two systems = double the
  vocabulary, double the cognitive load when touching shared
  elements (header, modal backdrops, etc.), and structural pressure
  toward "I'll add a one-off rule" that becomes permanent. The
  cleaner approach is to bite the migration cost once, up front.
- **"Bundle migration into the mode-switcher PRD."** Rejected
  because it would inflate the switcher PRD's MVP scope from 7–9
  days to 3–5 weeks and conflate two distinct decisions
  (architectural foundation vs feature delivery). Cleaner to track
  the migration as its own work with its own risks, then deliver
  the switcher on the new foundation.

### Implementation Approach (post-migration)

The mode switcher's visual implementation is **Tailwind utility
classes in `public/index.html`** (or whatever `index.html`'s
post-migration structure becomes — likely still monolithic, just
class-based instead of inline-CSS-based).

- **Naming approach:** Tailwind utility classes 
