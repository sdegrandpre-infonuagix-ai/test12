---
stepsCompleted:
  - step-01-document-discovery
  - step-02-prd-analysis
  - step-03-epic-coverage-validation
  - step-04-ux-alignment
  - step-05-epic-quality-review
  - step-06-final-assessment
filesIncluded:
  prd: '_bmad-output/planning-artifacts/prd.md'
  architecture: null
  epics: null
  ux: null
workflow: 'bmad-check-implementation-readiness'
mode: 'validate'
date: '2026-05-27'
project: 'test12'
---

# Implementation Readiness Assessment Report

**Date:** 2026-05-27
**Project:** test12
**Assessor:** Winston (Architect)
**Mode:** Validate

## Document Inventory

### PRD Files Found

**Whole Documents:**
- `_bmad-output/planning-artifacts/prd.md` (~46 KB, modified 2026-05-27)

**Sharded Documents:** none

### Architecture Files Found

**Whole Documents:** none
**Sharded Documents:** none

### Epics & Stories Files Found

**Whole Documents:** none
**Sharded Documents:** none

### UX Design Files Found

**Whole Documents:** none
**Sharded Documents:** none

## Issues Identified

### Duplicates

None — single PRD whole document, no sharded version.

### Missing Documents (WARNING — impacts assessment completeness)

- **Architecture document not found.** Cannot validate technical-decision traceability from FRs/NFRs.
- **Epics & Stories document not found.** Cannot validate FR → epic → story coverage.
- **UX Design document not found.** Cannot validate user-journey → interaction-flow alignment.

The PRD is the only planning artifact present. This is a **PRD-only readiness check** — the assessment will surface PRD-internal quality (FR/NFR coverage, journey traceability, scope coherence) but cannot validate downstream alignment because there are no downstream artifacts yet.

## PRD Analysis

### Functional Requirements

Extracted from `_bmad-output/planning-artifacts/prd.md` section "Functional Requirements". Organized by capability area as authored.

**Voice Mode Control (6 FRs)**

- FR1: User can see the currently active voice mode at any time without opening a menu, navigating away, or refreshing the page.
- FR2: User can switch from any voice mode to any other voice mode without a page refresh.
- FR3: User can escape from any realtime-streaming mode to a PTT mode in a single action.
- FR4: User can distinguish the PTT family of modes from the realtime-streaming family of modes in the switcher UI.
- FR5: User can perform mode switching identically while viewing the public feed or while inside any private channel.
- FR6: User can continue to use voice-command mode switching (e.g. *"switch to Sonnet"*) from within PTT modes as exists today.

**Cost Transparency (3 FRs)**

- FR7: User can see the cost tier (free vs paid; tier identity if paid) of every available voice mode before selecting it.
- FR8: User can see the cost tier of the currently active voice mode at all times.
- FR9: User can distinguish cost tiers without relying on color alone.

**Session Lifecycle Management (6 FRs)**

- FR10: System cleanly terminates any active realtime-streaming session when the user exits that mode.
- FR11: System releases the microphone and audio context on mode exit so that no orphan audio session persists after a switch.
- FR12: System halts billing-meter accrual for a paid mode at the moment the user exits that mode, with no silent post-exit accrual.
- FR13: User's draft text in the compose box is preserved across any mode switch.
- FR14: User's scroll position is preserved across any mode switch.
- FR15: User's current conversational step (e.g. mid-confirmation, mid-reply) is preserved across mode switches, except where the defined mid-flight transition policy specifies otherwise.

**Mid-Flight Transition Safety (3 FRs)**

- FR16: System detects when the user has audio in progress (mid-recording or mid-streaming) at the moment of a mode-switch attempt.
- FR17: User is asked to confirm before any mode switch that would discard in-progress audio.
- FR18: System never silently drops in-progress audio as a side effect of a mode switch.

**MCP Tool Surface (5 FRs)**

- FR19: Connected MCP agent can query the user's current voice mode.
- FR20: Connected MCP agent can set the user's voice mode to any of the four supported modes.
- FR21: Connected MCP agent can return the user to a PTT mode via a single, parameter-less tool call.
- FR22: MCP-initiated mode switches honor the same session-lifecycle guarantees as UI-initiated switches (clean teardown, state preservation, billing-meter halt, mid-flight safety).
- FR23: MCP mode-control tools authenticate the calling agent as a specific user and only affect that user's session — never another user's.

