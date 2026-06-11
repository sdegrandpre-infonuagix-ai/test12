---
stepsCompleted:
  - step-01-init
  - step-02-context
  - step-03-starter
  - step-04-decisions
  - step-05-patterns
  - step-06-structure
  - step-07-validation
  - step-08-complete
lastStep: 8
status: 'complete'
completedAt: '2026-05-27'
inputDocuments:
  - path: '_bmad-output/planning-artifacts/prd.md'
    type: 'prd'
    note: 'Primary requirements source. 31 FRs + 19 NFRs scoping the voice-mode switcher. Architecture must honor the capability contract.'
  - path: '_bmad-output/planning-artifacts/ux-design-specification.md'
    type: 'ux'
    note: 'UX commitments: 7 vmode-* components, bottom-sheet/popover responsive pattern, Tailwind precursor migration epic. Architecture must support these.'
  - path: '_bmad-output/planning-artifacts/implementation-readiness-report-2026-05-27.md'
    type: 'readiness-report'
    note: 'Identified 3 deferred decisions architecture must resolve: server→client mode-state push pathway, operator analytics surface, mid-flight transition policy precise semantics.'
  - path: 'README.md'
    type: 'project-context'
    note: 'Existing test12 app overview. PARTIALLY STALE on tech stack — see PRD frontmatter inputDocuments note for details. Trust the codebase, not the README.'
  - path: '.github/issue-drafts/sonnet-4-6-label-impl-mismatch.md'
    type: 'tracked-issue'
    note: 'Companion code-level gap surfaced during PRD work. Not architecture scope but worth flagging when touching mode metadata.'
workflowType: 'architecture'
project_name: 'test12'
user_name: 'BMad'
date: '2026-05-27'
mode: 'create'
focus: 'voice-mode-switcher'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

**Author:** Winston (Architect) · facilitated for **BMad**
**Date:** 2026-05-27
**Focus:** Voice-Mode Switcher (per `prd.md` + `ux-design-specification.md`)

## Project Context Analysis

### Requirements Overview

**Functional Requirements (31 FRs, 7 capability areas):**

| Capability area | FR count | Architectural implication |
|---|---|---|
| Voice Mode Control | FR1–FR6 (6) | Client-side state machine over existing `VA_MODE` global; UI surface + event handling |
| Cost Transparency | FR7–FR9 (3) | Static per-mode metadata model; no backend state |
| Session Lifecycle Management | FR10–FR15 (6) | **The hard part** — clean teardown across WebSocket, MediaStream, AudioContext, server-side `addon_sessions`; financial correctness; state preservation |
| Mid-Flight Transition Safety | FR16–FR18 (3) | Client-side "audio in progress" detection + confirmation UI; defined transition policy |
| MCP Tool Surface | FR19–FR23 (5) | Server-side tool registrations in `mcp-tools.js`; **server→client mode-state delivery pathway (deferred decision)** |
| Observability & Telemetry | FR24–FR28 (5) | New event types persisted via existing schema patterns; **operator analytics surface (deferred decision)** |
| Accessibility | FR29–FR31 (3) | Inherited from UX spec's component-level a11y commitments; no separate architecture |

**Non-Functional Requirements (19 NFRs, 4 quality attributes):**

| Quality attribute | NFR count | Architectural posture |
|---|---|---|
| Performance | NFR1–NFR6 (6) | Tight latency budgets (≤500 ms p95 switch, ≤200 ms teardown, ≤1 s MCP tool roundtrip) — favor synchronous teardown over background workers |
| Security | NFR7–NFR10 (4) | Per-user auth on MCP tools (reuse existing middleware); no API key exposure to client; cross-user-isolation enforcement |
| Reliability | NFR11–NFR15 (5) | **Zero phantom billing** (financial-correctness requirement); atomic mode transitions (rollback on partial failure); regression-prevention for existing flows; service-worker version-skew handling |
| Accessibility | NFR16–NFR19 (4) | WCAG 2.1 AA, screen-reader matrix, contrast minimums — implementation-level, not architecture-level |

### Scale & Complexity

- **Primary technical domain:** Single-page PWA · Express backend on AWS · DynamoDB primary + SQLite local fallback · two realtime WebSocket integrations (xAI, OpenAI) · MCP protocol over stdio + Streamable HTTP transports · Stripe billing · OAuth + phone/OTP auth.
- **Project context:** Brownfield. Existing test12 deployed at `https://test12.net` with all four voice modes already wired in. This architecture extends what's there; it does not greenfield design.
- **Complexity level:**
  - *Domain complexity:* LOW (voice-first social/messaging; no regulated industry).
  - *State-transition complexity:* MEDIUM-HIGH (4 modes × 4 transition targets × N mid-flight states; session-lifecycle correctness with financial implications).
  - *Cross-system complexity:* MEDIUM (touches client SPA, Express server, DynamoDB, two external realtime APIs, MCP transport, Stripe-metered addon sessions).
- **Component count for this feature:** ~3 new server-side surfaces (3 MCP tools + 1 new HTTP endpoint or polling extension + telemetry rows reusing existing tables) + 1 client-side state machine + 7 UI components (already specced in UX). Modest.

### Technical Constraints & Dependencies

**Constraints inherited from PRD MVP scope:**

- **No new npm packages for switcher MVP itself.** Tailwind is the documented exception via the precursor migration epic.
- **No new persistence layer.** Mode state is per-tab via `VA_MODE`; reload starts fresh. Per-user persistent default is explicitly Phase 2.
- **No new analytics infra.** Telemetry rides on existing `usage_logs` / `addon_sessions` schema with new event-type rows.
- **No re-architecture of existing connect/disconnect flow.** The switcher coexists with the existing Connect / Disconnect buttons; both pathways work.

**Constraints inherited from UX spec:**

- **Tailwind CSS** is the post-migration styling foundation. Architecture must assume Tailwind is present when implementation begins (precursor epic ships first).
- **Mobile-first PWA**, portrait-locked, iOS-tuned. No new platform-specific code paths.
- **Single-page SPA** (`public/index.html`). All client logic stays inline or in script blocks within that file; no new client modules per project convention.

**Brownfield integration anchors (must honor):**

- `VA_MODE` global enum: `'llm' | 'deluxe-claude' | 'deluxe-xai' | 'deluxe-openai'`
- `updateAgentUI()` function for orb/button label refresh — extend, don't replace
- `dispatchIntent()` function for in-PTT voice-command mode switching — preserve unchanged (FR6, NFR12)
- `mcp-tools.js` shared registry — loaded by both `server.js` (stdio) and `mcp-http.js` (HTTP)
- `addon_sessions` table — session row pattern already exists for tracking minute consumption
- `usage_logs` table — for per-request usage tracking
- `sw.js` cache version `test12-v5` — single bump per major rollout
- Stripe price IDs for paid tiers: `STRIPE_DELUXE_CLAUDE_PRICE_ID`, `STRIPE_DELUXE_XAI_PRICE_ID`, `STRIPE_DELUXE_OPENAI_PRICE_ID`

**External dependencies (already in production, no change):**

- xAI realtime WebSocket: `wss://api.x.ai/v1/realtime?model=grok-voice-latest`
- OpenAI realtime WebSocket: `wss://api.openai.com/v1/realtime?model=gpt-realtime-2`
- Anthropic HTTPS: `https://api.anthropic.com/v1/messages`
- AWS API Gateway WebSocket (for private channels)
- AWS Secrets Manager, SES, SNS (not directly touched by switcher)
- Stripe (not directly touched by switcher — billing rows pass through it)

**Precursor dependencies (must ship before switcher implementation):**

- **Tailwind Migration Epic** — UX-committed precursor. Architecture for the migration itself is out of scope for this doc; we assume Tailwind is in place when switcher implementation starts.

### Cross-Cutting Concerns Identified

Five concerns span the switcher and adjacent systems:

**1. Session lifecycle correctness with financial implication**
- Touches: client audio APIs, realtime WebSockets, server-side `addon_sessions` finalization, billing meter halt, telemetry emission.
- Why it spans: A single mode-exit triggers a coordinated multi-system teardown. Any one component failing while others succeed creates inconsistent state (e.g., "phantom billing" per NFR11).
- Architectural treatment needed: explicit teardown contract per mode, atomic ordering (server-side finalize *before* client-side mode flip), rollback semantics (NFR14).

