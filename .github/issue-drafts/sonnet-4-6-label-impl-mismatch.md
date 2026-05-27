---
title: "Deluxe-Claude voice mode: server requests Sonnet 4.5 but UI labels it Sonnet 4.6"
labels: ["bug", "voice-modes"]
---

## Problem

The Deluxe-Claude voice mode (`VA_MODE = 'deluxe-claude'`) has a label/implementation mismatch between client UI and server:

- **Client UI** (`public/index.html`) labels the mode as **Sonnet 4.6**:
  - `index.html:2401` — regex matches *"switch to Sonnet 4.6"*
  - `index.html:2407` — `{ 'deluxe-claude': 'Sonnet 4.6' }`
  - `index.html:2503` — button label `"🧠 Tap to Speak (Sonnet)"`
- **Server** (`app.js`) requests **Sonnet 4.5** from the Anthropic API:
  - `app.js:1171` — `const model = isDeluxeClaude ? 'claude-sonnet-4-5' : CLAUDE_MODEL;`

A Deluxe-Claude user sees "Sonnet 4.6" in the UI but their requests go to `claude-sonnet-4-5`.

## Why this matters

- Truth in advertising — users on the paid Deluxe-Claude tier should get what the label says.
- Sonnet 4.6 is a newer/improved model than 4.5; the gap is a regression vs the UI promise.
- Surfaced during PRD work for the mode-switcher feature (`_bmad-output/planning-artifacts/prd.md`).

## Proposed fix

Bump the server-side model ID in `app.js:1171`:

```diff
- const model = isDeluxeClaude ? 'claude-sonnet-4-5' : CLAUDE_MODEL;
+ const model = isDeluxeClaude ? 'claude-sonnet-4-6' : CLAUDE_MODEL;
```

Verify `claude-sonnet-4-6` is the correct model ID per Anthropic's current naming. Also consider extracting the model ID into a named constant alongside `CLAUDE_MODEL` (e.g. `CLAUDE_SONNET_MODEL`) to prevent the label/impl pair drifting again.

## Scope check — all 4 voice modes in total

There are **4 voice modes** today, tracked by `VA_MODE`:

| `VA_MODE` | UI label | Server model | Status |
|---|---|---|---|
| `'llm'` | Haiku 4.5 | `claude-haiku-4-5` | ✓ matches |
| `'deluxe-claude'` | Sonnet 4.6 | `claude-sonnet-4-5` | ✗ **mismatch (this issue)** |
| `'deluxe-xai'` | xAI Voice Agent (`grok-voice-latest`) | `grok-voice-latest` | ✓ matches |
| `'deluxe-openai'` | OpenAI Realtime (`gpt-realtime-2`) | `gpt-realtime-2` | ✓ matches |

Only Deluxe-Claude has the label/impl drift.

## How to file this on GitHub

This file is a draft. To open the issue, either:

- **Install `gh`** and run from repo root:
  ```bash
  gh issue create --title "Deluxe-Claude voice mode: server requests Sonnet 4.5 but UI labels it Sonnet 4.6" --body-file .github/issue-drafts/sonnet-4-6-label-impl-mismatch.md --label bug --label voice-modes
  ```
- **Or** copy the markdown above (everything between the frontmatter and this "How to file" section) into a new issue at:
  https://github.com/sdegrandpre-infonuagix-ai/test12/issues/new