**Observability & Telemetry (5 FRs)**

- FR24: System records each mode-switch attempt with mode-from, mode-to, source (UI vs MCP), and timestamp.
- FR25: System records the outcome of each mode-switch attempt (success, failure, timeout) and its end-to-end duration.
- FR26: System records the duration of every realtime-streaming session.
- FR27: System records "escape" events distinctly — any exit from a paid mode back into a PTT mode while audio was in progress.
- FR28: Operator can aggregate mode-switch, session-duration, and escape-rate data per voice mode and per realtime provider to inform the realtime-provider bake-off decision.

**Accessibility (3 FRs)**

- FR29: User can navigate and operate the mode switcher using only the keyboard.
- FR30: User of a screen reader is informed of the currently active voice mode and is announced of mode changes as they happen.
- FR31: User with the `prefers-reduced-motion` setting experiences no motion-dependent transitions in the switcher UI.

**Total FRs:** 31, sequentially numbered FR1–FR31, no gaps.

### Non-Functional Requirements

Extracted from `_bmad-output/planning-artifacts/prd.md` section "Non-Functional Requirements".

**Performance (6 NFRs)**

- NFR1: Mode-switch UI feedback (tap → "new mode active" UI state) completes in ≤500 ms at p95, measured client-side from the user interaction event to the mode-active render.
- NFR2: Realtime-streaming WebSocket teardown (socket close + audio resource release) completes in ≤200 ms at p95 after the mode-exit signal is issued.
- NFR3: Server-side `addon_sessions` row finalization (billing-meter halt) is committed within ≤500 ms of mode-exit, measured from the exit signal to the database write timestamp.
- NFR4: MCP mode-control tool calls (`switch_to_ptt`, `set_voice_mode`, `get_voice_mode`) return to the calling agent in ≤1 s end-to-end at p95, including any required server-side teardown.
- NFR5: Initial page-load render of the mode switcher control adds ≤100 ms to time-to-interactive vs the pre-switcher baseline, and never blocks the existing `connect-btn` from becoming interactive.
- NFR6: Mode-switch and telemetry recording never block the user-facing action — telemetry writes are fire-and-forget from the client's perspective.

**Security (4 NFRs)**

- NFR7: All MCP mode-control tool calls authenticate the caller as a specific user using the same auth middleware as existing user-scoped MCP tools (`get_addon_usage`, `set_alias`). Unauthenticated calls are rejected with HTTP 401 / equivalent MCP error.
- NFR8: An authenticated MCP agent can only modify the voice mode of the user it is authenticated as. Cross-user mode manipulation attempts are rejected with HTTP 403 / equivalent MCP error and logged.
- NFR9: Realtime-provider API keys (`XAI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`) are never sent to the client. The switcher and its teardown logic only call server-mediated endpoints or pre-existing client-side WebSocket-bridge code that already handles auth tokens server-side.
- NFR10: Billing-meter state (active `addon_sessions` rows, remaining addon minutes) is readable by the user only for their own account and never exposed in mode-switch telemetry or MCP tool responses to a third-party agent.

**Reliability (5 NFRs)**

- NFR11: Zero tolerance for phantom billing — across all mode-switch events in a measurement window, the count of `addon_sessions` rows that show meter accrual after a recorded mode-exit telemetry event is zero.
- NFR12: No regression in existing voice flows: every existing user journey (posting, threading, voice-reply matching, private-channel realtime delivery, auto-read narration, voice-command-driven mode switching from within PTT) passes a full manual regression test before each merge that touches `index.html`.
- NFR13: Audio session teardown is leak-free — after any mode-exit, the browser shows no persistent mic indicator from test12 and no `MediaStreamTrack` belonging to test12 is in the `live` state.
- NFR14: MCP tool calls that fail mid-teardown (network error, server crash, etc.) leave the user's mode state internally consistent — either fully on the previous mode (rollback) or fully on the target mode (forward), never in a halfway state with an orphan session.
- NFR15: The mode switcher and its teardown logic continue to function correctly when the service worker is serving a cached `index.html` shell. New server-side MCP tools degrade gracefully — a missing tool returns a clean error rather than hanging the client.

