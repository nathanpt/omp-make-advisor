# ADR-0001 — Ship as an OMP extension + skill, not a standalone binary

- Status: accepted
- Date: 2026-09-06

## Context and problem

The first draft of omp-make-advisor specified a standalone Rust CLI (the lunchbox shape).
Roughly 80% of the tool is AI judgment — read the code, infer project-specific traps, discuss
tradeoffs — and the runtime being targeted (advisor execution, WATCHDOG discovery, `/advisor
status` cost reporting) already lives inside an OMP session. A standalone binary would shell out
to an agent for the real work and duplicate runtime access the extension gets for free.

## Decision drivers

- The core value is in-session judgment; deterministic code is a thin sliver.
- The project's secondary goal is learning TUI design on OMP's real stack (`pi-tui` +
  `ctx.ui.custom()`), which requires being in-process.
- No desire to own a second process model, distribution path, or auth handoff.

## Considered options

1. **Standalone Rust binary (Ratatui)** — lunchbox-shaped. Rejected: wraps prompts, duplicates
   the advisor runtime, and works against the learning goal (wrong widget stack).
2. **OMP extension + skill (chosen)** — TypeScript extension via `ExtensionAPI` for the command,
   TUI, emit, and scoring; a SKILL.md procedure the agent follows for scan → brief → interview →
   emit → validate.
3. **Rely on the built-in `/advisor configure` only** — rejected: the authoring gap (blank
   `WATCHDOG.md`, no generator, no measurement) remains.

## Decision outcome

Build as an OMP extension plus skill. The design language transfers from lunchbox (grid, glyphs,
semantic color, stepper nav, safe exploration); the widget stack deliberately does not.

## Consequences

- TypeScript + `pi-tui` in-process instead of Rust + Ratatui standalone.
- Depends on OMP `ExtensionAPI` / `pi-tui` stability; the TUI contract must be re-verified
  against OMP source when it moves (last verified 2026-09-06).
- `/advisor configure` remains the canonical editor; this tool generates drafts.
- Pi support deferred: its subset differs (no roster, different staleness policy).
- No standalone distribution; the extension travels with OMP sessions.

## Confirmation evidence

- `docs/design-docs/DESIGN.md` §7 ("Why an extension, not a binary") and §12 decision table,
  reframed 2026-09-06.
- TUI contract verified against OMP `docs/tui.md` the same day (DESIGN.md §5 note).
