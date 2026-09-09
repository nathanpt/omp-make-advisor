# omp-make-advisor

Interview a project, emit the watchdogs that guard it — as an OMP extension with a TUI stepper.

**Status: implemented through f-012** — the full authoring flow works: hub → scan → interview →
emit → validate, with a split-pane status hub and a scored precision report. Outstanding: f-009
doctor (staleness nudge) and the deferred markdown detail panes (see
[docs/feature-list.json](docs/feature-list.json)).

## What it is

OMP owns the advisor/watchdog mechanism; nobody owns authoring. Blank `WATCHDOG.md`, no generator,
no measurement — advisors run with weak guidance at max reasoning. This project adds an authoring
flow:

`/oma` opens a status hub → `/oma scan` fans out 4 read-only scouts that propose candidate traps
with evidence paths → `/oma interview` walks one trap per screen (keep/edit/drop) → `/oma emit`
previews and writes a `WATCHDOG.md` + `WATCHDOG.yml` pair beside the project's standing files
(never mutates them) → `/oma validate` scores the advisor against held-out fixtures (precision +
cost).

A trap is a watch-rule for this project's advisor — a concrete statement of what a future change
must not do in a fragile area — not a bug report.

The judgment is AI work done in-session; the deterministic slivers (brief schema, emit
serialization, fixture scoring) are extension code. Every interactive flow degrades to the same
state as a file-based checklist when headless (`hasUI` branch). Secondary goal: learn pretty TUI
design on OMP's real stack (`pi-tui` + `ctx.ui.custom()`).

## Use

Install once (links this working tree — edits are live; restart omp to reload):

```
omp install /mnt/dev/projects/omp-make-advisor
```

One-off alternative: `omp -e /mnt/dev/projects/omp-make-advisor/index.ts` from a target project.

Then, in an OMP session in the target project:

| Command | What it does |
|---|---|
| `/oma` | Status hub (fullscreen split-pane): live state per stage, Enter opens the highlighted one |
| `/oma scan` | Fan out 4 read-only scouts (conc/err/data/build); writes `advisor-brief.md` |
| `/oma interview` | Stepper: one trap per screen, keep / edit / drop, evidence inline |
| `/oma emit` | Preview then write the watchdog pair (sidecars if standing files exist) |
| `/oma validate` | Scored precision report from the last `validate.sh` run (dev, this repo) |

Headless: `omp -p "<scan prompt>"`, `omp -p "/oma emit"`, `omp -p "/oma"` (summary + next action).
After emit, enable enforcement with OMP's own `/advisor on`.

## Where things live

| Question | Answer |
|---|---|
| Full design: architecture, TUI contract, curriculum, decisions | [docs/design-docs/DESIGN.md](docs/design-docs/DESIGN.md) — authoritative |
| Current state, blockers, next move | [PROGRESS.md](PROGRESS.md) |
| Machine-readable feature contract | [docs/feature-list.json](docs/feature-list.json) |
| Working rules for agents | [AGENTS.md](AGENTS.md) |
| System map (as-built, updated per slice) | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Decision records (ADRs) | [docs/decisions/README.md](docs/decisions/README.md) |
| Source reading list, mapped to features | [docs/references/index.md](docs/references/index.md) |
| Notable changes | [CHANGELOG.md](CHANGELOG.md) |

## Run / verify

```
./init.sh              # full gate: doc checks + typecheck + unit + PTY suites
npm test               # unit suite (bun)
npm run test:tui       # PTY snapshot suite (bun)
npm run gallery        # render the styled screens at 60/80 cols (no omp needed)
npm run probe          # headless omp load check
```

Live checks that need a session: `bash test/fixtures/precision/validate.sh` (recorded gate for the
validator; requires omp auth + a `@slow` model chain).