**Accessibility (4 NFRs)**

- NFR16: Mode switcher conforms to WCAG 2.1 Level AA for all user-facing controls (the badge, the trigger button, the expanded switcher list, the mid-flight confirmation modal).
- NFR17: Mode switcher is verified working with iOS Safari VoiceOver and macOS Safari VoiceOver. On Android, Chrome TalkBack functionality is verified.
- NFR18: Mode switcher meets a minimum 3:1 contrast ratio for the cost-tier badge text against its background across all badge variants (Free / $$ / $$$), in addition to the text-or-symbol differentiation required by FR9.
- NFR19: All cost-tier badge state changes and mode transitions are announced via an ARIA live region with `aria-live="polite"` so screen-reader users are not interrupted but are kept in sync.

**Total NFRs:** 19, sequentially numbered NFR1–NFR19, no gaps.

### Additional Requirements

**Measurable Outcomes** (PRD Success Criteria section — these are quantified acceptance targets that act as implicit requirements):

- 1-tap escape success rate (realtime → PTT) ≥99% — client telemetry
- Mode-switch latency p95 ≤500 ms — client telemetry (overlaps NFR1)
- Refresh-during-realtime-session rate down ≥80% vs pre-switcher baseline — client logs
- "Stuck in mode" support tickets down ≥90% — support tracker
- Phantom-billing incidents (minutes accrued after exit) = 0 — `addon_sessions` audit (overlaps NFR11)
- % of users who try realtime ≥twice in a session: up vs baseline — session analytics
- Draft-preservation rate across mode switches = 100% (mid-recording transitions excepted, per spec) — client telemetry
- MCP `switch_to_ptt` tool invocation success rate ≥99% — server logs
- MCP escape parity: tool-driven exits leave no orphan sessions = 100% — `addon_sessions` audit

**Platform constraints** (PRD Web App Specific Requirements section):

- Service worker cache-hit behavior for static assets must remain unchanged from `public/sw.js` cache version `test12-v5`.
- No regression in initial page-load TTI for `connect-btn` or `orb` becoming interactive vs pre-switcher baseline.
- Build with current `package.json` only — no new npm dependencies for the MVP.

**Brownfield integration constraints** (extracted from Project Classification + Implementation Considerations):

- Switcher lives inline in monolithic `public/index.html`; no separate JS modules in `public/`.
- Reads/writes existing `VA_MODE` global (`'llm' | 'deluxe-claude' | 'deluxe-xai' | 'deluxe-openai'`).
- Calls existing `updateAgentUI()` for orb / button label refresh.
- MCP tools register via existing `mcp-tools.js` registry, shared by `server.js` (stdio) and `mcp-http.js` (HTTP).
- Per-user MCP auth uses same middleware as existing user-scoped tools (`get_addon_usage`, `set_alias`).

**Deferred (Phase 2 / Vision — not requirements for MVP but recorded for traceability):**

- Bidirectional mode switching with full state preservation in both directions
- Inline session-cost display
- Smart mid-recording transition (finish-then-switch instead of discard)
- Per-channel mode memory
- Language-aware mode hints
- Compact mode for mobile
- MCP tools surface cost and language metadata
- Account-balance-aware switching
- Per-context defaults
- User mode preferences as profile setting
- Agent-orchestrated mode switching
- 4→3 mode collapse after realtime bake-off concludes

### PRD Completeness Assessment

**Strengths**

- 31 FRs organized into 7 logical capability areas; 19 NFRs across 4 quality attributes. Sequential numbering, no gaps.
- Every FR is testable, implementation-agnostic, and traceable to either a user journey or a stated success criterion.
- NFRs follow the "metric / condition / measurement method" template recommended by `prd-purpose.md`.
- All four user journeys (Maria, David, Sofia, BMad) include explicit "Requirements revealed" sections that ground the FR list.
- Polish pass eliminated duplicate Performance Targets content and removed implementation leakage in FR10.
- Brownfield integration points are explicitly named (file paths, global variables, existing functions, existing modules) — gives a future architect concrete anchors.
- A Risk Mitigation Strategy section enumerates technical, market, and resource risks with mitigations. Most PRDs lack this.
- Companion artifact (`.github/issue-drafts/sonnet-4-6-label-impl-mismatch.md`) tracks a discovered code-level gap without polluting the PRD scope.

