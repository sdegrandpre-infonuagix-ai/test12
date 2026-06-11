// Epic 7 / Story 7.3 — voice-mode domain metrics (namespace Test12/VoiceMode).
//
// Pure-node spec. Verifies the EMF blobs emitted by metrics.js for the bake-off
// signals (FR24–FR27): ModeSwitch (+ duration), RealtimeSessionDurationMs,
// EscapeEvent. Dimensions are whitelisted to bound custom-metric cardinality —
// unknown values collapse to 'other'. All recorders are fire-and-forget.
//
// The write hooks that CALL these (db.recordVoiceModeSwitch / addon-session
// finalize) land with Epic 1 Story 1.6 / Epic 2; this story ships + tests the
// emitter directly so those stories only have to call it.

const { test, expect } = require('@playwright/test');

const logger = require('../logger');
const metrics = require('../metrics');

// Capture the EMF lines emitted by `fn()`.
function capture(fn) {
  const lines = [];
  const restore = logger.__setSink((l) => lines.push(l));
  try { fn(); } finally { restore(); }
  return lines.map((l) => JSON.parse(l));
}

const NS = 'Test12/VoiceMode';
const nsOf = (rec) => rec._aws.CloudWatchMetrics[0].Namespace;
const dimsOf = (rec) => rec._aws.CloudWatchMetrics[0].Dimensions[0];

test.describe('Story 7.3 — voice-mode domain metrics', () => {
  test('recordModeSwitch emits ModeSwitch (Count) with from/to/source/outcome dims', () => {
    const recs = capture(() => metrics.recordModeSwitch({
      modeFrom: 'llm', modeTo: 'deluxe-xai', source: 'ui', outcome: 'success',
    }));
    const sw = recs.find((r) => r.ModeSwitch !== undefined);
    expect(sw.ModeSwitch).toBe(1);
    expect(nsOf(sw)).toBe(NS);
    expect(dimsOf(sw)).toEqual(['ModeFrom', 'ModeTo', 'Source', 'Outcome']);
    expect(sw.ModeFrom).toBe('llm');
    expect(sw.ModeTo).toBe('deluxe-xai');
    expect(sw.Source).toBe('ui');
    expect(sw.Outcome).toBe('success');
  });

  test('recordModeSwitch adds ModeSwitchDurationMs only when a valid duration is given', () => {
    const withDur = capture(() => metrics.recordModeSwitch({
      modeFrom: 'llm', modeTo: 'deluxe-claude', source: 'voice-command', outcome: 'success', durationMs: 320,
    }));
    const dur = withDur.find((r) => r.ModeSwitchDurationMs !== undefined);
    expect(dur.ModeSwitchDurationMs).toBe(320);
    expect(dur._aws.CloudWatchMetrics[0].Metrics[0].Unit).toBe('Milliseconds');
    expect(dimsOf(dur)).toEqual(['Source', 'Outcome']);

    // No duration → only the count metric, no duration metric.
    const noDur = capture(() => metrics.recordModeSwitch({ modeFrom: 'llm', modeTo: 'deluxe-xai', source: 'ui', outcome: 'failure' }));
    expect(noDur.some((r) => r.ModeSwitchDurationMs !== undefined)).toBe(false);
    expect(noDur.some((r) => r.ModeSwitch !== undefined)).toBe(true);

    // Negative / non-numeric durations are rejected.
    const bad = capture(() => metrics.recordModeSwitch({ modeFrom: 'llm', modeTo: 'llm', source: 'ui', outcome: 'rollback', durationMs: -5 }));
    expect(bad.some((r) => r.ModeSwitchDurationMs !== undefined)).toBe(false);
  });

  test('unknown dimension values collapse to "other" (cardinality guard)', () => {
    const recs = capture(() => metrics.recordModeSwitch({
      modeFrom: 'llm', modeTo: 'gpt-9-ultra', source: 'telepathy', outcome: 'explosion',
    }));
    const sw = recs.find((r) => r.ModeSwitch !== undefined);
    expect(sw.ModeFrom).toBe('llm');     // valid → kept
    expect(sw.ModeTo).toBe('other');     // unknown mode
    expect(sw.Source).toBe('other');     // unknown source
    expect(sw.Outcome).toBe('other');    // unknown outcome
  });

  test('recordRealtimeSession emits a duration metric dimensioned by Mode', () => {
    const recs = capture(() => metrics.recordRealtimeSession({ mode: 'deluxe-openai', durationMs: 18234 }));
    const s = recs.find((r) => r.RealtimeSessionDurationMs !== undefined);
    expect(s.RealtimeSessionDurationMs).toBe(18234);
    expect(nsOf(s)).toBe(NS);
    expect(dimsOf(s)).toEqual(['Mode']);
    expect(s.Mode).toBe('deluxe-openai');

    // Invalid duration → nothing emitted.
    const none = capture(() => metrics.recordRealtimeSession({ mode: 'deluxe-xai', durationMs: NaN }));
    expect(none).toHaveLength(0);
  });

  test('recordEscape emits EscapeEvent with FromMode/Source dims', () => {
    const recs = capture(() => metrics.recordEscape({ fromMode: 'deluxe-openai', source: 'ui' }));
    const e = recs.find((r) => r.EscapeEvent !== undefined);
    expect(e.EscapeEvent).toBe(1);
    expect(nsOf(e)).toBe(NS);
    expect(dimsOf(e)).toEqual(['FromMode', 'Source']);
    expect(e.FromMode).toBe('deluxe-openai');
    expect(e.Source).toBe('ui');
  });

  test('recorders are fire-and-forget — never throw on missing/garbage args', () => {
    expect(() => metrics.recordModeSwitch()).not.toThrow();
    expect(() => metrics.recordModeSwitch(null)).not.toThrow();
    expect(() => metrics.recordRealtimeSession()).not.toThrow();
    expect(() => metrics.recordEscape(undefined)).not.toThrow();
  });
});
