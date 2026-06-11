
## Git Workflow (Gitflow)

This repo follows **Gitflow** (with a QA staging tier). Long-lived branches, promotion flows downstream `develop → qa → main`:

- **`develop`** — integration branch. All story/feature work merges here first.
- **`qa`** — staging/verification branch. `develop` is promoted here for QA before release; only fixes that pass QA flow onward.
- **`main`** — production releases only. Never commit story work or open story PRs directly against `main` (or `qa`).

Story work:

1. Branch each story off `develop`, keeping the BMAD `story/<epic>.<n>-<slug>` name (e.g. `story/1.2-vmode-aria-live`). This fills Gitflow's `feature/*` role — the prefix is just convention.
2. Commit the story's work on that branch (test-first per the Playwright TDD setup).
3. Open a PR with **base = `develop`** (GitHub defaults to `main` — change it). Use `gh pr create --base develop`.
4. Stacked stories (a story built on an unmerged parent) merge in dependency order: parent → `develop` first, then the child PR auto-reduces to its own diff.
5. Promotion: `develop` → `qa` (PR) for staging verification, then `qa` → `main` (PR) cut as a `release/*` and tagged. Hotfixes branch off `main` and merge back into `main`, `qa`, and `develop`.

## BMAD-METHOD Integration

Use `/bmalph` to navigate phases. Use `/bmad-help` to discover all commands. Use `/bmalph-status` for a quick overview. See `_bmad/COMMANDS.md` for a full command reference.

### Phases

| Phase | Focus | Key Commands |
|-------|-------|-------------|
| 1. Analysis | Understand the problem | `/create-brief`, `/brainstorm-project`, `/market-research` |
| 2. Planning | Define the solution | `/create-prd`, `/create-ux` |
| 3. Solutioning | Design the architecture | `/create-architecture`, `/create-epics-stories`, `/implementation-readiness` |
| 4. Implementation | Build it | `/sprint-planning`, `/create-story`, then `/bmalph-implement` for Ralph |

### Workflow

1. Work through Phases 1-3 using BMAD agents and workflows (interactive, command-driven)
2. Run `/bmalph-implement` to transition planning artifacts into Ralph format, then start Ralph

### Management Commands

| Command | Description |
|---------|-------------|
| `/bmalph-status` | Show current phase, Ralph progress, version info |
| `/bmalph-implement` | Transition planning artifacts → prepare Ralph loop |
| `/bmalph-upgrade` | Update bundled assets to match current bmalph version |
| `/bmalph-doctor` | Check project health and report issues |

### Available Agents

| Command | Agent | Role |
|---------|-------|------|
| `/analyst` | Analyst | Research, briefs, discovery |
| `/architect` | Architect | Technical design, architecture |
| `/pm` | Product Manager | PRDs, epics, stories |
| `/sm` | Scrum Master | Sprint planning, status, coordination |
| `/dev` | Developer | Implementation, coding |
| `/ux-designer` | UX Designer | User experience, wireframes |
| `/qa` | QA Engineer | Test automation, quality assurance |
