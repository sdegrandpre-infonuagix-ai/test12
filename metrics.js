'use strict';

// ═══════════════════════════════════════════════════════════════════
//  Epic 7 / Story 7.3 — Voice-mode domain metrics (namespace Test12/VoiceMode).
//
//  Thin EMF wrappers over logger.js for the realtime bake-off signals the
//  operator dashboard (7.7) and alarms (7.6) consume — FR24/FR25 (every
//  mode-switch attempt: from/to/source/outcome + duration), FR26 (realtime
//  session duration), FR27 (escape events).
//
//  Everything is fire-and-forget: a metric MUST never throw into the caller
//  (NFR6). Dimensions are whitelisted so a bug or hostile input can't explode
//  custom-metric cardinality (= cost) — unknown values collapse to 'other'.
//
//  Call sites land with the server-side write hooks: db.recordVoiceModeSwitch
//  (Epic 1 / Story 1.6) and addon-session finalize + end-session endpoint
//  (Epic 2). Until then this module is shipped and unit-tested directly.
// ═══════════════════════════════════════════════════════════════════

const logger = require('./logger');

const NAMESPACE = process.env.CW_VOICEMODE_NAMESPACE || 'Test12/VoiceMode';

// Low-cardinality allow-lists (mirror MODES / the source + outcome enums in the
// architecture: AR11 mode ids, AR13 source attribution, telemetry outcomes).
const MODES = new Set(['llm', 'deluxe-claude', 'deluxe-xai', 'deluxe-openai', 'none']);
const SOURCES = new Set(['ui', 'mcp', 'voice-command', 'ui-retry', 'system']);
const OUTCOMES = new Set(['success', 'failure', 'rollback', 'auto-finalized', 'timeout']);

const dim = (v, allowed) => (allowed.has(v) ? v : 'other');
const okDuration = (n) => typeof n === 'number' && isFinite(n) && n >= 0;

// FR24/FR25 — every mode-switch attempt. Count by from/to/source/outcome, plus
// end-to-end duration when known.
function recordModeSwitch(opts) {
  try {
    const { modeFrom, modeTo, source, outcome, durationMs } = opts || {};
    const d = {
      ModeFrom: dim(modeFrom, MODES),
      ModeTo: dim(modeTo, MODES),
      Source: dim(source, SOURCES),
      Outcome: dim(outcome, OUTCOMES),
    };
    logger.metric('ModeSwitch', 1, 'Count', d, {}, NAMESPACE);
    if (okDuration(durationMs)) {
      // Dimension duration by Source+Outcome only (from/to would over-split the
      // latency stat); keep ModeSwitch as the full breakdown.
      logger.metric('ModeSwitchDurationMs', durationMs, 'Milliseconds',
        { Source: d.Source, Outcome: d.Outcome }, {}, NAMESPACE);
    }
  } catch (_e) { /* fire-and-forget; never throw into the caller */ }
}

// FR26 — realtime-streaming session duration, per provider mode.
function recordRealtimeSession(opts) {
  try {
    const { mode, durationMs } = opts || {};
    if (!okDuration(durationMs)) return;
    logger.metric('RealtimeSessionDurationMs', durationMs, 'Milliseconds',
      { Mode: dim(mode, MODES) }, {}, NAMESPACE);
  } catch (_e) { /* fire-and-forget */ }
}

// FR27 — escape: exit from a paid realtime mode back to PTT while audio was in
// progress. Recorded distinctly so escape-rate can drive the bake-off decision.
function recordEscape(opts) {
  try {
    const { fromMode, source } = opts || {};
    logger.metric('EscapeEvent', 1, 'Count',
      { FromMode: dim(fromMode, MODES), Source: dim(source, SOURCES) }, {}, NAMESPACE);
  } catch (_e) { /* fire-and-forget */ }
}

module.exports = { recordModeSwitch, recordRealtimeSession, recordEscape, NAMESPACE };