**2. Server→client mode-state propagation (the deferred decision #1)**
- Touches: MCP tool handlers, client state machine, server data model.
- Why it spans: When an MCP agent calls `switch_to_ptt`, the client needs to know. Today's codebase has no general server-push channel for the public-feed view; only the private-channel WebSocket has it.
- Three viable patterns to choose among: (a) **polling** by client (~once per 5s, MVP-friendly), (b) **per-tab WebSocket** (extend existing AWS API Gateway WS infrastructure), (c) **Server-Sent Events** (new infra, lighter than WS).

**3. MCP-to-UI behavioral parity**
- Touches: MCP tools, the client state machine, the teardown contract.
- Why it spans: Per FR22, MCP-initiated switches must produce the same user-visible outcome as UI-initiated switches. This means the teardown contract has to be invocable from both the client (UI path) and the server (MCP path) — but the actual mechanism is one or the other; we can't have two separate teardown implementations to keep in sync.

**4. Operator analytics surface (the deferred decision #2)**
- Touches: telemetry writes, the existing `usage_logs` / `addon_sessions` tables, a query/aggregation pathway for the operator (BMad).
- Why it spans: Telemetry is data plumbing; the analytics surface is consumer-facing. Both must agree on schema and granularity.
- Two viable patterns: (a) **structured rows in `usage_logs` queried directly by SQL/DynamoDB**, (b) **a small admin REST endpoint** that pre-aggregates and protects raw data.

**5. Brownfield regression prevention (NFR12)**
- Touches: every existing voice flow in `index.html` — posting, threading, channel realtime, auto-read, voice-command mode switching, auth.
- Why it spans: The switcher edits a monolithic 164 KB file. Any change to shared utilities (`updateAgentUI`, `dispatchIntent`, the orb-state code) risks regressing existing flows.
- Architectural treatment: namespace new code (`vmode-*` symbols, separate state-machine module-like region in `index.html`), avoid mutating existing functions where possible (extend via wrapping), explicit regression-test pass per merge.

### Architectural posture going in

The switcher's architecture is **extension-shaped**, not **replacement-shaped**. We're adding:
- One client-side state machine (over existing `VA_MODE`)
- Three MCP tools (new entries in existing registry)
- One new server endpoint (mode-state read/poll) OR extension of existing WS infrastructure
- New telemetry event types (rows in existing tables)
- Seven UI components (new code, post-Tailwind-migration)

We are NOT adding:
- New persistence layers, tables, or schemas
- New external integrations
- New client frameworks (React, Vue) or new build tooling beyond Tailwind
- New auth systems
- New infrastructure (Lambda functions, queues, etc.)

This shapes every downstream architectural decision in the direction of *least new surface area*.

## Starter Template Evaluation

### Not applicable — brownfield project

This is a brownfield project (per Project Context Analysis above and
PRD classification). The mode switcher is being added to an existing
deployed application; there is no starter template to evaluate or
initialize. **No `create-*` command runs.**

The existing test12 codebase serves as the de-facto foundation for
all new work, including this feature. For the sake of downstream
agents, the relevant "starter equivalent" — i.e., the technical
foundation the mode switcher inherits — is summarized below.

### Existing Technical Foundation (the de-facto starter)

**Language & Runtime:**
- Node.js (≥18 implied by `package.json` dependencies)
- Vanilla JavaScript (ES2020+) — no TypeScript
- CommonJS modules on the server (`require()`), ES-module-style
  inline `<script>` blocks in the client

**Server Framework:**
- Express 4.21 (per `package.json`)
- Two entry points:
  - `server.js` — local entrypoint (`node server.js`), also serves
    as MCP stdio transport
  - `lambda.js` + `@vendia/serverless-express` — AWS Lambda
    deployment wrapper
  - `mcp-http.js` + `mcp-lambda.js` — MCP Streamable HTTP transport
    (separate Lambda)

**Client:**
- Single-page PWA, monolithic `public/index.html` (~164 KB)
- Inline `<style>` block (~1,100 lines of CSS) — **slated for
  Tailwind migration as PRD precursor**
- Inline `<script>` blocks (~7,000+ lines of JS) — no framework,
  no build step, no module system
- Service Worker (`public/sw.js`, cache version `test12-v5`)
- Web App Manifest (`public/manifest.json`, portrait-locked,
  standalone display)

**Persistence:**
- **DynamoDB** primary, via `@aws-sdk/client-dynamodb` + `@aws-sdk/lib-dynamodb`
- **SQLite** (`better-sqlite3`) local fallback for dev / offline,
  auto-activated by `db.js` when DynamoDB is unreachable
- Schema: `posts`, `channels`, `channel_messages`, `users` (phone PK),
  `sessions`, `otps`, `channel_members`, `usage_logs`,
  `active_sessions`, `aliases`, `addon_sessions`, `addon_purchases`
- `mysql2` is in `package.json` but is **dead code** (not imported
  anywhere — should be removed in a separate cleanup PR)

**Real-time Transport:**
- AWS API Gateway WebSockets for private-channel real-time delivery
- xAI realtime WS: `wss://api.x.ai/v1/realtime?model=grok-voice-latest`
- OpenAI realtime WS: `wss://api.openai.com/v1/realtime?model=gpt-realtime-2`

**External APIs:**
- Anthropic Claude HTTPS: `https://api.anthropic.com/v1/messages`
  - Standard: `claude-haiku-4-5`
  - Deluxe-Claude: UI labels "Sonnet 4.6" but server requests
    `claude-sonnet-4-5` ← tracked as
    `.github/issue-drafts/sonnet-4-6-label-impl-mismatch.md`

**Auth:**
- Phone number + OTP (custom, via AWS SNS for SMS)
- OAuth: Google (`google-auth-library`) and Apple Sign-In
  (configured but the implementation of Apple SI is out of this
  document's scope)

**Billing:**
- Stripe 22.x for subscription + addon-minute purchases
- Stripe-managed price IDs: `STRIPE_DELUXE_CLAUDE_PRICE_ID`,
  `STRIPE_DELUXE_XAI_PRICE_ID`, `STRIPE_DELUXE_OPENAI_PRICE_ID`,
  `STRIPE_MONTHLY_SUBSCRIPTION_PRICE_ID`

**MCP:**
- `@modelcontextprotocol/sdk` (latest at time of writing)
- Shared tool registry in `mcp-tools.js` (loaded by both stdio
  transport in `server.js` and Streamable HTTP transport in
  `mcp-http.js`)
- Existing tools: `speech_to_text`, `text_to_speech`, `fetch_page`,
  `grok_tool_call`, `parse_post`, `match_reply_target`,
  `create_post`, `list_posts`, `create_private_channel`,
  `join_private_channel`, `send_channel_message`,
  `read_channel_messages`, `join_public_channel`,
  `list_private_channels_I_created`,
  `list_the_private_channels_I_joined`, `get_addon_usage`,
  `list_aliases`, `set_alias`, `remove_alias`
- Pattern: `snake_case` tool names, `server.tool(...)` registration

**Build / Deploy:**
- No build step for the application code (HTML/JS/CSS shipped
  as-is) — **will change with the Tailwind migration precursor:
  a PostCSS+Tailwind CLI build step gets added**
- PowerShell deploy scripts: `deploy.ps1` (prod), `deploy-dev.ps1`
  (dev)
- Hosted on AWS (Lambda + API Gateway, presumably with CloudFront
  + S3 for static assets — not fully spelled out in available
  context)

**Development:**
- `npm start` → `node server.js` (local dev)
- `npm run web` / `npm run dev` → `node web.js` (alternate local
  entrypoint)
- `npm run dev:ui` → `node dev.js` (UI-only dev mode)

### Rationale for "no starter selection"

Three reasons "no starter" is the correct call:

1. **The codebase already exists** — there is no greenfield decision
   to make. Switching to a "proper" framework (Next.js, T3, etc.)
   would be a months-long re-platforming exercise that violates the
   PRD's MVP scope and the project's solo-operator velocity
   constraint.
2. **Existing tech serves the workload well.** Vanilla JS + Express +
   DynamoDB is a credible production stack for the test12 problem
   domain (voice-first social/messaging at modest scale). No
   technical pressure to migrate.
3. **The one foundational change the project IS taking on** — the
   Tailwind migration epic — is being tracked as its own work
   stream, not as a starter-selection decision. That migration is
   the right framing for it.

### What the switcher inherits from this foundation

Every architectural decision in the following sections of this
document is made in the context of:

- **No build step for JS/HTML.** New JS goes in `index.html`
  `<script>` blocks; new HTML goes inline. The only build step is
  the future Tailwind CSS one.
- **No new client framework.** Vanilla DOM manipulation. State
  lives in module-scoped globals (`VA_MODE`, `activeChannelId`,
  etc.).
- **DynamoDB-first persistence with SQLite fallback.** Any new data
  the switcher needs (none planned) would follow this pattern.
- **MCP tool registration in the existing shared registry.** Three
  new tools (`switch_to_ptt`, `get_voice_mode`, `set_voice_mode`)
  fit the existing pattern.
- **Two deployment surfaces.** Anything touching server-side
  behavior must work in both the Express-direct deployment and the
  Lambda-wrapped deployment.

**Note:** Project initialization is NOT the first implementation
story for this feature. The first implementation story is the
Tailwind migration epic (per UX spec). The switcher's first story
is "add the `vmode-badge` component to the existing
`public/index.html` header" — which presumes Tailwind is already in
place.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (block implementation):**

1. **Server→client mode-state push pathway** (deferred from PRD risk table)
2. **MCP tool surface design** (`switch_to_ptt`, `get_voice_mode`, `set_voice_mode`)
3. **Teardown contract / orchestration shape** (the multi-system mode-exit coordination — *revised after WS-architecture clarification*)
4. **Client-side state machine shape** (FSM vs ad-hoc state + reducer)
5. **Mid-flight transition policy** (deferred from PRD FR15/FR17)

**Important Decisions (shape architecture):**

6. **Operator analytics surface** (deferred from PRD Journey 4 / FR28)
7. **Mode metadata data structure** (`MODES` config array shape)
8. **Telemetry event schema** (rows in `usage_logs`)
9. **Cost-tier resolution at runtime** (where mode→tier mapping lives)
10. **Ephemeral token hygiene** (verify TTL + per-user scoping — surfaced by WS-architecture clarification)
11. **Heartbeat tracking for realtime sessions** (NFR11 enforcement under client-direct WS)

**Deferred Decisions (Post-MVP, recorded for future architects):**

- Per-user persistent mode default (storage in `users` table, settings endpoint)
- Per-channel mode memory (`channel_members` table extension)
- Account-balance-aware switching (read `addon_purchases` minutes-remaining)
- Inline session-cost display (live `usage_logs` aggregation)
- "Finish-then-switch" mid-flight policy alternative
- Fully-proxied WebSocket architecture (server-in-the-middle of audio path) — enables provider swap without client redeploys, per-event moderation, full session logging; not needed for MVP

**Already Decided (don't re-decide):**

- Language/runtime: vanilla JS + Node 18 + Express 4.21 (existing)
- Persistence: DynamoDB primary + SQLite fallback (existing)
- Auth: phone+OTP + OAuth, MCP per-user middleware (existing)
- Styling: Tailwind CSS post-migration (UX-committed)
- Component naming: `vmode-*` prefix (UX-committed)
- 4 voice modes, 2 families (PRD-locked)
- Hosting: AWS Lambda + API Gateway + S3/CloudFront (existing)
- Build: Tailwind PostCSS CLI (precursor epic adds this)
- Real-time external: xAI + OpenAI WebSockets, client-direct with server-proxied token minting (existing)

### Data Architecture

**Decision D1: Mode metadata as a static client-side config**

- **Choice:** `MODES` as a single immutable JS array literal in
  `index.html`, with one entry per mode containing: internal id
  (`'llm' | 'deluxe-claude' | 'deluxe-xai' | 'deluxe-openai'`),
  user-facing short name, family (`'ptt' | 'realtime'`), cost tier
  (`'free' | 'paid' | 'premium'`), tier label (`'Free' | '$$' | '$$$'`),
  caption, icon, addon-tier ID (for billing lookup).
- **Rationale:** Mode metadata is small (~4 rows), changes rarely
  (only when adding/removing a provider), and is needed by both the
  badge render and the sheet render. A static client-side array is
  the simplest design that satisfies all FRs. Server-side mirror
  exists only as the validation list for `set_voice_mode` MCP tool.
- **Affects:** UI components, MCP tool validation, telemetry tagging
- **Provided by Starter:** No (new)

**Decision D2: Mode-switch telemetry rows in existing `usage_logs`**

- **Choice:** Reuse the existing `usage_logs` table with a new
  `event_type` column value (`'mode_switch'`), and structured fields
  for `mode_from`, `mode_to`, `source` (`'ui' | 'mcp' | 'voice-command'`),
  `outcome` (`'success' | 'failure' | 'rollback'`), `duration_ms`,
  `error_class` (nullable).
- **Rationale:** PRD MVP scope explicitly says no new tables. The
  `usage_logs` schema already supports event-typed rows; adding new
  event-type values is a zero-migration change in DynamoDB. (For the
  SQLite fallback, the existing `usage_logs` table needs a small
  schema extension; that's still less work than a new table.)
- **Affects:** Server-side mode-switch handler, MCP tool handlers,
  client-side telemetry emitter
- **Provided by Starter:** No (new use of existing table)

**Decision D3: No new persistent state for mode tracking**

- **Choice:** Mode state lives in two places only:
  1. **Client memory** — the existing `VA_MODE` global variable
  2. **Transient server record** — a short-lived "desired mode"
     entry in DynamoDB, only used during MCP-driven switches to
     bridge the server→client gap (TTL ~60s, cleaned up on
     client acknowledgment)
- **Rationale:** Persistent mode preference is explicitly Phase 2.
  MVP doesn't need a `users.default_mode` column. The transient
  "desired mode" record is necessary if we choose polling for the
  push pathway (Decision D5) — it's the bridge between an MCP call
  and the client noticing.
- **Affects:** DynamoDB schema (one new TTL'd key namespace within
  the existing `test12-data` table), MCP tool handlers, polling
  endpoint
- **Provided by Starter:** No (new minor schema use)

### Authentication & Security

**Decision A1: Reuse existing MCP per-user auth middleware**

- **Choice:** The three new MCP tools (`switch_to_ptt`,
  `get_voice_mode`, `set_voice_mode`) use the same auth middleware
  pattern as existing user-scoped tools (`get_addon_usage`,
  `set_alias`, `list_aliases`, `remove_alias`).
- **Rationale:** Per NFR7. The pattern exists, works, and
  introducing a new auth path for these three tools would create
  drift. Reuse minimizes attack surface.
- **Affects:** `mcp-tools.js` tool registrations, `mcp-http.js` HTTP
  auth pipeline
- **Provided by Starter:** Yes (existing pattern)

**Decision A2: New mode-state polling endpoint inherits standard auth**

- **Choice:** `GET /api/voice-mode` (the read-side endpoint for client
  polling — see Decision API2) requires the same session-cookie /
  bearer-token auth as other authenticated `/api/*` endpoints.
- **Rationale:** Mode state is per-user; unauthenticated read would
  leak nothing valuable but would invite abuse. Standard auth is
  effectively free.
- **Affects:** `app.js` route registration
- **Provided by Starter:** Yes (existing pattern)

**Decision A3: No new credentials, no new secrets**

- **Choice:** No new API keys, no new secrets in environment
  variables, no new entries in AWS Secrets Manager.
- **Rationale:** The switcher does not introduce any new external
  integration. All existing keys (`XAI_API_KEY`, `OPENAI_API_KEY`,
  `ANTHROPIC_API_KEY`) stay server-side per NFR9.
- **Affects:** Nothing changes in `.env.example` or deployment
  configuration
- **Provided by Starter:** N/A

**Decision SEC1: Ephemeral token hygiene — verify and tighten TTL + per-user scoping**

- **Issue surfaced by WS-architecture analysis:** With client-direct
  realtime WS (Decision API4), the ephemeral token is briefly held
  in the browser and can be observed via devtools. Anyone who
  captures it can reuse it for the remaining TTL window.
- **Required verification (architecture-level homework before MVP
  ships):**
  1. **Read `/api/session` and `/api/openai-session` implementations
     in `app.js`** and document:
     - Current TTL on each ephemeral token (minutes vs hours)
     - Whether tokens are scoped per-user (the xAI/OpenAI API
       supports per-user `user` field on session creation)
     - Whether token requests are themselves rate-limited per user
  2. **Action items derived from verification:**
     - If TTL is >5 min, **tighten** to the smallest viable value
       (recommend 60-90 s — long enough for the WS to establish,
       short enough that leaked-token reuse is bounded).
     - If tokens are not per-user-scoped, **scope them** (pass the
       authenticated user's ID as the provider's `user` field;
       most realtime API providers honor this).
     - If `/api/session` and `/api/openai-session` are not
       rate-limited, **add per-user rate limiting** (~5 tokens
       per minute) to bound abuse of leaked credentials.
- **Out of MVP scope (but worth knowing):** Provider-side
  enforcement of "this token can only be used by this user" varies
  by provider. Architecture cannot enforce what the provider
  doesn't.
- **Affects:** `/api/session`, `/api/openai-session` server-side
  implementations (may already be correct — verify first)
- **Provided by Starter:** Partial (endpoints exist; their hygiene
  is unknown to this document)

### API & Communication Patterns

**Decision API1: Three new MCP tools, snake_case, following the existing pattern**

- **Choice:** Register three tools in `mcp-tools.js`:
  - `get_voice_mode` — no parameters, returns
    `{ mode_id, mode_name, family, cost_tier, tier_label }` for the
    authenticated user's current state
  - `set_voice_mode` — parameter `{ mode_id: 'llm' | 'deluxe-claude'
    | 'deluxe-xai' | 'deluxe-openai' }`, returns
    `{ ok: true, status: 'requested' | 'completed', previous_mode_id,
    requested_mode_id }`
  - `switch_to_ptt` — no parameters, equivalent to
    `set_voice_mode({ mode_id: 'llm' })` (the convenience escape
    primitive emphasized in PRD FR21)
- **Rationale:** Matches the existing snake_case pattern; the
  `switch_to_ptt` convenience tool is per PRD FR21 (escape must be
  reachable by a single parameterless tool call to maximize agent
  discoverability). `get_voice_mode` is needed for clients that
  poll to confirm MCP-driven changes; `set_voice_mode` is the
  general-purpose primitive.
- **Note on response semantics:** Under client-direct WS, MCP tool
  responses use `status: 'requested'` (server has written desired-
  mode bridge record; client will complete on next sync) rather
  than `status: 'completed'`. Agent-facing message: *"Mode switch
  requested, will complete on next client sync."*
- **Affects:** `mcp-tools.js`, `server.js` (stdio transport),
  `mcp-http.js` (HTTP transport — already shares the registry)
- **Provided by Starter:** Yes (the MCP registration pattern)

**Decision API2: Server→client mode-state propagation via polling (MVP) → WebSocket (Phase 2)**

This is **deferred decision #1**. Three options were considered:

| Option | MVP cost | Latency | Resource cost | Phase 2 ceiling |
|---|---|---|---|---|
| **(a) Client polling** of `GET /api/voice-mode` every 5 seconds | Low — one new endpoint, simple client interval | 5 s worst case (avg ~2.5 s) | One small read per active user per 5 s | Moderate — wastes requests when nothing changes |
| **(b) Per-tab WebSocket** via existing AWS API Gateway WS infrastructure | Medium — requires extending the connection-table model from per-channel to per-user, plus a new server-side push helper | <100 ms | One persistent WS connection per active user (already supported for private channels) | Excellent — this is the right long-term shape |
| **(c) Server-Sent Events** (`text/event-stream` from a new endpoint) | Medium — new transport, not currently used in the codebase | <100 ms | One long-lived HTTP connection per active user | Moderate — adds infra not used elsewhere |

- **Choice:** **Polling for MVP, WebSocket extension for Phase 2.**
  - MVP: `GET /api/voice-mode` returns current mode state + any
    pending desired-mode bridge record; client polls every 5 s
    when an MCP agent is plausibly connected, every 30 s baseline.
    Server includes an ETag/version so the polled response is
    cheap when unchanged.
  - Phase 2: Extend the existing AWS API Gateway WebSocket
    infrastructure (the one currently used per-private-channel) to
    support per-user-session "control plane" connections, and push
    mode changes through that.
- **Rationale:** PRD risk table explicitly documents polling as the
  MVP fallback. The 5 s worst-case latency is acceptable for the
  agent-driven escape use case (user is talking to Claude in
  another tab; they don't expect instant cross-tab sync). Building
  the WS path properly requires extending the existing connection-
  table model and is the wrong battle for MVP.
- **NFR4 (MCP tool ≤1 s)** is preserved — the *MCP tool round-trip
  to the agent* is fast because the server writes the desired-mode
  bridge record and responds; only the *client UI update* takes up
  to 5 s. This matches the spec: NFR4 is about server-acknowledged
  request, not client-UI-reflection.
- **Affects:** New `GET /api/voice-mode` endpoint, transient
  "desired mode" DynamoDB record (Decision D3), client polling
  loop, MCP tool handlers (write "desired mode" record on
  successful switch)
- **Provided by Starter:** No

**Decision API3: Teardown is two-party coordinated, client owns the WS close, server owns billing finalization**

Confirmed via codebase inspection (`index.html:2664-2730`): realtime
WS connections use the **standard ephemeral-key pattern**. Token
minting is server-proxied (the long-lived `XAI_API_KEY` /
`OPENAI_API_KEY` never reach the client), but the audio-bearing
WebSocket connects *directly from browser to provider*
(`wss://api.x.ai/v1/realtime` or `wss://api.openai.com/v1/realtime`),
authenticated via an ephemeral token passed in the WebSocket
subprotocol header.

Architectural consequence: the server **cannot close the realtime
WS itself** — it doesn't hold the reference. The teardown contract
must coordinate two parties.

**Teardown choreography (for UI-initiated switch — Maria's flow):**

1. **Client**: detects user tapped a different mode → enters FSM
   `switching` state
2. **Client**: calls `rtWs.close()` on the active WS (browser closes
   the WS to xAI/OpenAI directly; provider stops billing us at the
   moment of close)
3. **Client**: releases `MediaStreamTrack.stop()` and
   `AudioContext.close()`
4. **Client**: calls `POST /api/voice-mode/end-session` with
   `{ mode_id, ws_close_timestamp }` to inform the server
5. **Server**: finalizes the open `addon_sessions` row (sets
   `ended_at` to the client-reported `ws_close_timestamp`, computes
   `duration_secs`, writes telemetry row per Decision D2)
6. **Server**: responds with success
7. **Client**: flips `VA_MODE`, updates badge to new mode, fires
   ARIA announcement

**Teardown choreography (for MCP-initiated switch — Sofia's flow):**

1. **MCP agent**: calls `switch_to_ptt` on the server
2. **Server**: writes a transient "desired mode" record per Decision
   D3 (`desired_mode = 'llm'`, TTL ~60s)
3. **Server**: responds to MCP agent immediately with
   `{ ok: true, status: 'requested', message: 'Mode switch requested,
   will complete on next client sync.' }` — the agent can now tell
   the user "I've asked test12 to switch"
4. **Client**: on next poll (≤5 s) sees `desired_mode = 'llm'`,
   begins teardown identical to UI flow steps 2-4
5. **Server**: in step 5 of the UI flow, additionally clears the
   "desired mode" record (the bridge has served its purpose)
6. **Client**: completes UI update; the user, glancing at the tab,
   sees the new state

**Phantom billing risk profile (revised for client-direct WS):**

| Risk vector | Mitigation |
|---|---|
| Client closes WS but tab dies before notifying server | **Heartbeat timeout** (Decision OPS1): server tracks last-heartbeat-per-session; if no heartbeat for >30 s while `addon_sessions.ended_at` is null, server auto-finalizes the row. Conservative bound on phantom billing. |
| Server finalizes `addon_sessions` but client WS stays open (server-side state diverges from reality) | **Client confirms WS close BEFORE calling `/api/voice-mode/end-session`**. The endpoint expects the client to have already closed; if it hasn't, the server still finalizes (the client's intent is to leave), but logs a warning so we can detect this pattern. |
| MCP agent calls `switch_to_ptt`, server-side bridge written, but client never polls (offline, page closed) | **Bridge record TTL** (~60 s) — if the client doesn't pick up the desired-mode change within 60 s, the bridge record expires and the agent's call is effectively a no-op. From the agent's perspective, this is observable: a subsequent `get_voice_mode` call still reports the old mode. The MCP tool's response message ("will complete on next client sync") sets correct expectations. |
| Ephemeral token leaks via browser devtools and is reused after the legitimate session ended | **Short token TTL** (Decision SEC1) — bounds the worst-case unauthorized usage to the token's remaining lifetime. |

**NFR11 (zero phantom billing) interpretation under client-direct WS:**

NFR11 needs a slight refinement to be testable with this
architecture:

> *No `addon_sessions` row has its `ended_at` set more than 30 s
> after the corresponding client-side WS close event, measured by
> the gap between `ws_close_timestamp` (reported by client) and
> `addon_sessions.ended_at` (server-side commit time).*

The 30 s slack is the heartbeat-timeout window; in normal operation
the gap is <500 ms (per NFR3). Anything beyond that triggers a
telemetry alert.

**NFR14 (atomic rollback) interpretation:**

If `POST /api/voice-mode/end-session` fails (network drop, server
500), the client has *already closed its WS* (irreversible). The
client must therefore:
1. Retry the endpoint with exponential backoff (3 attempts)
2. If all retries fail: the WS is closed, billing meter never
   stopped server-side. This is recoverable via the heartbeat
   timeout (server auto-finalizes after 30 s). Client surfaces
   a soft warning toast: *"Mode switched. Billing meter
   finalization pending; will complete shortly."*

This is a meaningful weakening from a "fully atomic rollback"
framing. The reality of client-direct WS architecture is that
**WS close is unconditionally committed once initiated** — you
can't "un-close" a WebSocket. The system tolerates this by making
the server-side finalization eventually-consistent within 30 s.

**Affects:** New `POST /api/voice-mode/end-session` handler that
*receives* the client's close notification rather than orchestrating
the close. New server-side heartbeat-tracking logic (Decision OPS1).
Client gets a heartbeat emitter while a realtime WS is active.

**Provided by Starter:** Partial — token-minting endpoints
(`/api/session`, `/api/openai-session`) and `addon_sessions` table
already exist.

**Decision API4: WebSocket architecture stays client-direct (no fully-proxied refactor for MVP)**

- **Confirmed:** Token minting is server-proxied (`/api/session`
  mints xAI ephemeral; `/api/openai-session` mints OpenAI
  ephemeral). The actual realtime WS is **client-direct** from
  browser to provider, authenticated via ephemeral token in the
  WebSocket subprotocol header (`xai-client-secret.${token}` or
  `openai-insecure-api-key.${token}`).
- **Choice for MVP:** Keep this architecture. Build the mode
  switcher's teardown contract (Decision API3) around the
  client-direct constraint.
- **Rejected for MVP:** Fully-proxied WebSocket (server in the
  middle of the audio path) — would add a hop of latency, double
  the bandwidth cost (browser→server→provider), introduce a new
  long-lived-connection scaling concern on Lambda, and provide
  benefits (provider-swap-without-shipping-new-JS, per-event
  moderation, full session logging) that are not in this PRD's
  scope.
- **Recorded as Phase 3 / Vision option:** Fully-proxied WebSocket
  is a real architectural alternative for the future if any of:
  (a) we want to swap realtime providers without client redeploys,
  (b) we want server-side moderation of every event, (c) we want
  full session logging without trusting client. None of these are
  MVP needs.
- **Affects:** Decision API3 shape; Decision SEC1 (token-TTL
  hygiene) is now load-bearing
- **Provided by Starter:** Yes (existing token-minting endpoints
  and direct-WS pattern)

**Decision API5: Operator analytics — structured rows in `usage_logs` + read-only admin endpoint**

This is **deferred decision #2**.

- **Choice:** Combine both options that were on the table:
  - **Data side:** Mode-switch telemetry lives as structured rows in
    `usage_logs` per Decision D2.
  - **Query side:** A new admin-only endpoint `GET /api/admin/voice-mode-stats`
    that aggregates from `usage_logs` and `addon_sessions` for the
    bake-off-relevant metrics (per-mode session count, per-mode
    avg duration, escape rate, re-entry rate, per-realtime-provider
    breakdown).
- **Rationale:** Direct DynamoDB queries from the operator's local
  tools are inconvenient and brittle (schema knowledge required).
  A small read-only endpoint encapsulates the queries and returns
  pre-aggregated JSON. It's still raw telemetry under the hood;
  the endpoint just adds a thin convenience layer for the operator.
  Admin auth gates access — for MVP, this can be the existing
  `ADMIN_SECRET_KEY` pattern visible in `.env.example`.
- **Affects:** New `app.js` route, new aggregation helper in
  `db.js` (or a sibling file), no new persistence
- **Provided by Starter:** Yes (admin-auth pattern exists)

### Frontend Architecture

**Decision FE1: Client-side state machine — explicit FSM in module-scoped object**

- **Choice:** A small FSM object in `index.html`'s script block,
  with explicit states (`idle`, `sheet_open`, `switching`,
  `mid_flight_modal`, `failed`) and explicit transitions. The
  FSM wraps (does not replace) the existing `VA_MODE` global —
  `VA_MODE` remains the source of truth for "what mode is active
  right now"; the FSM tracks "what is the switcher UI doing
  right now."
- **Rationale:** Mode-switch behavior has enough states and
  transitions (per UX spec's 5 user-journey flows) that ad-hoc
  state with boolean flags will get tangled. An explicit FSM
  prevents the impossible-state class of bug (e.g., "switching
  AND mid_flight_modal both true"). No FSM library — a simple
  `{ state, transition(event, payload) }` object is enough.
- **Affects:** New ~100-line FSM region in `index.html`,
  integration with existing `updateAgentUI()` and the badge/sheet/
  modal/toast components
- **Provided by Starter:** No (vanilla)

**Decision FE2: Cost-tier resolution lives in the `MODES` config (client-side)**

- **Choice:** Cost tier is a static property of each mode,
  authored in the `MODES` config (Decision D1), not computed at
  runtime from user account state.
- **Rationale:** Cost tier is a property of the mode, not of the
  user. (A user without Deluxe addons can *see* Sonnet 4.6 in the
  list with the $$ badge; they just can't successfully switch into
  it without first purchasing the addon — that's the existing
  app's behavior, not switcher work.) Account-aware "you can't
  afford this" treatment is Phase 2 (`vmode-row-disabled` variant).
- **Affects:** `MODES` config, badge/row rendering
- **Provided by Starter:** No

**Decision FE3: Extend `updateAgentUI()`, do not replace it**

- **Choice:** The new badge render is a *new call* added to the
  existing `updateAgentUI()` function. The orb / button-label
  refresh logic in `updateAgentUI()` stays unchanged.
- **Rationale:** NFR12 (no regression). `updateAgentUI()` is called
  from multiple places in `index.html` (after voice-command mode
  switches via `dispatchIntent`, after plan/mode discovery, etc.);
  if we replace the function, we risk breaking those callers.
  Adding a `renderVoiceModeBadge()` call inside it gives us the
  badge update everywhere `updateAgentUI()` already fires.
- **Affects:** Minor edit to existing `updateAgentUI()`, new
  `renderVoiceModeBadge()` function
- **Provided by Starter:** Yes (extend-don't-replace pattern is
  best practice for brownfield)

**Decision FE4: Mid-flight transition policy — "Discard with confirmation" for MVP**

This is **deferred decision #3**.

- **Choice:** When a user attempts a mode switch while audio is in
  progress (mid-recording for PTT, mid-streaming for realtime), the
  `vmode-confirm-modal` appears with copy "Switching to {newMode}
  will discard your current {oldMode} recording. Continue?" with
  [Stay] [Switch] buttons. On Switch, audio is discarded, teardown
  proceeds. On Stay, no change.
- **Why "Discard with confirmation" over alternatives:**
  - vs **"Finish current recording, then switch"**: would require
    holding the user's intent in a queue while the in-flight
    recording completes, with significant complexity for the
    edge case of "what if the in-flight recording itself fails
    or times out?" Defer to Phase 2.
  - vs **"Silently discard"**: violates the trust contract
    (UX spec, Step 4: "asking is not friction; asking is trust").
  - vs **"Block the switch until recording completes"**: traps
    users in paid modes longer; defeats the escape purpose.
- **Affects:** `vmode-confirm-modal` component (UX-specced),
  audio-in-progress detection in the state machine, modal
  triggering logic
- **Provided by Starter:** No

**Decision FE5: Mode-switch source attribution at the event-emission boundary**

- **Choice:** Each mode-switch event carries a `source` field
  (`'ui' | 'mcp' | 'voice-command'`). The attribution happens at
  the *entry point* of the FSM transition:
  - UI tap on a `vmode-row` → `source: 'ui'`
  - Server-side mode change picked up by client poll → `source: 'mcp'`
  - `dispatchIntent` regex match → `source: 'voice-command'`
- **Rationale:** Per FR24 + Journey 4, operator needs to attribute
  mode switches to their source for bake-off analysis. The
  cleanest way to track this is at the entry point, where the
  source is unambiguous.
- **Affects:** Three call sites to the FSM (`badge handler`,
  `polling response handler`, `dispatchIntent`), telemetry payload
- **Provided by Starter:** No

### Infrastructure & Deployment

**Decision INFRA1: Tailwind CSS PostCSS CLI build step (precursor epic)**

- **Choice:** Add a `npm run build:css` step that runs
  PostCSS+Tailwind CLI, producing `public/dist/tailwind.css`.
  Update `deploy.ps1` and `deploy-dev.ps1` to invoke the build
  before bundling. Update `sw.js` to include the new CSS file in
  the cache.
- **Rationale:** Per UX spec's Tailwind migration epic. Architecture
  acknowledges this as the precursor; the migration is implemented
  in its own work stream.
- **Affects:** `package.json` (new dev dependencies: `tailwindcss`,
  `postcss`, `autoprefixer`; new `build:css` script), deploy
  scripts, `sw.js` cache list, `tailwind.config.js` (new file),
  `postcss.config.js` (new file)
- **Provided by Starter:** No (precursor scope)

**Decision INFRA2: No new Lambda functions or AWS infrastructure**

- **Choice:** All new server-side endpoints (`GET /api/voice-mode`,
  `POST /api/voice-mode/end-session`,
  `POST /api/voice-mode/heartbeat`,
  `GET /api/admin/voice-mode-stats`) and all new MCP tool handlers
  ride on the existing Express + Lambda deployment shape. The
  MCP HTTP transport (`mcp-http.js` Lambda) already auto-discovers
  tools from `mcp-tools.js` so registering new tools requires no
  Lambda redeploy beyond the standard cycle.
- **Rationale:** Minimize new surface area. The existing deployment
  shape handles the load without modification.
- **Affects:** No infra changes
- **Provided by Starter:** Yes (existing pattern)

**Decision INFRA3: No observability infrastructure beyond existing telemetry**

> ⚠️ **SUPERSEDED 2026-06-11 by Epic 7 (CloudWatch Observability).** This
> deferral no longer holds: CloudWatch is now in scope — EMF custom metrics,
> structured logs, alarms→SNS, an operator dashboard, and X-Ray tracing across
> the three Lambdas. See
> `specs/planning-artifacts/epic-7-cloudwatch-observability.md`. `usage_logs` +
> the API5 admin endpoint are retained (per-user billing/bake-off record);
> CloudWatch is the operational layer added on top. The original MVP rationale
> below is kept for history.

- **Choice (original, superseded):** Mode-switch telemetry rows in `usage_logs`
  (Decision D2) are the entire observability story for MVP. No CloudWatch
  custom metrics, no X-Ray traces, no APM. The admin endpoint
  (Decision API5) is the operator dashboard.
- **Rationale:** Solo-operator project; adding observability infra
  is its own work stream. The existing `usage_logs` reads give
  enough signal for the bake-off decision.
- **Affects:** No infra changes; the question of "add APM later"
  is a separate decision deferred to Phase 2+
- **Provided by Starter:** Yes (existing pattern)

### Operational Decisions

**Decision OPS1: Heartbeat tracking for realtime sessions**

- **Choice:** Client emits a lightweight heartbeat every 10 s
  while a realtime WS is active. Heartbeat is `POST
  /api/voice-mode/heartbeat` with `{ mode_id }`. Server updates
  `addon_sessions.last_heartbeat` (new column or DynamoDB attribute
  on existing row). A periodic server-side cleanup job (or
  lazy-on-read check) auto-finalizes any `addon_sessions` row
  whose `last_heartbeat` is >30 s stale and `ended_at` is null.
- **Rationale:** Required for NFR11 enforcement under client-direct
  WS (Decision API4). Without it, a user who closes the tab
  without notifying the server leaves a billing meter running
  forever (at least until the ephemeral token expires).
  Heartbeat-based cleanup bounds the worst case to 30 s.
- **Affects:** `addon_sessions` schema (new `last_heartbeat`
  attribute), new `/api/voice-mode/heartbeat` endpoint,
  client-side heartbeat emitter (in the realtime-mode connection
  code, alongside the existing WS handling around
  `index.html:2664-2730`), server-side cleanup logic (cron-like
  Lambda OR lazy check on every `addon_sessions` read)
- **Provided by Starter:** Partial (`addon_sessions` exists)

### Decision Impact Analysis

**Implementation Sequence (suggested order for downstream epic
authoring):**

1. **Tailwind Migration Epic** (precursor, NOT part of switcher
   implementation) — INFRA1 ships with this
2. **Pre-flight: SEC1 verification** (~half-day of code reading)
   — confirm ephemeral token TTL + scoping in `/api/session` and
   `/api/openai-session`; fix if needed
3. Switcher Epic 1 — **Foundations**: `MODES` config (D1), FSM
   shell (FE1), badge component (UX), telemetry schema extension
   (D2)
4. Switcher Epic 2 — **Mode-switching mechanics (UI path)**: sheet/
   row components, `updateAgentUI()` extension (FE3), client-side
   teardown choreography per API3, new `POST
   /api/voice-mode/end-session` endpoint, **heartbeat emitter +
   server-side last_heartbeat tracking per OPS1**
5. Switcher Epic 3 — **Mid-flight safety**: audio-in-progress
   detection (FE4), confirmation modal (UX), Stay/Switch flow
6. Switcher Epic 4 — **MCP tool surface**: three tools (API1),
   server→client polling pathway (API2), transient "desired mode"
   record (D3), client polling loop
7. Switcher Epic 5 — **Operator analytics**: structured `usage_logs`
   rows + admin endpoint (API5)
8. (Optional follow-on) Sonnet 4.5/4.6 model ID fix (per the
   tracked issue draft)

**Cross-Component Dependencies:**

- **API3 (teardown contract)** is invoked by Epic 2 (UI path) AND
  Epic 4 (MCP path) — shared client-side state machine, must ship
  in Epic 2 with Epic 4 wiring up later.
- **OPS1 (heartbeat)** is a hard prerequisite for NFR11 correctness
  — must ship in Epic 2 alongside the first end-session endpoint,
  not later.
- **D3 (transient "desired mode" record)** is only used by Epic 4
  (MCP path). Schema impact is minimal but must be designed before
  Epic 4 starts.
- **The polling client loop (API2)** spans Epic 2 (basic polling
  infrastructure for `get_voice_mode`) and Epic 4 (actual MCP-
  driven state changes to poll for). Polling can land in Epic 2
  reading a placeholder endpoint, with Epic 4 making the endpoint
  meaningful.
- **Tailwind migration (INFRA1)** is a hard precursor to ALL
  switcher epics — no switcher code ships until Tailwind is in
  place.
- **SEC1 verification** must complete before Epic 4 (MCP) because
  Epic 4 increases the surface area on which ephemeral-token
  abuse could be exploited.

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

**Critical Conflict Points Identified:**

For a brownfield extension, most naming and structural patterns are
pre-determined by the existing codebase — AI agents must follow
existing patterns, not invent new ones. The conflict points that
remain are:

1. Where to place new client-side switcher code in the monolithic
   `index.html`
2. Whether to introduce new naming conventions for switcher-specific
   constructs (CSS classes, FSM states, telemetry event types,
   endpoint paths, MCP tool names)
3. How to wire new functionality into existing functions
   (`updateAgentUI`, `dispatchIntent`, the realtime-WS connection
   code) without breaking them
4. How the switcher's new operational concepts (heartbeats, desired-
   mode bridge records, ephemeral end-session events) interact with
   the existing data and event flows

The patterns below address each of these.

### Naming Patterns (inherited from existing codebase)

The existing test12 codebase establishes these conventions. The
switcher follows them; AI agents must not deviate.

**Database / DynamoDB naming (existing):**

- Table/collection names: `posts`, `channels`, `channel_messages`,
  `users`, `usage_logs`, `addon_sessions`, etc. — **plural,
  snake_case, all lowercase**
- Column / attribute names: `user_id`, `created_at`, `parent_id`,
  `ended_at`, `duration_secs` — **snake_case, all lowercase**
- Primary keys: phone-number-based for users, app-generated IDs
  elsewhere; **the switcher adds no new tables, so no new PK
  decisions**
- Timestamps: ISO 8601 strings stored as TEXT in DynamoDB and
  SQLite (per `db.js`)

**API endpoint naming (existing):**

- Path prefix: `/api/`
- Hyphen-separated segments: `/api/voice-posts`, `/api/parse-post`,
  `/api/claude-chat`, `/api/match-reply-target`
- Plural for collections (`/api/voice-posts`), singular for actions
  (`/api/parse-post`)
- HTTP methods: standard REST verbs (POST for create + side-effectful
  reads where xAI/OpenAI are involved, GET for pure reads)
- Authentication: `requireAuth` middleware on user-scoped endpoints
  (per existing `app.js` pattern around line 75+)

**Switcher endpoint naming (new — follows existing pattern):**

- `GET  /api/voice-mode` — read current mode + any pending bridge record
- `POST /api/voice-mode/end-session` — client informs server of WS close
- `POST /api/voice-mode/heartbeat` — heartbeat for realtime sessions
- `GET  /api/admin/voice-mode-stats` — operator analytics (admin auth)

**MCP tool naming (existing convention, established):**

- Tool names: `snake_case` (per `mcp-tools.js` — `create_post`,
  `join_public_channel`, `get_addon_usage`, etc.)
- Tool parameters: `snake_case` keys in input schema
- Tool response: JSON objects, fields in `snake_case`

**Switcher MCP tool naming (new — follows existing pattern):**

- `get_voice_mode` (no params)
- `set_voice_mode` (`{ mode_id }`)
- `switch_to_ptt` (no params)

**JavaScript naming (existing):**

- Function names: `camelCase` — `updateAgentUI`, `dispatchIntent`,
  `setActiveChannel`, `loadPublicPosts`, `ptSpeak`, etc.
- Variable names: `camelCase` for normal vars
  (`currentUser`, `activeChannelId`, `connectBtn`), **`SCREAMING_SNAKE_CASE`
  for module-scoped constants** (`VA_MODE`, `MAX_LEVEL`,
  `CLAUDE_MODEL`, `XAI_API_KEY`)
- File names: `kebab-case.js` for top-level files (`app.js`,
  `db.js`, `mcp-tools.js`, `mcp-http.js`, `ws-handler.js`,
  `ws-broadcast.js`)
- DOM IDs in HTML: `kebab-case` (`connect-btn`, `disconnect-btn`,
  `addon-usage-bars`, `public-channel`, `private-channels-created`)
- CSS classes: `kebab-case` with feature prefixes
  (`.aub-row`, `.channel-panel`, `.header-login-link`)

**Switcher JavaScript naming (new — follows existing pattern):**

- Functions: `camelCase` — `renderVoiceModeBadge`, `openVoiceSheet`,
  `closeVoiceSheet`, `requestModeSwitch`, `tearDownRealtimeSession`,
  `emitSwitcherTelemetry`
- Constants: `SCREAMING_SNAKE_CASE` — `MODES` (the mode array),
  `HEARTBEAT_INTERVAL_MS` (10000), `BRIDGE_TTL_MS` (60000),
  `POLL_INTERVAL_ACTIVE_MS` (5000), `POLL_INTERVAL_BASELINE_MS`
  (30000)
- Module-scoped variables: `camelCase` — `vmodeFsm`,
  `vmodePollTimer`, `vmodeHeartbeatTimer`
- DOM IDs: `kebab-case` with `vmode-` prefix — `vmode-badge`,
  `vmode-sheet`, `vmode-confirm-modal`, `vmode-toast`,
  `vmode-aria-live`
- CSS classes: `kebab-case` with `vmode-` prefix — all `vmode-*`
  classes per UX spec Component Strategy

**Telemetry event-type naming (existing pattern in `usage_logs`):**

- Existing `event_type` values: implied by codebase (e.g.,
  `'claude_chat'` per `app.js:1274`'s `logUsage` call with `model`
  field; exact `event_type` values not directly visible)
- **Switcher convention:** `snake_case` event types, prefixed where
  feature-scoped:
  - `'mode_switch'` — every switch attempt and outcome
  - `'mode_heartbeat'` (optional — could be a counter instead of
    rows; decided in implementation)
  - `'addon_session_auto_finalized'` — heartbeat-timeout cleanup
    fires this

### Structure Patterns

**Client-side code placement (the monolithic-`index.html` question):**

- The switcher's JS lives in a **named region** inside the existing
  `<script>` block in `index.html`, marked with a clear comment
  banner:
  ```js
  // ═══════════════════════════════════════════════════
  //  Voice-Mode Switcher (PRD: voice-mode-switcher)
  //  Components, FSM, polling, heartbeat, telemetry.
  //  All symbols prefixed `vmode*` for traceability.
  // ═══════════════════════════════════════════════════
  ```
- All switcher symbols (functions, constants, DOM IDs, CSS classes)
  carry the `vmode` / `VMODE_` / `vmode-` prefix per the conventions
  above. This makes the boundary explicit when reading or grep'ing
  the file.
- **DO NOT extract into a separate `public/voice-mode.js` file.**
  The existing project convention is "everything in `index.html`";
  introducing a second JS file fragments the convention and
  breaks the service-worker's cache strategy without a paired update.
  If a future refactor extracts modules, that's a separate decision.

**Server-side code placement:**

- New endpoints (`GET /api/voice-mode`, `POST /api/voice-mode/end-session`,
  `POST /api/voice-mode/heartbeat`, `GET /api/admin/voice-mode-stats`)
  go in **`app.js`**, grouped under a banner comment marker similar
  to existing groupings (`// ── STT Proxy — POST /api/stt`).
- Persistence helpers (read/write `desired_mode` bridge records,
  read/write `last_heartbeat` on `addon_sessions`, aggregation
  queries for stats endpoint) go in **`db.js`**, following the
  existing function-export pattern.
- New MCP tool handlers go in **`mcp-tools.js`** inside
  `registerTools(server, z)`, following the existing
  `server.tool('name', schema, handler)` pattern.
- **No new top-level JS files.** The switcher adds zero new modules
  at the file level.

**Test placement (existing convention in test12 codebase):**

- The existing codebase has limited automated test coverage; manual
  testing is the established norm (per PRD Scoping section: "no
  separate QA — the operator owns testing").
- **Switcher follows the existing norm.** Manual regression checks
  per NFR12, manual transition matrix per UX spec testing strategy.
  If/when test infrastructure is added project-wide, that's a
  separate decision; the switcher does not introduce its own test
  framework.

**ADR-2026-06-11 — Adopt `@playwright/test` as the project test framework
(amends the "existing norm" bullet above):**

- **Context:** The operator directed adopting a real TDD framework
  (overriding the manual-only norm) so each story ships with executable,
  story-scoped tests written test-first.
- **Decision:** Adopt **`@playwright/test`** as the single project test
  framework. Rationale: the app is a monolithic `index.html` that only a
  real browser can boot (jsdom cannot load it), so browser-capable testing
  is mandatory; Playwright + Chromium is already vendored (Story 0.10). One
  suite runs both pure-node checks (Tailwind tokens, class coverage) and
  real-browser checks (a11y audit, vmode FSM, and future switcher UI
  stories — badge, sheet, transitions).
- **Consequences:** `npm test` runs the suite; specs live in
  `tests/*.test.js`; a loopback static server (`tests/support/serve.js`)
  provides a real origin via Playwright's `webServer`. AR12 still holds —
  tests are not switcher *implementation* code, so the switcher adds no new
  top-level implementation module. This supersedes the "switcher does not
  introduce its own test framework" clause: the framework is now
  project-wide, not switcher-specific.

### Format Patterns

**API request / response formats:**

- Request bodies: JSON, `snake_case` keys, `Content-Type:
  application/json`
- Success response: bare JSON object with the relevant fields;
  **no envelope wrapper** like `{ data: ..., error: ... }` (matches
  existing pattern, e.g., `/api/voice-posts` returns `{ post }`
  directly)
- Error response: `{ error: "<short message>" }` with appropriate
  HTTP status code (matches existing pattern, e.g.,
  `res.status(400).json({ error: '...' })` throughout `app.js`)
- For paid-tier-required errors specifically: `402 Payment Required`
  with `{ error, message }` (matches existing pattern visible at
  `index.html:2674` `if (res.status === 402)`)
- Date/time in JSON: ISO 8601 strings (matches existing pattern)

**Telemetry row format (in `usage_logs`):**

```yaml
# Existing usage_logs row pattern (extended with switcher fields)
id: <generated string>
user_id: <user phone or ID>
event_type: 'mode_switch'   # NEW value
ts: <ISO 8601 string>
# Switcher-specific structured fields (NEW):
mode_from: 'deluxe-openai'
mode_to: 'llm'
source: 'ui'                 # 'ui' | 'mcp' | 'voice-command'
outcome: 'success'           # 'success' | 'failure' | 'rollback'
duration_ms: 423
error_class: null            # populated only on failure
```

For the SQLite local-fallback table, these fields require a small
schema extension to `usage_logs`; the implementation epic adds the
necessary `ALTER TABLE` (or replicates the DynamoDB-flexible-schema
approach with a JSON `details` blob column).

**Mode-state JSON shape (for `GET /api/voice-mode` and MCP tools):**

```json
{
  "current": {
    "mode_id": "llm",
    "mode_name": "Haiku 4.5",
    "family": "ptt",
    "cost_tier": "free",
    "tier_label": "Free"
  },
  "desired": null,
  "version": "<ISO 8601 timestamp of last change, for ETag>"
}
```

When a desired-mode bridge record exists (MCP agent has requested
a change), `desired` is populated with the same shape minus the
session-state fields. Client uses the presence of `desired` to know
to initiate teardown.

### Communication Patterns

**FSM transition pattern:**

- All state transitions go through `vmodeFsm.transition(event,
  payload)`. Direct mutation of `vmodeFsm.state` is forbidden.
- Events are `snake_case` strings: `'badge_tapped'`,
  `'row_tapped'`, `'modal_stay'`, `'modal_switch'`,
  `'teardown_complete'`, `'teardown_failed'`,
  `'mcp_bridge_picked_up'`.
- The transition function logs every transition via the existing
  `console.log` patterns (with the `[reply-flow]` style prefix used
  elsewhere in the codebase: `[vmode-fsm] idle → sheet_open
  (badge_tapped)`).

**Source attribution at FSM entry points (Decision FE5):**

- Every event that originates a mode-switch attempt MUST include a
  `source` field. The three legal values are: `'ui'`, `'mcp'`,
  `'voice-command'`.
- The three entry points:
  1. Click handler on `vmode-row` → `vmodeFsm.transition('row_tapped',
     { mode_id, source: 'ui' })`
  2. Polling-response handler when `desired` is present →
     `vmodeFsm.transition('mcp_bridge_picked_up',
     { mode_id, source: 'mcp' })`
  3. `dispatchIntent` regex match (existing code, minor extension)
     → `vmodeFsm.transition('voice_command_match',
     { mode_id, source: 'voice-command' })`

**Server endpoint call pattern (client-side):**

- All client calls to switcher endpoints use the existing `fetch`
  pattern with `authHeaders()` (per `index.html` existing usage).
- Retries with exponential backoff for `POST /api/voice-mode/end-session`
  per the Decision API3 fallback (3 attempts, 250 ms / 500 ms / 1000 ms).
- No new HTTP client library. No `axios`. Native `fetch` only.

**Heartbeat emission pattern:**

- Heartbeat fires every `HEARTBEAT_INTERVAL_MS` (10000) while a
  realtime WS is active. Implemented with `setInterval`, cleared
  when the WS is closed (either by user-initiated switch or
  unexpected close).
- Heartbeat is fire-and-forget from the client — failures are
  logged but do not interrupt the user.

**ARIA live-region pattern:**

- A single `<div id="vmode-aria-live" aria-live="polite"
  aria-atomic="true" class="sr-only">` lives in the header chrome,
  persistent for the app lifetime.
- All mode-change announcements update the text content of this
  single region; screen readers pick up each change.
- Per NFR19: format is *"Switched to {newMode}, {tier} tier.
  {Old realtime session, if any} closed."*

### Process Patterns

**Error handling pattern:**

- Server-side: `try { ... } catch (e) { console.error('<endpoint>
  error:', e); res.status(500).json({ error: e.message }); }` —
  matches the prevalent pattern in `app.js` (e.g., line 603 in
  `/api/parse-post`).
- Client-side: errors during teardown surface as `vmode-toast` per
  UX spec; errors during polling are logged but do not toast (would
  be noisy and not actionable for the user).
- MCP tool errors: standard MCP error response shape (existing SDK
  pattern); message strings are user-facing-quality because the
  calling agent will paraphrase them to the user.

**Loading state pattern:**

- Switcher loading states use the existing pattern from the
  existing codebase: in-element visual change rather than spinners.
  Per UX spec, the badge dims to `opacity-60` with text
  "Switching…" — no separate spinner element.
- The toast UI does not have a loading state (it's transient by
  definition).
- Polling is invisible to the user; no loading indicator.

**Retry pattern:**

- Switcher uses **bounded exponential backoff** for the
  `/api/voice-mode/end-session` call (the one client→server
  notification that must succeed for correctness). 3 attempts at
  250 / 500 / 1000 ms. Beyond that, surface the soft warning
  toast and rely on the heartbeat-timeout fallback (OPS1).
- All other endpoints (heartbeat, polling) are fire-and-forget;
  no retry. Next interval gets a fresh attempt.
- MCP tool calls: standard MCP error propagation; the agent
  decides whether to retry.

**Logging pattern:**

- Server-side: existing `console.log` / `console.warn` /
  `console.error` pattern (visible throughout `app.js`,
  `db.js`, `mcp-tools.js`). No structured logger introduced.
- Client-side: existing pattern of prefixed `console.log`
  (`'[reply-flow]'`, `'[ws]'`, `'[agent]'`). Switcher uses
  `'[vmode-fsm]'`, `'[vmode-poll]'`, `'[vmode-tdown]'`,
  `'[vmode-heartbeat]'` prefixes for greppability.

### Enforcement Guidelines

**All AI Agents implementing switcher code MUST:**

1. Use the `vmode-*` / `VMODE_` / `vmodeFsm` naming prefix for ALL
   new switcher symbols (functions, constants, DOM IDs, CSS classes,
   FSM events).
2. Place new client code inside the marked "Voice-Mode Switcher"
   region in `index.html` — NOT in a new file.
3. Place new server endpoints in `app.js` and new persistence
   helpers in `db.js` — NOT in new files.
4. Register MCP tools via `server.tool(...)` in `mcp-tools.js`,
   matching the existing pattern exactly.
5. Use `snake_case` for all JSON keys, MCP tool names, telemetry
   event types, FSM event names, and DynamoDB attributes.
6. Use `camelCase` for JS function names and variables;
   `SCREAMING_SNAKE_CASE` for constants.
7. Wrap, do not replace, existing functions
   (`updateAgentUI`, `dispatchIntent`) — preserve all current
   callers' behavior.
8. Emit FSM transitions only via `vmodeFsm.transition(...)`;
   never mutate state directly.
9. Tag every mode-switch telemetry row with `source` ∈
   `{'ui', 'mcp', 'voice-command'}`.
10. Use the existing `authHeaders()` and `requireAuth` middleware;
    do NOT introduce new auth paths.

**Pattern enforcement (manual, per solo-operator velocity
constraint):**

- Code review pass before merge — operator (BMad) inspects each
  PR for adherence to these patterns.
- No automated linter for these patterns in MVP. (A future
  follow-up could add ESLint custom rules; out of switcher scope.)
- Pattern violations should be documented as Architecture Decision
  Records (ADRs) in this `architecture.md` document for future
  revisits.

### Pattern Examples

**Good examples (do this):**

```js
// Naming: vmode prefix, camelCase function, SCREAMING_SNAKE_CASE constant
const HEARTBEAT_INTERVAL_MS = 10000;
function startVmodeHeartbeat() { /* ... */ }
const vmodeFsm = { state: 'idle', transition(event, payload) { /* ... */ } };

// FSM transition through the contract
vmodeFsm.transition('row_tapped', { mode_id: 'llm', source: 'ui' });

// Error handling on server endpoint matches existing app.js style
app.post('/api/voice-mode/end-session', requireAuth, async (req, res) => {
  try {
    const { mode_id, ws_close_timestamp } = req.body;
    await db.finalizeAddonSession(req.user.id, ws_close_timestamp);
    res.json({ ok: true });
  } catch (e) {
    console.error('voice-mode/end-session error:', e);
    res.status(500).json({ error: e.message });
  }
});
```

```css
/* CSS class naming: vmode prefix, kebab-case */
.vmode-badge { /* ... */ }
.vmode-badge-free { /* ... */ }
.vmode-sheet { /* ... */ }
.vmode-row[aria-current="true"] { /* ... */ }
```

**Anti-patterns (do NOT do this):**

```js
// BAD: new file
// public/voice-mode.js — DOES NOT EXIST and SHOULD NOT EXIST
// Switcher code lives in index.html alongside everything else.

// BAD: direct state mutation
vmodeFsm.state = 'sheet_open';  // never; always use .transition()

// BAD: camelCase JSON key (breaks existing snake_case convention)
res.json({ modeId: 'llm', costTier: 'free' });
// GOOD:
res.json({ mode_id: 'llm', cost_tier: 'free' });

// BAD: replacing the function
function updateAgentUI() {
  // ... rewritten from scratch ...
}
// GOOD: extending it
function updateAgentUI() {
  /* existing body */
  renderVoiceModeBadge();  // new call, existing body untouched
}

// BAD: new auth path
app.post('/api/voice-mode/end-session', (req, res) => {  // missing requireAuth!
  // ...
});
// GOOD: reuse existing middleware
app.post('/api/voice-mode/end-session', requireAuth, async (req, res) => {
  // ...
});

// BAD: new HTTP library
const axios = require('axios');  // no new dependencies
// GOOD: native fetch + existing patterns
const res = await fetch('/api/voice-mode', { headers: authHeaders() });
```

```css
/* BAD: introducing a new prefix or no prefix */
.badge { /* could collide with existing or future global */ }
.voice-mode-badge { /* inconsistent with vmode- prefix decision */ }
/* GOOD */
.vmode-badge { /* clear ownership */ }
```

## Project Structure & Boundaries

### Complete Project Directory Structure

The structure below shows the existing test12 layout with switcher
additions clearly marked. **New files are prefixed with `+`; new
regions within existing files are noted in comments.**

```
test12/
├── README.md                            # existing — partially stale
├── package.json                         # MODIFIED: add tailwindcss, postcss, autoprefixer (Tailwind precursor)
├── package-lock.json                    # auto-updated
├── server.js                            # existing — MCP stdio + local entry point (no changes for switcher)
├── lambda.js                            # existing — AWS Lambda wrapper (no changes for switcher)
├── app.js                               # MODIFIED: add 4 new endpoints (see below)
├── db.js                                # MODIFIED: add finalizeAddonSession, getDesiredMode, setDesiredMode, clearDesiredMode, recordVoiceModeSwitch, getVoiceModeStats helpers
├── mcp-tools.js                         # MODIFIED: register 3 new MCP tools (switch_to_ptt, get_voice_mode, set_voice_mode)
├── mcp-http.js                          # existing — auto-discovers from mcp-tools.js, no direct changes
├── mcp-lambda.js                        # existing — AWS Lambda wrapper for MCP HTTP
├── ws-handler.js                        # existing — private-channel WS connect/disconnect (no changes)
├── ws-broadcast.js                      # existing — private-channel broadcast (no changes)
├── web.js                               # existing — alt local entry point (no changes)
├── scratch-xai.js                       # existing — dev/test scratch (no changes)
├── clear-ws-connections.js              # existing — maintenance script (no changes)
├── deploy.ps1                           # MODIFIED: invoke `npm run build:css` before bundling
├── deploy-dev.ps1                       # MODIFIED: invoke `npm run build:css` before bundling
+├── tailwind.config.js                  # NEW (Tailwind precursor): theme.extend with brand tokens
+├── postcss.config.js                   # NEW (Tailwind precursor): postcss-loader config
├── public/
│   ├── index.html                       # MODIFIED: new "Voice-Mode Switcher" region (DOM + script); class-name churn from Tailwind migration
│   ├── manifest.json                    # existing — no changes
│   ├── sw.js                            # MODIFIED: bump CACHE_VERSION to test12-v6 once at end of Tailwind migration; include tailwind.css in STATIC_ASSETS
│   ├── icon-192.png                     # existing — no changes
│   ├── icon-512.png                     # existing — no changes
+│   └── dist/
+│       └── tailwind.css                 # NEW (Tailwind precursor): build output, served alongside index.html
├── .github/
│   └── issue-drafts/
│       └── sonnet-4-6-label-impl-mismatch.md  # existing — companion code-fix tracker
├── _bmad/                               # existing — bmad-method tooling
├── _bmad-output/
│   └── planning-artifacts/
│       ├── prd.md                        # existing (this PRD)
│       ├── implementation-readiness-report-2026-05-27.md  # existing
│       ├── ux-design-specification.md    # existing
│       └── architecture.md               # existing (this document)
├── bmalph/                              # existing — project descriptor
├── .ralph/                              # existing — implementation-loop config
├── .env.example                         # existing — verify SEC1 items here (token TTL, scoping)
├── .env                                 # existing (git-ignored) — actual secrets
├── .gitignore                           # existing — update if Tailwind adds build artifacts to ignore
└── node_modules/                        # auto-managed
```

**What's NOT added** (deliberately):

- ❌ `public/voice-mode.js` — switcher code stays inline in `index.html`
- ❌ `public/voice-mode.css` — styles live in Tailwind utilities + `@apply`-composed `vmode-*` classes in the Tailwind build
- ❌ `voice-mode-service.js` or `voice-mode-handler.js` server-side — endpoints go in `app.js`, helpers go in `db.js`
- ❌ `test/`, `tests/`, `__tests__/`, or any test framework infra — manual testing per existing project convention
- ❌ New Lambda functions or AWS infrastructure beyond what's deployed
- ❌ Any new top-level JS file at all

### Architectural Boundaries

**API Boundaries (new switcher endpoints, in `app.js`):**

| Endpoint | Auth | Purpose | Owns |
|---|---|---|---|
| `GET /api/voice-mode` | `requireAuth` (per-user) | Read current mode + pending desired-mode bridge record | Reading `addon_sessions` for active session, reading `desired_mode` bridge record |
| `POST /api/voice-mode/end-session` | `requireAuth` | Client informs server WS has been closed | Finalizing `addon_sessions` row, writing telemetry |
| `POST /api/voice-mode/heartbeat` | `requireAuth` | Keep-alive while realtime WS is active | Updating `addon_sessions.last_heartbeat` |
| `GET /api/admin/voice-mode-stats` | `requireAdminAuth` (existing `ADMIN_SECRET_KEY` pattern) | Aggregate mode-switch + session data for operator analytics | Read-only aggregation across `usage_logs` + `addon_sessions` |

**MCP tool boundaries (new tools in `mcp-tools.js`):**

| Tool | Auth | Owns |
|---|---|---|
| `get_voice_mode` | Per-user (existing MCP middleware) | Read-only view of mode state |
| `set_voice_mode` | Per-user | Write `desired_mode` bridge record; the actual mode change happens client-side on next poll |
| `switch_to_ptt` | Per-user | Convenience: `set_voice_mode({ mode_id: 'llm' })` |

**Authentication & authorization boundaries:**

- **All switcher endpoints + MCP tools** are user-scoped — no public/anonymous access
- **Admin endpoint** uses a separate auth path (existing `ADMIN_SECRET_KEY`)
- **Cross-user isolation** enforced at the auth-middleware level: each handler can only read/write `addon_sessions` / `desired_mode` for the authenticated user (NFR8)

**Data access boundaries (in `db.js`):**

All persistence touches go through `db.js`. Switcher does not introduce
direct DynamoDB calls from `app.js` or `mcp-tools.js`. New helpers:

```js
// db.js — new functions for the switcher
exports.finalizeAddonSession = async (userId, wsCloseTimestamp) => { /* ... */ };
exports.recordHeartbeat = async (userId, sessionId) => { /* ... */ };
exports.autoFinalizeStaleHeartbeats = async () => { /* heartbeat-timeout cleanup */ };
exports.getDesiredMode = async (userId) => { /* ... */ };
exports.setDesiredMode = async (userId, modeId) => { /* with TTL */ };
exports.clearDesiredMode = async (userId) => { /* called after client picks up */ };
exports.recordVoiceModeSwitch = async (userId, params) => { /* writes usage_logs row */ };
exports.getVoiceModeStats = async (windowSpec) => { /* aggregation for admin endpoint */ };
exports.getCurrentVoiceModeState = async (userId) => { /* { current, desired, version } shape */ };
```

### Requirements to Structure Mapping

The switcher's 31 FRs and 19 NFRs map to specific files and regions:

**Voice Mode Control (FR1–FR6) — UI surface + state:**

- DOM: `index.html` — new `vmode-badge`, `vmode-sheet`,
  `vmode-aria-live` elements in the header region
- Render: `index.html` "Voice-Mode Switcher" script region —
  `renderVoiceModeBadge()`, `renderVoiceSheet()`, `openVoiceSheet()`,
  `closeVoiceSheet()`
- State: `vmodeFsm` object + `MODES` constant
- Existing integration: extend `updateAgentUI()` to call
  `renderVoiceModeBadge()`; extend `dispatchIntent()` regex match
  path to route through `vmodeFsm.transition('voice_command_match',
  ...)` (FR6 preservation)

**Cost Transparency (FR7–FR9) — `MODES` config + CSS:**

- Data: `MODES` constant in `index.html` (each entry has
  `cost_tier`, `tier_label`)
- Render: `vmode-row-chip` CSS classes in the Tailwind build
  (`vmode-row-chip-free`, `-paid`, `-premium`)
- Color-only avoidance: text/symbol redundancy in chip content
  (the Tailwind class supplies background color; the inner text
  is "Free", "$$", or "$$$")

**Session Lifecycle Management (FR10–FR15) — coordination across client + server:**

- Client teardown: `index.html` — `tearDownRealtimeSession(mode)`
  invokes `rtWs.close()`, `MediaStreamTrack.stop()`,
  `AudioContext.close()` (extending existing realtime-WS code
  around `index.html:2664-2730`)
- Server finalization: `POST /api/voice-mode/end-session` handler
  in `app.js`, delegating to `db.finalizeAddonSession()`
- State preservation: NOT a code path — it's a *non-action*. The
  switcher does not touch the compose box, scroll position, or
  conversational-step state. These survive simply because the
  switch does not navigate or re-render the surrounding app.

**Mid-Flight Transition Safety (FR16–FR18) — FSM state + modal:**

- Audio-in-progress detection: `vmodeFsm` checks `rtIsConnected`
  (existing global from `index.html:2664-2730` region) and/or
  current recording state
- Modal: `vmode-confirm-modal` DOM element + render function
- Flow: `vmodeFsm.transition('row_tapped', ...)` →
  if audio in progress → transition to `mid_flight_modal`;
  else → directly to `switching`

**MCP Tool Surface (FR19–FR23) — server-side:**

- Tool registrations: `mcp-tools.js` — three `server.tool(...)`
  calls
- Tool implementation: each handler calls into `db.js` helpers
  (`db.setDesiredMode`, `db.getCurrentVoiceModeState`)
- Auth: reuses existing MCP per-user middleware

**Observability & Telemetry (FR24–FR28) — `usage_logs` + admin endpoint:**

- Write side: every mode-switch event calls
  `db.recordVoiceModeSwitch(...)` from one of three places:
  - `app.js` `POST /api/voice-mode/end-session` handler (UI path)
  - `mcp-tools.js` `set_voice_mode` handler (MCP path)
  - `index.html` `vmodeFsm` (client-side for voice-command source)
- Read side: `GET /api/admin/voice-mode-stats` in `app.js`,
  delegating to `db.getVoiceModeStats()`

**Accessibility (FR29–FR31) — UX-component-level, no separate code:**

- Handled at the component level per UX spec; no separate
  architectural surface

### Integration Points

**Internal communication patterns:**

| From | To | Mechanism | Frequency |
|---|---|---|---|
| `vmode-badge` click handler | `vmodeFsm.transition('badge_tapped')` | Function call | Per user tap |
| `vmodeFsm` | `renderVoiceModeBadge()` / `renderVoiceSheet()` | Function call | Per transition |
| `vmodeFsm` (in `switching` state) | `tearDownRealtimeSession()` | Function call | Per switch |
| `tearDownRealtimeSession()` | `POST /api/voice-mode/end-session` | `fetch()` with retry | Per switch (1-3 attempts) |
| Client polling loop | `GET /api/voice-mode` | `fetch()` | Every 5 s active / 30 s baseline |
| Client (during realtime session) | `POST /api/voice-mode/heartbeat` | `fetch()` | Every 10 s |
| MCP tool handler | `db.setDesiredMode()` | Function call (server) | Per MCP call |
| Client poll handler | `vmodeFsm.transition('mcp_bridge_picked_up', ...)` | Function call | When polling detects `desired` |
| `dispatchIntent()` (existing) | `vmodeFsm.transition('voice_command_match', ...)` | Function call (new wiring) | Per matching voice command |

**External integrations (no changes — existing behavior):**

- xAI realtime WS: `wss://api.x.ai/v1/realtime` (client-direct,
  per Decision API4)
- OpenAI realtime WS: `wss://api.openai.com/v1/realtime` (client-direct)
- Anthropic HTTPS: existing `/api/claude-chat` flow
- AWS API Gateway WebSocket: existing private-channel transport
- Stripe: existing addon-minute billing

**Data flow — UI-initiated switch (Maria's flow):**

```
User taps vmode-badge
  → vmodeFsm.transition('badge_tapped')
  → vmode-sheet opens
User taps vmode-row[mode_id='llm']
  → vmodeFsm.transition('row_tapped', { mode_id: 'llm', source: 'ui' })
  → tearDownRealtimeSession(current_mode):
      rtWs.close()
      mic.stop()
      AudioContext.close()
  → fetch POST /api/voice-mode/end-session { mode_id, ws_close_timestamp }
      → db.finalizeAddonSession(user_id, ws_close_timestamp)
      → db.recordVoiceModeSwitch(user_id, { from, to, source: 'ui', outcome: 'success', duration_ms })
      → res.json({ ok: true })
  → VA_MODE = 'llm'
  → updateAgentUI() (includes renderVoiceModeBadge())
  → ARIA live region updated
```

**Data flow — MCP-initiated switch (Sofia's flow):**

```
External MCP agent calls switch_to_ptt
  → mcp-tools.js handler authenticates user
  → db.setDesiredMode(user_id, 'llm') [TTL ~60s]
  → MCP response: { ok: true, status: 'requested', message: '...' }
[Client poll, up to 5 s later]
Client GET /api/voice-mode
  → response includes desired: { mode_id: 'llm' }
  → vmodeFsm.transition('mcp_bridge_picked_up', { mode_id: 'llm', source: 'mcp' })
  → [same teardown flow as UI path from here]
  → db.recordVoiceModeSwitch(... source: 'mcp' ...)
  → db.clearDesiredMode(user_id)
```

**Data flow — heartbeat-timeout cleanup (OPS1):**

```
[Background, lazy on every addon_sessions read OR cron-like Lambda]
db.autoFinalizeStaleHeartbeats()
  → for each addon_sessions row where ended_at IS NULL AND
    last_heartbeat < (now - 30s):
      set ended_at = last_heartbeat
      compute duration_secs
      db.recordVoiceModeSwitch(user_id, {
        from: row.addon_type-derived-mode,
        to: 'llm',  /* assumed default */
        source: 'system',  /* attribution for auto-finalize */
        outcome: 'auto-finalized',
        duration_ms: now - last_heartbeat
      })
```

### File Organization Patterns

**Configuration files (existing locations, unchanged):**

- `.env.example` / `.env` — environment variables (existing
  pattern; SEC1 verification may add notes about token TTL)
- `package.json` — gains 3 new devDependencies + 1 new script
  from Tailwind precursor
- `bmalph/config.json` — bmad-method project descriptor (no
  switcher impact)

**New configuration files (Tailwind precursor only):**

- `tailwind.config.js` — root level, alongside `package.json`. Defines
  `theme.extend.colors`, `theme.extend.spacing`, `theme.extend.boxShadow`,
  `theme.extend.fontFamily` per UX spec Visual Foundation
- `postcss.config.js` — root level, alongside `package.json`. Declares
  `tailwindcss` and `autoprefixer` plugins

**Source organization:**

- All client switcher code → `public/index.html` "Voice-Mode
  Switcher" region (no new client JS files)
- All server switcher endpoints → `app.js` with banner comments
- All server persistence helpers → `db.js` exported functions
- All MCP tool handlers → `mcp-tools.js` inside `registerTools()`

**Test organization:**

- N/A — manual testing per existing project convention

**Asset organization:**

- Existing static assets (`public/icon-192.png`,
  `public/icon-512.png`, `public/manifest.json`) — no changes
- New asset: `public/dist/tailwind.css` from build step. Cached by
  service worker.

### Development Workflow Integration

**Development server (existing — adds Tailwind watch mode):**

- `npm start` (existing) — starts Express on local
- `npm run dev:ui` (existing) — UI dev mode
- **NEW from Tailwind precursor:** `npm run build:css` produces
  `public/dist/tailwind.css`; `npm run watch:css` for dev iteration
- Recommended dev pattern: run `watch:css` in one terminal,
  `npm start` in another

**Build process (existing — adds Tailwind step):**

- Existing: no build step for JS/HTML
- **NEW:** `npm run build:css` produces `public/dist/tailwind.css`
- `deploy.ps1` / `deploy-dev.ps1` updated to invoke
  `npm run build:css` before bundling

**Deployment structure (existing — no changes):**

- AWS Lambda + API Gateway + S3/CloudFront
- `lambda.js` (web) and `mcp-lambda.js` (MCP HTTP) deployed as
  separate Lambdas — both share `mcp-tools.js` and `db.js`
- Static assets including `public/dist/tailwind.css` deployed to
  S3 / CloudFront (existing pattern)
- Service worker cache: `CACHE_VERSION` bump from `test12-v5` to
  `test12-v6` ONCE at the end of Tailwind migration; no further
  bumps for switcher work

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:**

All major architectural decisions reinforce one another without
contradiction:

- **Tailwind precursor (INFRA1)** ↔ **UI components (UX + Pattern
  enforcement)**: UX commits to Tailwind-authored components; INFRA1
  provides the build pipeline; pattern rules forbid pre-migration
  CSS authoring. Coherent.
- **Polling pathway (API2)** ↔ **Bridge record (D3)** ↔ **Heartbeat
  (OPS1)**: Together these form the MCP-push surrogate. Polling
  reads the bridge; heartbeat bounds the worst-case staleness;
  bridge TTL bounds the worst-case agent-driven-no-op. Each piece
  has a clear failure mode that the others mitigate. Coherent.
- **Two-party teardown (API3)** ↔ **Heartbeat (OPS1)** ↔ **Retry
  policy + soft-warning toast (process patterns)**: The WS close
  is unconditionally committed once initiated; server finalization
  is normally fast but heartbeat-timeout catches edge cases; retry
  handles transient failures; soft toast informs the user without
  blocking. Coherent.
- **FSM (FE1)** ↔ **Source attribution (FE5)** ↔ **Telemetry (D2)**
  ↔ **Admin endpoint (API5)**: Source attribution at FSM entry
  points feeds telemetry; telemetry feeds the admin endpoint that
  supports the operator's bake-off decision. End-to-end coherent.
- **`vmode-*` naming (patterns)** ↔ **Inline-in-`index.html`
  (structure)** ↔ **Extend-don't-replace (FE3)**: All three rules
  protect against brownfield regression and align with NFR12.
  Coherent.

**Pattern Consistency:**

- Server-side patterns (snake_case JSON, bare-object responses,
  `try/catch+500.json` error handling) match existing `app.js`
  conventions verbatim.
- Client-side patterns (`vmode-*` prefix, FSM through `transition()`,
  no new JS files) match the established
  inline-`index.html`-everything convention.
- MCP tool patterns (snake_case names, `server.tool(...)`
  registration) match the existing `mcp-tools.js` style.
- No pattern contradicts another.

**Structure Alignment:**

- Project structure (Step 6) implements exactly what the decisions
  (Step 4) require: 4 new endpoints in `app.js`, 3 new MCP tools
  in `mcp-tools.js`, 9 new helpers in `db.js`, 1 new script region
  in `index.html`, Tailwind precursor files at the root.
- Architectural boundaries (4 endpoints + 3 MCP tools) match the
  data-flow diagrams.
- No structural element is unused; no decision is missing a
  structural home.

### Requirements Coverage Validation ✅

**Functional Requirements Coverage (all 31 FRs):**

| FR area | FRs | Architectural support |
|---|---|---|
| Voice Mode Control | FR1–FR6 | D1 (MODES config), FE1 (FSM), FE3 (extend updateAgentUI), UX `vmode-badge`/`vmode-sheet` components |
| Cost Transparency | FR7–FR9 | D1 (cost_tier field in MODES), FE2 (client-side resolution), UX `vmode-row-chip` with text/symbol redundancy |
| Session Lifecycle Management | FR10–FR15 | API3 (two-party teardown), OPS1 (heartbeat), D2 (telemetry rows). State preservation (FR13-FR15) is a non-action — switcher does not navigate. |
| Mid-Flight Transition Safety | FR16–FR18 | FE4 (discard-with-confirmation policy), UX `vmode-confirm-modal` |
| MCP Tool Surface | FR19–FR23 | API1 (three new tools), API3 (UI parity via shared bridge mechanism), A1 (per-user auth middleware reuse) |
| Observability & Telemetry | FR24–FR28 | D2 (event rows), FE5 (source attribution), API5 (admin endpoint) |
| Accessibility | FR29–FR31 | UX-component-level via Tailwind + native HTML elements; no separate architectural surface |

**No FR is uncovered.**

**Non-Functional Requirements Coverage (all 19 NFRs):**

| NFR | Architectural support |
|---|---|
| NFR1 — Mode-switch UI feedback ≤500 ms p95 | FSM transitions are synchronous DOM ops; UI updates instantly on tap; server roundtrip is the only variable, mitigated by single endpoint with simple finalization |
| NFR2 — Realtime WS teardown ≤200 ms p95 | Client-side `rtWs.close()` + `MediaStreamTrack.stop()` + `AudioContext.close()` are synchronous; budget is comfortably met |
| NFR3 — `addon_sessions` finalization ≤500 ms | Single DynamoDB write per session; well within budget |
| NFR4 — MCP tool round-trip ≤1 s p95 | MCP tools write the bridge record and respond; no waiting for client; tight budget met |
| NFR5 — Switcher render ≤100 ms TTI | Inline JS in `index.html` script block; no network dependency at render |
| NFR6 — Telemetry fire-and-forget | Process patterns specify fire-and-forget for non-correctness writes |
| NFR7 — MCP auth | A1 (reuse existing middleware) |
| NFR8 — Cross-user isolation | A1 + handler-level user-scoping; admin endpoint uses separate auth |
| NFR9 — API keys never reach client | A3 + API4 (token-minting is server-proxied; ephemeral tokens only) |
| NFR10 — Billing state user-scoped | All queries are user-scoped via existing auth middleware |
| NFR11 — Zero phantom billing | OPS1 (heartbeat timeout) + revised interpretation in API3 (30 s eventual consistency bound) |
| NFR12 — No regression | FE3 (extend-don't-replace) + structure patterns (`vmode-*` namespacing) + manual regression test pass per merge |
| NFR13 — Audio session teardown leak-free | API3 client-side teardown explicitly enumerates `MediaStreamTrack.stop()`, `AudioContext.close()` |
| NFR14 — Atomic rollback (reinterpreted) | API3 retry policy + heartbeat-timeout safety net; revised meaning documented |
| NFR15 — Service-worker version skew | INFRA1 + single CACHE_VERSION bump strategy; never-cached `/api/*` per existing `sw.js` |
| NFR16 — WCAG 2.1 AA | UX-component-level; architecture provides the build infra (Tailwind) that supports the component implementations |
| NFR17 — Screen-reader matrix | UX-component-level |
| NFR18 — Contrast minimums | UX Visual Foundation Color System; architecture-neutral |
| NFR19 — ARIA live announcements | Communication pattern (single live region in header chrome) |

**No NFR is uncovered.**

### Implementation Readiness Validation ✅

**Decision Completeness:**

- All 11 critical/important decisions (Decision Priority Analysis in Step 4) have a chosen option with rationale. No decision is left as "TBD by implementation."
- The three previously-deferred decisions (push pathway, analytics surface, mid-flight policy) are now resolved (API2, API5, FE4).
- The clarification surfaced during conversation (client-direct WS architecture) is fully integrated into API3, API4, SEC1, OPS1.

**Structure Completeness:**

- Every new endpoint has a named home (`app.js`).
- Every new persistence helper has a named home (`db.js`).
- Every new MCP tool has a named home (`mcp-tools.js`).
- Every new client function has a named region (`index.html`).
- The Tailwind precursor adds exactly 2 new config files at root + 1 build output in `public/dist/`.

**Pattern Completeness:**

- Naming patterns specified for: database, API endpoints, MCP tools, JS functions, JS variables/constants, files, DOM IDs, CSS classes, FSM events, telemetry event types.
- Structure patterns specified for: client code placement, server code placement, test placement.
- Format patterns specified for: API request/response, telemetry rows, mode-state JSON shape.
- Communication patterns specified for: FSM transitions, source attribution, endpoint calls, heartbeat, ARIA live region.
- Process patterns specified for: error handling, loading states, retries, logging.

### Gap Analysis Results

Six small gaps surfaced during validation, resolved inline below.

**🟡 Gap 1: Heartbeat-timeout cleanup mechanism unspecified**

- **Issue:** OPS1 says cleanup is "cron-like Lambda OR lazy check on every `addon_sessions` read" — but doesn't pick one.
- **Resolution:** **Lazy check on every `addon_sessions` read** for MVP. Reasons: (a) no new Lambda required (INFRA2 constraint), (b) reads are frequent enough on an active app that staleness is naturally bounded, (c) simpler to test.
- **Codified:** `db.getAddonSession()` and related read functions internally invoke `db.autoFinalizeStaleHeartbeats()` before returning. Cost: one extra index scan per read; bounded by DynamoDB efficiency.
- **Future option:** If lazy-check creates measurable read amplification, switch to a small EventBridge-scheduled Lambda. Defer to Phase 2.

**🟡 Gap 2: `addon_sessions.last_heartbeat` schema attribute is unspecified**

- **Issue:** OPS1 introduces `last_heartbeat` but doesn't say how it's added to the schema.
- **Resolution:** In DynamoDB, `last_heartbeat` is added as a new attribute on existing items — no schema migration needed (DynamoDB is flexible). In SQLite (`db.js` `initSqlite()`), add `last_heartbeat TEXT` to the `addon_sessions` CREATE TABLE statement; existing rows get NULL, which is treated as "no heartbeat yet" → eligible for cleanup if `ended_at` is also NULL.
- **Codified:** The Tailwind precursor PR or the OPS1 implementation PR adds the SQLite column via `ALTER TABLE addon_sessions ADD COLUMN last_heartbeat TEXT;` (executed once on next boot; idempotent if wrapped in `CREATE TABLE IF NOT EXISTS` pattern with a check).

**🟡 Gap 3: Polling cadence switch condition is underspecified**

- **Issue:** API2 says "5 s when an MCP agent is plausibly connected, 30 s baseline" but doesn't define "plausibly connected."
- **Resolution:** Use **page visibility state** as the proxy:
  - `document.visibilityState === 'visible'` → poll every 5 s (user might be glancing at the tab between MCP agent interactions)
  - `document.visibilityState === 'hidden'` → poll every 30 s (background tabs don't need fast updates)
  - On `visibilitychange` event → adjust immediately
- **Codified:** Client polling loop reads `document.visibilityState` on each tick; switches interval via `clearInterval` + `setInterval`.

**🟡 Gap 4: `set_voice_mode` no-op case is undefined**

- **Issue:** API1 doesn't specify what happens if the agent calls `set_voice_mode({ mode_id })` and the user is already on that mode.
- **Resolution:** Return `{ ok: true, status: 'completed', previous_mode_id: <same>, requested_mode_id: <same>, message: 'Already on requested mode.' }` — do NOT write a bridge record (would be a no-op), do NOT write a telemetry row (would pollute analytics with no-action events).
- **Codified:** The MCP tool handler checks `currentMode === requestedMode` and returns early before any side effects.

**🟡 Gap 5: Toast "Try again" retry behavior is unspecified**

- **Issue:** Toast offers "Try again" but the architecture doesn't specify what it retries.
- **Resolution:** "Try again" re-triggers the originally-attempted FSM transition with the **same source attribution** and the **same target mode**. Specifically: it calls `vmodeFsm.transition('row_tapped', { mode_id, source: 'ui-retry' })` (note: source becomes `'ui-retry'` so telemetry can distinguish manual retries from initial attempts, which is useful for bake-off analysis).
- **Codified:** The toast's "Try again" button stores the original transition payload as a closure when the toast is created.
- **Source-value extension:** The `source` enum gains `'ui-retry'` as a fourth legal value (alongside `'ui' | 'mcp' | 'voice-command'`).

**🟡 Gap 6: Server-side `MODES` validation list location is unspecified**

- **Issue:** D1 says "Server-side mirror exists only as the validation list" but doesn't say where it lives, and the patterns rule says "no new files."
- **Resolution:** Hardcode the validation list as a `const VOICE_MODE_IDS = Object.freeze(['llm', 'deluxe-claude', 'deluxe-xai', 'deluxe-openai'])` at the top of `mcp-tools.js`, used by both `set_voice_mode` and `switch_to_ptt` handlers. The list is small (4 items), changes rarely, and the duplication with the client `MODES` array is acceptable. If the lists drift, the bake-off-completion lineup change (4 → 3) reveals it (you'd have to update both).
- **Codified:** Single 1-line `const` declaration in `mcp-tools.js`.

**No critical (🔴) gaps. No important (🟠) gaps. All 6 minor (🟡) gaps resolved inline.**

### Validation Issues Addressed

The gap-analysis resolutions above amount to six small architectural
refinements integrated into the existing decisions (not contradictions
to them). Specifically:

- OPS1 + Gap 1 → cleanup is **lazy-check-on-read**
- OPS1 + Gap 2 → SQLite schema migration is one `ALTER TABLE`
- API2 + Gap 3 → polling cadence keyed to `document.visibilityState`
- API1 + Gap 4 → `set_voice_mode` no-op returns early without
  side effects
- Process patterns + Gap 5 → toast "Try again" replays original
  transition with `source: 'ui-retry'`
- D1 + Gap 6 → server-side validation list lives at top of
  `mcp-tools.js`

These refinements become part of the architectural commitment as
of this validation step.

### Architecture Completeness Checklist

**✅ Requirements Analysis**

- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed (low domain, medium-high lifecycle)
- [x] Technical constraints identified (brownfield, solo-operator, no new deps for MVP, Tailwind precursor)
- [x] Cross-cutting concerns mapped (5 enumerated in Step 2)

**✅ Architectural Decisions**

- [x] Critical decisions documented (D1, API1, API3, FE1, FE4 — 5 critical)
- [x] Important decisions documented (D2, D3, A1, A2, A3, API2, API4, API5, FE2, FE3, FE5, INFRA1, INFRA2, INFRA3, SEC1, OPS1 — 17 important)
- [x] Deferred decisions documented with rationale (6 deferred, recorded for Phase 2+)
- [x] Technology versions verified (existing tech inherited; no new versions decided beyond Tailwind which the precursor epic owns)
- [x] Integration patterns defined (UI ↔ FSM ↔ server, MCP ↔ bridge ↔ client poll, heartbeat ↔ cleanup)
- [x] Performance considerations addressed (NFR1–NFR6 mapped to decisions)

**✅ Implementation Patterns**

- [x] Naming conventions established (inherited from existing codebase; switcher additions specified with `vmode-` prefix family)
- [x] Structure patterns defined (no new files except Tailwind precursor; named region in `index.html`)
- [x] Communication patterns specified (FSM transitions, source attribution, endpoint call shape, heartbeat, ARIA)
- [x] Process patterns documented (error handling, loading states, retries, logging)

**✅ Project Structure**

- [x] Complete directory structure defined (with existing + NEW + MODIFIED markers)
- [x] Component boundaries established (4 endpoints, 3 MCP tools, 9 db helpers, 1 FSM)
- [x] Integration points mapped (internal communication table + 3 data flow diagrams)
- [x] Requirements to structure mapping complete (every FR/NFR area mapped to file regions)

### Architecture Readiness Assessment

**Overall Status: READY FOR IMPLEMENTATION**

**Confidence Level: HIGH.** Reasons:

- All 31 FRs and 19 NFRs have explicit architectural support.
- The deferred decisions from the upstream PRD + UX + readiness
  report are all resolved.
- The 6 minor gaps surfaced by validation are resolved inline.
- The architecture is extension-shaped, not replacement-shaped —
  minimal blast radius on existing flows.
- The MVP implementation sequence is concrete (1 precursor epic +
  5 switcher epics + 1 follow-on, with a pre-flight verification
  step).
- Brownfield integration anchors are explicitly named with file
  paths and line numbers where relevant.

**Key Strengths:**

1. **The trust contract from the UX spec is preserved in the
   architecture.** The two-party teardown choreography ensures the
   user's "I'm not trapped" promise is technically realizable.
2. **MCP parity is achieved without behavioral fork.** Both UI and
   MCP paths converge on the same teardown logic via the FSM.
3. **Brownfield discipline.** Every architectural decision asks
   "what does the existing code already do?" before specifying new
   behavior. The result: ~7-9 day MVP feasible per PRD Scoping.
4. **Risk profiles are explicit, not hand-waved.** Phantom billing,
   regression, token leak, polling vs WS — each has a documented
   mitigation.
5. **The 4 → 3 mode collapse after the realtime bake-off is
   data-driven.** Only `MODES` config changes; no architectural
   rework.

**Areas for Future Enhancement:**

1. **WebSocket push pathway** (Phase 2 — replace polling for MCP-driven
   updates)
2. **Per-user persistent mode preference** (Phase 2 — `users.default_mode`
   column + settings endpoint)
3. **Per-channel mode memory** (Phase 2)
4. **Account-balance-aware switching** (Phase 2 — surfaces
   `vmode-row-disabled` variant when addon minutes exhausted)
5. **Fully-proxied realtime WebSocket architecture** (Phase 3 —
   enables provider swap without client redeploys, per-event
   moderation, full session logging)
6. **Automated test infrastructure** (out of scope; project-wide
   decision)
7. **ESLint custom rules to enforce `vmode-*` namespacing** (Phase
   2 nice-to-have)

### Implementation Handoff

**AI Agent Guidelines (for downstream story execution):**

1. Follow architectural decisions D1–D3, A1–A3, API1–API5, FE1–FE5,
   INFRA1–INFRA3, SEC1, OPS1 exactly as documented.
2. Use implementation patterns consistently — `vmode-*` namespace,
   snake_case for JSON/DB/MCP, camelCase for JS, never replace
   existing functions.
3. Respect project structure — no new top-level JS files; client
   code in `index.html`; server in `app.js`/`db.js`/`mcp-tools.js`.
4. Refer to this architecture document for any "should I…?"
   question. If the answer isn't here, document the decision in
   the PR description and update this file.
5. Honor the implementation sequence — don't skip the SEC1 pre-flight
   before Epic 4 (MCP); don't ship switcher code before the Tailwind
   precursor.

**First Implementation Priority:**

```
1. Tailwind Migration Epic (precursor — own work stream)
2. SEC1 verification (pre-flight, ~half-day code reading)
3. Switcher Epic 1 (Foundations): MODES, FSM shell, badge, telemetry schema
```

No `create-*` command; this is brownfield. The first switcher PR
opens `public/index.html` and `app.js` for edit.
