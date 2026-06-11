#!/usr/bin/env node
// Live usage monitor for the BMALPH / Ralph autonomous loop.
// Cross-platform (Windows PowerShell, macOS, Linux) — designed to run inside
// Cursor's integrated terminal while Ralph develops test12.
//
// Usage:
//   node scripts/ralph-usage-monitor.mjs            # live dashboard (refresh every 2s)
//   node scripts/ralph-usage-monitor.mjs --once     # print a single snapshot and exit
//   node scripts/ralph-usage-monitor.mjs --interval 5   # custom refresh seconds

import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const RALPH = join(ROOT, '.ralph');

const STATUS_FILE = join(RALPH, 'status.json');
const PROGRESS_FILE = join(RALPH, 'progress.json');
const CALL_COUNT_FILE = join(RALPH, '.call_count');
// Ralph writes loop output to live.log; older installs use logs/ralph.log
const LOG_CANDIDATES = [join(RALPH, 'live.log'), join(RALPH, 'logs', 'ralph.log')];

const args = process.argv.slice(2);
const ONCE = args.includes('--once');
const intervalIdx = args.indexOf('--interval');
const REFRESH_MS = (intervalIdx !== -1 ? Number(args[intervalIdx + 1]) : 2) * 1000;

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m', white: '\x1b[37m',
};

function readJson(path) {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function readText(path) {
  try {
    return existsSync(path) ? readFileSync(path, 'utf8') : null;
  } catch {
    return null;
  }
}

function findLog() {
  return LOG_CANDIDATES.find((p) => existsSync(p)) || null;
}

function tail(path, n) {
  const txt = readText(path);
  if (!txt) return [];
  const lines = txt.split(/\r?\n/).filter((l) => l.length > 0);
  return lines.slice(-n);
}

function bar(used, max, width = 30) {
  if (!max || max <= 0) return '';
  const pct = Math.max(0, Math.min(1, used / max));
  const filled = Math.round(pct * width);
  const color = pct >= 0.9 ? C.red : pct >= 0.6 ? C.yellow : C.green;
  return `${color}${'█'.repeat(filled)}${C.dim}${'░'.repeat(width - filled)}${C.reset}`;
}

function statusColor(status) {
  switch ((status || '').toLowerCase()) {
    case 'running':
    case 'executing':
      return C.green;
    case 'blocked':
    case 'stopped':
    case 'error':
      return C.red;
    case 'idle':
    case 'paused':
      return C.yellow;
    default:
      return C.white;
  }
}

function ageOf(path) {
  try {
    const secs = (Date.now() - statSync(path).mtimeMs) / 1000;
    if (secs < 60) return `${Math.round(secs)}s ago`;
    if (secs < 3600) return `${Math.round(secs / 60)}m ago`;
    return `${Math.round(secs / 3600)}h ago`;
  } catch {
    return 'n/a';
  }
}

function render() {
  const status = readJson(STATUS_FILE);
  const progress = readJson(PROGRESS_FILE);
  const callCount = (readText(CALL_COUNT_FILE) || '').trim();
  const logPath = findLog();

  const out = [];
  out.push(`${C.bold}${C.cyan}╔════════════════════════════════════════════════════════════╗${C.reset}`);
  out.push(`${C.bold}${C.cyan}║              BMALPH / Ralph — Usage Monitor                ║${C.reset}`);
  out.push(`${C.bold}${C.cyan}╚════════════════════════════════════════════════════════════╝${C.reset}`);
  out.push('');

  if (!status && !progress) {
    out.push(`  ${C.yellow}Ralph is not running yet (no .ralph/status.json).${C.reset}`);
    out.push(`  ${C.dim}Start it with:${C.reset} ${C.white}bmalph run${C.reset}`);
    out.push('');
  }

  if (status) {
    const used = Number(status.calls_made_this_hour ?? 0);
    const max = Number(status.max_calls_per_hour ?? 0);
    const sc = statusColor(status.status);
    out.push(`  ${C.bold}Loop${C.reset}        #${status.loop_count ?? 0}`);
    out.push(`  ${C.bold}Status${C.reset}      ${sc}${status.status ?? 'unknown'}${C.reset}` +
      (status.exit_reason ? ` ${C.dim}(${status.exit_reason})${C.reset}` : ''));
    out.push(`  ${C.bold}Last action${C.reset} ${status.last_action ?? '—'}`);
    out.push('');
    out.push(`  ${C.bold}API calls/hour${C.reset}  ${used}/${max}   ${bar(used, max)}`);
    if (status.next_reset) out.push(`  ${C.dim}Hourly budget resets at ${status.next_reset}${C.reset}`);
    out.push(`  ${C.dim}status.json updated ${ageOf(STATUS_FILE)}${C.reset}`);
    out.push('');
  }

  if (callCount && (!status || String(status.calls_made_this_hour) !== callCount)) {
    out.push(`  ${C.dim}.call_count: ${callCount}${C.reset}`);
  }

  if (progress && (progress.status || '').toLowerCase() === 'executing') {
    out.push(`  ${C.bold}${C.yellow}▸ Driver working${C.reset} ${progress.indicator ?? ''} ` +
      `${C.dim}(${progress.elapsed_seconds ?? 0}s elapsed)${C.reset}`);
    if (progress.last_output) {
      out.push(`    ${C.dim}${String(progress.last_output).slice(0, 56)}${C.reset}`);
    }
    out.push('');
  }

  out.push(`  ${C.bold}${C.blue}Recent activity${C.reset} ${C.dim}${logPath ? `(${logPath.replace(ROOT, '.')})` : '(no log)'}${C.reset}`);
  const lines = logPath ? tail(logPath, 10) : [];
  if (lines.length === 0) {
    out.push(`    ${C.dim}— no log output —${C.reset}`);
  } else {
    for (const l of lines) out.push(`    ${C.dim}${l.slice(0, 70)}${C.reset}`);
  }

  out.push('');
  const now = new Date().toLocaleTimeString();
  out.push(`  ${C.dim}${ONCE ? 'snapshot' : `refresh ${REFRESH_MS / 1000}s · Ctrl+C to exit`} · ${now}${C.reset}`);

  return out.join('\n');
}

function draw() {
  if (!ONCE) process.stdout.write('\x1b[2J\x1b[H'); // clear screen, home cursor
  process.stdout.write(render() + '\n');
}

draw();
if (!ONCE) {
  const timer = setInterval(draw, REFRESH_MS);
  process.on('SIGINT', () => {
    clearInterval(timer);
    process.stdout.write('\x1b[?25h\n'); // restore cursor
    process.exit(0);
  });
}