**Internal gaps / questions for downstream attention** (assessed in detail in Step 3)

- The defined mid-flight transition policy is referenced by FR15 and FR17 but the exact policy ("discard with confirmation prompt" vs "finish-then-switch") is deferred to a later document. This is correctly scoped as out-of-PRD but architecture / UX will need a decision.
- Server→client mode-state push pathway for MCP tool calls is mentioned in Risk Mitigation and Implementation Considerations as a known gap (today's codebase only has WS push for private channels). MVP fallback (polling) is documented; the architectural choice is deferred.
- "Operator query surface for mode-usage analytics" (Journey 4 + FR28) is left open between "structured `usage_logs` rows" and "a small admin endpoint." Architecture-level decision.
- WCAG 2.1 Level AA conformance (NFR16) for a switcher embedded in an existing app implies that the surrounding header chrome must already meet AA — not explicitly verified in the PRD. May be a pre-existing baseline or may need separate audit.

## Epic Coverage Validation

### Coverage Matrix

**No epics document exists.** All 31 FRs from the PRD are formally uncovered at the epic level because the epics artifact has not yet been created. The matrix below records each FR with a status of "NOT COVERED — no epics document yet" rather than "MISSING," because the absence is a sequencing fact, not a planning failure.

| FR # | Capability Area | Epic Coverage | Status |
|---|---|---|---|
| FR1 | Voice Mode Control | — | ❌ No epic (epics doc not yet created) |
| FR2 | Voice Mode Control | — | ❌ No epic |
| FR3 | Voice Mode Control | — | ❌ No epic |
| FR4 | Voice Mode Control | — | ❌ No epic |
| FR5 | Voice Mode Control | — | ❌ No epic |
| FR6 | Voice Mode Control | — | ❌ No epic |
| FR7 | Cost Transparency | — | ❌ No epic |
| FR8 | Cost Transparency | — | ❌ No epic |
| FR9 | Cost Transparency | — | ❌ No epic |
| FR10 | Session Lifecycle Management | — | ❌ No epic |
| FR11 | Session Lifecycle Management | — | ❌ No epic |
| FR12 | Session Lifecycle Management | — | ❌ No epic |
| FR13 | Session Lifecycle Management | — | ❌ No epic |
| FR14 | Session Lifecycle Management | — | ❌ No epic |
| FR15 | Session Lifecycle Management | — | ❌ No epic |
| FR16 | Mid-Flight Transition Safety | — | ❌ No epic |
| FR17 | Mid-Flight Transition Safety | — | ❌ No epic |
| FR18 | Mid-Flight Transition Safety | — | ❌ No epic |
| FR19 | MCP Tool Surface | — | ❌ No epic |
| FR20 | MCP Tool Surface | — | ❌ No epic |
| FR21 | MCP Tool Surface | — | ❌ No epic |
| FR22 | MCP Tool Surface | — | ❌ No epic |
| FR23 | MCP Tool Surface | — | ❌ No epic |
| FR24 | Observability & Telemetry | — | ❌ No epic |
| FR25 | Observability & Telemetry | — | ❌ No epic |
| FR26 | Observability & Telemetry | — | ❌ No epic |
| FR27 | Observability & Telemetry | — | ❌ No epic |
| FR28 | Observability & Telemetry | — | ❌ No epic |
| FR29 | Accessibility | — | ❌ No epic |
| FR30 | Accessibility | — | ❌ No epic |
| FR31 | Accessibility | — | ❌ No epic |

### Missing Requirements (epic-side)

No FRs are missing from the *PRD*. All 31 FRs are missing from *epic coverage* solely because the epics artifact has not been created yet. When the epics document is authored (via `/create-epics-stories`), the 7 capability areas in the PRD provide natural epic boundaries:

| Suggested Epic | Source PRD Capability Area | FRs to cover |
|---|---|---|
| Epic 1: Mode Switcher UI | Voice Mode Control + Cost Transparency | FR1–FR9 |
| Epic 2: Session Lifecycle & Teardown | Session Lifecycle Management + Mid-Flight Transition Safety | FR10–FR18 |
| Epic 3: MCP Mode-Control Tools | MCP Tool Surface | FR19–FR23 |
| Epic 4: Telemetry & Operator Analytics | Observability & Telemetry | FR24–FR28 |
| Epic 5: Accessibility | Accessibility | FR29–FR31 |

These are illustrative; the eventual epics owner is free to slice differently (e.g. fold accessibility into Epic 1 and merge Epics 2+3, ending up with 3 epics). The key is that **every FR has at least one named epic destination** when epics are authored.

### Coverage Statistics

- Total PRD FRs: 31
- FRs covered in epics: 0
- Coverage percentage: 0% (epics document does not exist)
- **Note:** This is a *sequencing* gap (epics come after architecture in BMAD Phase 3), not a *quality* gap in the PRD itself. The PRD is sufficient input for `/create-epics-stories` once architecture is in place.

## UX Alignment Assessment

### UX Document Status

**Not Found** — no `*ux*.md` document exists in `_bmad-output/planning-artifacts/`.

### Is UX implied?

**Yes — strongly implied.** The PRD describes a substantial UI surface and explicit interaction patterns that require UX design before implementation. The implied UI elements are:

| PRD reference | UI element implied |
|---|---|
| FR1, FR4, FR8, MVP scope | A persistent global header control showing the current voice mode |
| FR7, FR9, NFR18, MVP scope | A cost-tier badge with Free / $$ / $$$ visual differentiation (color + text/symbol, ≥3:1 contrast) |
| FR2, FR3, FR4, MVP scope | An expanded switcher view grouping the 4 modes by family (PTT / Realtime) |
| FR17, Journey 2, MVP scope | A mid-flight transition confirmation modal with [Switch] [Stay] actions |
| Web App > Responsive Design | A mobile bottom-sheet or popover variant of the switcher |
| FR29, NFR16 | Keyboard navigation flow (focus order, arrow-key navigation within open switcher, Enter/Space/Escape) |
| FR30, NFR17, NFR19 | ARIA live-region announcements for mode change ("Switched to Haiku 4.5, Standard tier. OpenAI Realtime session closed.") |
| FR31, NFR16 | `prefers-reduced-motion`-respecting transitions |
| Journey 1 (Maria) | Visual labeling consistent across PTT family ("Haiku 4.5 (Free)", "Sonnet 4.6 ($$)") and Realtime family ("xAI Grok ($$)", "OpenAI Realtime ($$$)") |
| Web App > Implementation Considerations | Visual integration with existing header chrome (alongside `header-login-link`, `Profile`, `Sign out` buttons) and the existing `addon-usage-bars` element |

### Alignment Issues

- **N/A — no UX document to align against.** The PRD and a future UX document will need to be reconciled when the UX is authored. The PRD takes a reasonable position by deferring layout / visual-treatment choices to UX while specifying *capabilities* (FR1-FR9, FR16-FR18, FR29-FR31) and *quality constraints* (NFR16-NFR19).

### Warnings

⚠️ **MEDIUM-severity warning: UX document required before implementation.**

- The PRD describes a non-trivial UI surface with at least 5 distinct visual states (collapsed badge, expanded switcher, mid-flight modal, mobile sheet, error/teardown-in-progress state) and explicit accessibility requirements.
- Skipping UX and going straight from PRD → architecture → implementation would force the implementing engineer to make ad-hoc UX decisions (badge shape, switcher layout, modal copy, mobile gesture choice, focus management) without a reviewed design.
- For a feature whose stated success criterion is a **"trust contract"** with users (Sally's framing carried forward from Step 2 Party Mode), under-investing in UX is the exact risk to avoid.
- **Recommendation:** Run `/create-ux` before `/create-architecture`. The UX agent (Sally) should produce wireframes for at minimum the 5 states above, plus the keyboard interaction flow, before architecture commits to a component model.

⚠️ **LOW-severity observation: Existing header chrome accessibility baseline is unverified.**

- NFR16 commits the switcher to WCAG 2.1 AA, but assumes the surrounding header (the `header-login-link`, `Profile`, `Sign out` buttons in `public/index.html`) already meets AA. The PRD doesn't verify this. If the surrounding chrome is below AA, the switcher will inherit accessibility debt that no PRD-level requirement can fix without expanding scope.
- **Recommendation:** UX or QA pass should audit existing header chrome accessibility before the switcher launches, so we know whether the surrounding context is already AA-compliant or will need a paired fix.

## Epic Quality Review

### Status

**Not applicable — no epics document exists to review.**

The epic quality review checks for: technical-epic anti-patterns (e.g. "Setup Database" instead of user-value framing), forward dependencies between epics, story sizing, acceptance criteria quality, within-epic story dependency direction, database-creation timing, and starter-template handling for greenfield projects. None of these can be assessed without epics.

### Anticipatory guidance for future epics

When epics are authored via `/create-epics-stories`, the following points from this PRD will need attention to pass a future epic-quality review:

| Concern | Specifically watch for |
|---|---|
| **Brownfield-appropriate framing** | This is a brownfield project (Step 2 classification). Epics should describe user-facing capabilities being added to test12, not technical-milestone framing ("Add WebSocket teardown handler" is wrong; "User can escape paid voice modes" is right). |
| **Epic independence** | The 5 suggested epic boundaries (UI + Cost Transparency, Lifecycle + Mid-Flight, MCP Tools, Telemetry, Accessibility) have real cross-dependencies — e.g., the MCP tools epic depends on the lifecycle epic's teardown contract (FR22). Epic ordering matters; MVP scope already implies the lifecycle epic must precede the MCP tools epic. |
| **Within-epic story sizing** | The 7–9 day MVP estimate (PRD Scoping section) suggests stories should be ~0.5–1 day each. Avoid mega-stories like "Implement the entire switcher UI." |
| **Database-creation timing** | No new tables required for MVP (PRD explicitly: "No new persistence in MVP"). Epic-quality review should verify epics don't accidentally introduce schema changes. |
| **Starter-template handling** | N/A — brownfield, no starter template, no Epic 1 Story 1 needed for setup. |
| **Forward dependency check** | Watch for Telemetry epic stories depending on MCP-tools epic features ("telemetry source field can be 'MCP'" requires MCP tools to exist). Order Telemetry **after** MCP Tools. |
| **Acceptance-criteria quality** | The PRD's FRs and NFRs are already testable and measurable — copy/adapt them directly as story ACs rather than re-inventing. |

### Defect summary (epic-side)

- 🔴 Critical violations: 0 (no epics to violate)
- 🟠 Major issues: 0
- 🟡 Minor concerns: 0
- ⚠️ Blocker: epics document does not exist yet

## Summary and Recommendations

### Overall Readiness Status

**PRD: READY** · **Pipeline (PRD + UX + Architecture + Epics): NOT READY for implementation**

The PRD is high-quality and sufficient as input for the next planning phases. The pipeline as a whole is not ready for implementation because three of four required downstream artifacts (UX, Architecture, Epics) have not yet been authored. This is a **sequencing** state, not a quality problem.

### What's working

- **PRD internal quality is strong.** 31 testable, implementation-agnostic, traceable FRs across 7 capability areas; 19 measurable NFRs across 4 quality attributes (Performance, Security, Reliability, Accessibility). Numbering is sequential with no gaps. No subjective adjectives, no implementation leakage (post-polish), no vague quantifiers.
- **Brownfield integration is concrete.** The PRD names specific file paths (`public/index.html`, `mcp-tools.js`, `app.js:1171`, `sw.js`), existing globals (`VA_MODE`, `dispatchIntent`, `updateAgentUI`), existing modules, and existing tables (`addon_sessions`, `usage_logs`). A future architect will not have to re-discover the integration surface.
- **The 4-mode reality is correctly documented** — Haiku 4.5 (Standard PTT), Sonnet 4.6 (Deluxe-Claude PTT), xAI `grok-voice-latest` (Deluxe-xAI Realtime), OpenAI `gpt-realtime-2` (Deluxe-OpenAI Realtime) — matched against actual codebase state.
- **The realtime bake-off is correctly scoped** (xAI vs OpenAI only; Haiku/Sonnet is a permanent tier distinction, not a bake-off). The 4→3 mode collapse after the bake-off concludes is explicitly part of the MVP component architecture.
- **Risk analysis is unusually thorough.** Technical, market, and resource risks each have likelihood/impact/mitigation. Most PRDs at this stage omit risk entirely.
- **A companion code-fix artifact** (`.github/issue-drafts/sonnet-4-6-label-impl-mismatch.md`) tracks a discovered codebase gap without polluting PRD scope.

### Critical Issues Requiring Immediate Action

**None within the PRD itself.** All three issues below are sequencing gaps about missing downstream artifacts, not defects in the PRD content.

| # | Issue | Severity | Action |
|---|---|---|---|
| 1 | UX document does not exist | 🟠 Medium | Run `/create-ux` next. The PRD describes ≥5 distinct UI states (collapsed badge, expanded switcher, mid-flight modal, mobile sheet, teardown-in-progress) plus keyboard-flow and screen-reader requirements. Skipping UX forces ad-hoc UX decisions during implementation, which directly threatens the "trust contract" success criterion. |
| 2 | Architecture document does not exist | 🟠 Medium | After UX, run `/create-architecture`. Two architectural decisions are explicitly deferred from the PRD: (a) the **server→client mode-state push pathway** for MCP-driven switches (today only private-channel WebSockets exist; the PRD's MVP fallback is polling, but the architecture should commit to the long-term path), and (b) the **operator analytics surface** for mode-usage data (structured `usage_logs` rows vs a dedicated admin endpoint). |
| 3 | Epics document does not exist | 🟠 Medium | After architecture, run `/create-epics-stories`. The PRD's 7 capability areas provide natural epic boundaries; the suggested mapping is in this report's *Epic Coverage Validation > Missing Requirements* section. Epic ordering matters: Telemetry epic must follow MCP-Tools epic (forward-dependency hazard otherwise). |

### Lower-severity items

- 🟡 The defined mid-flight transition policy is referenced by FR15 and FR17 but the exact policy ("discard with confirmation prompt" vs "finish-then-switch") is deferred to UX/architecture. Correctly out-of-PRD scope, but a decision is owed downstream.
- 🟡 Existing header chrome accessibility baseline (vs WCAG 2.1 AA) is unverified. NFR16 commits the switcher to AA; if surrounding chrome is below AA, the switcher will inherit unfixable debt. Audit recommended before launch.
- 🟡 `app.js:1171` requests Sonnet 4.5 while the UI labels the mode Sonnet 4.6. Tracked separately at `.github/issue-drafts/sonnet-4-6-label-impl-mismatch.md`. Not a PRD scope item; bundle with switcher work since both touch mode metadata.

### Recommended Next Steps (in order)

1. **`/create-ux`** — Sally produces wireframes for the 5 implied UI states + keyboard flow + screen-reader announcements. Output: `_bmad-output/planning-artifacts/ux.md`.
2. **`/create-architecture`** — Winston commits the technical design. Critical decisions to land: server→client mode-state push pathway, operator analytics surface, mid-flight transition policy. Output: `_bmad-output/planning-artifacts/architecture.md`.
3. **`/create-epics-stories`** — Producing 3–5 epics aligned to the PRD's capability areas, with story sizing matching the 7–9 day MVP estimate (stories ~0.5–1 day each). Output: `_bmad-output/planning-artifacts/epics.md`.
4. **Re-run `/implementation-readiness`** — once UX + Architecture + Epics exist, the full alignment check (the workflow's intended use) will validate FR-to-epic coverage, FR-to-UX alignment, and epic-quality. This second pass produces a truer "ready / needs work / not ready" verdict.
5. **(Parallel, optional)** File the Sonnet 4.5/4.6 issue via the draft at `.github/issue-drafts/sonnet-4-6-label-impl-mismatch.md` — either with `gh issue create --body-file …` after installing `gh`, or by paste into the GitHub web UI. Not blocking, but cheap to file.

### Final Note

This assessment identified **3 medium-severity sequencing issues** (missing UX, Architecture, and Epics documents) and **3 low-severity items** (deferred mid-flight policy decision, unverified header-chrome accessibility baseline, Sonnet 4.5/4.6 code-level label/impl gap). **Zero issues were found within the PRD itself** — the PRD passes all internal-quality checks the workflow can perform without downstream artifacts.

The PRD is suitable input for the next BMAD planning phases. Proceed with UX → Architecture → Epics, then return for a full re-check.

---

**Implementation Readiness Assessment Complete**

Report: `_bmad-output/planning-artifacts/implementation-readiness-report-2026-05-27.md`
Assessor: Winston (Architect), in Validate mode
Date: 2026-05-27
