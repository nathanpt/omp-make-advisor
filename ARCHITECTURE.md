# ARCHITECTURE

**Status: planned.** This document describes the designed system; no code exists yet. Each landed
slice updates the as-built homes and entry points below. `docs/design-docs/DESIGN.md` stays the
design intent; this file is the map of what actually is.

## What is this system?

An OMP extension + skill that interviews a project about its specific traps and emits a watchdog
pair (`WATCHDOG.md` + `WATCHDOG.yml`) guarding them, then scores the advisor against held-out
fixtures. The judgment is AI work done in-session; the extension contributes the deterministic
slivers (schema check, emit serialization, fixture scoring) and the interview TUI.

## Where does work start?

1. A user runs `/make-advisor` (alias `oma`) in an OMP session in the target project.
2. The skill procedure drives the phases: **scan → brief → interview → emit → validate**.
3. `ctx.hasUI` decides the interview surface: TUI stepper overlay, or the same state as a
   file-based checklist (`advisor-brief.md`).

## Components

| Component | Responsibility | As-built home | Key contract |
|---|---|---|---|
| Command entry | Register `/make-advisor` / `oma`, extension lifecycle | _TBD — slice 1 (f-001)_ | `hasUI` guard before any `ctx.ui` use |
| Scan | Parallel read-only task scouts propose candidate traps with evidence paths | SKILL.md procedure + task scouts | strict candidate contract; read-only |
| Brief | Interview state: candidates + per-trap keep/edit/drop status | `advisor-brief.md` in the target project | round-trip safe; doubles as headless fallback |
| Interview TUI | One trap per screen, evidence inline, progress, edit path | extension, `ctx.ui.custom(..., { overlay: true })` | `SelectList` reuse; `done()` exactly once; `dispose()` idempotent; width safety |
| Emit | Preview then write the watchdog pair beside standing files | extension | never mutate standing files; OMP serializer semantics (literal block scalars, canonical `.yml`) |
| Validate | Fixtures → headless advisor runs → precision/cost report | extension + fixture repos | held-out traps + equal-weight clean fixtures |

## Data flow

`advisor-brief.md` is the single state file: scan writes candidates, the interview (TUI or
headless edits) writes per-trap decisions, emit reads it to produce the watchdog pair. Nothing
else persists between phases — the brief is the crash-recovery and headless-degradation mechanism
in one.

## Boundaries and invariants

- **Judgment vs code:** anything requiring reading code and inferring risk is agent work; only
  schema checks, emit serialization, and fixture scoring are extension code.
- **No mutation of standing agent files.** Emit-beside; the user moves files into place.
- **Every interactive flow has a headless path** via the brief file.
- **OMP-only in v1.** Pi support is a documented later subset (different roster/staleness policy).
- **A slice is done only with its headless snapshot test** (DESIGN.md §6).

## External dependencies

- OMP runtime: `ExtensionAPI` (commands, session/tools access, `ctx.ui`), `pi-tui` widgets.
- OMP advisor ecosystem: roster schema and discovery walk mirrored, not replaced;
  `/advisor configure` remains the canonical editor.
- No other runtime dependencies intended in v1.

## Where to look next

- `docs/design-docs/DESIGN.md` — authoritative design, TUI contract, curriculum.
- `docs/feature-list.json` — what to build next, in order.
- `docs/references/index.md` — OMP/CRAB sources mapped to the features that need them.
- `PROGRESS.md` — current state and blockers.
