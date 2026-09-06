# omp-make-advisor

Interview a project, emit the watchdogs that guard it — as an OMP extension with a TUI stepper.

**Status: draft, pre-implementation.** The design is complete enough to build from; no code exists yet.

## What it is

OMP owns the advisor/watchdog mechanism; nobody owns authoring. Blank `WATCHDOG.md`, no generator,
no measurement — advisors run with weak guidance at max reasoning. This project adds an authoring
flow:

`/make-advisor` (alias `oma`) → scout scan proposes candidate traps with evidence paths →
TUI stepper interview (one trap per screen, keep/edit/drop) → emit a `WATCHDOG.md` + `WATCHDOG.yml`
pair beside the project's standing files (preview first, never mutate) → validate against held-out
fixtures and score precision and cost.

The judgment is AI work done in-session; the deterministic slivers (schema check, fixture scoring)
are extension code. Headless sessions fall back to the same interview state as a file-based
checklist (`hasUI` branch). Secondary goal: learn pretty TUI design on OMP's real stack
(`pi-tui` + `ctx.ui.custom()`).

## Where things live

| Question | Answer |
|---|---|
| Full design: architecture, TUI contract, curriculum, decisions | [docs/design-docs/DESIGN.md](docs/design-docs/DESIGN.md) — authoritative |
| Current state, blockers, next move | [PROGRESS.md](PROGRESS.md) |
| Machine-readable feature contract | [docs/feature-list.json](docs/feature-list.json) |
| Working rules for agents | [AGENTS.md](AGENTS.md) |
| System map (planned state, updated per slice) | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Decision records (ADRs) | [docs/decisions/README.md](docs/decisions/README.md) |
| Source reading list, mapped to features | [docs/references/index.md](docs/references/index.md) |
| Notable changes | [CHANGELOG.md](CHANGELOG.md) |

## Run / verify

Baseline check (documentation only, pre-implementation): `./init.sh` — validates the feature
contract, markdown links, and the AGENTS.md line budget. The extension build/test path is
established by curriculum slice 1 and recorded in `AGENTS.md` at that point. Until then, see
[PROGRESS.md](PROGRESS.md).
