# ADR-0002 — Bare `/oma` routes to a status hub; interview gets an explicit subcommand

- Status: accepted
- Date: 2026-09-08

## Context and problem

DESIGN.md §5 draws `/make-advisor` as the pipeline entry (scan → interview → emit → validate),
but the f-006 cutover wired the bare command directly to one module: `/oma` (no args) opens the
interview stepper. Users reasonably expect a root command to expose the whole tool, not one
stage — and the stage it opened requires a prior `/oma scan`, so first contact with a fresh repo
yields a warning toast ("no advisor-brief.md — run /oma scan first") instead of guidance.
Reported as a usability complaint 2026-09-08: "if I'm calling the root command, I would expect
more of an involved wizard rather than just one module of this program."

## Decision drivers

- The root command is the only discoverable surface; it should orient, not assume pipeline state.
- Every stage's readiness is already filesystem truth (advisor-brief.md, WATCHDOG pair sidecars,
  results/report.json) — a hub can show live state with no new storage.
- f-009 (doctor staleness nudge) needs the same detection engine; a hub gives it a rendering
  surface and a reason to exist as data, not just a toast.
- Keep direct subcommands working: muscle memory, scripts, and headless flows must not regress.

## Considered options

1. **Keep bare = interview, add `/oma hub`** — zero breakage, but the front door stays
   undiscoverable; the complaint survives.
2. **Bare = status hub (chosen)** — a SelectList menu of the four stages, each row carrying
   live repo state; Enter dispatches to the existing stage handlers. `/oma interview` becomes
   the stepper's explicit name; `/oma scan|emit|validate` unchanged.
3. **Bare = guided auto-flow** (detect state, jump straight to the "next" stage) — rejected:
   hides the map, makes deliberate re-entry (re-interview, re-validate) awkward, and couples
   routing to detection correctness on day one.

## Decision outcome

- `/oma` with no args opens the hub overlay (hasUI) or prints a status summary plus the next
  suggested command (headless).
- Stage rows: `scan`, `interview`, `emit`, `validate (dev)` — validate included and marked dev
  (it scores oma's own precision fixtures; the row says so when no report exists).
- Selecting a stage dispatches to its existing handler; guards stay in the handlers (one guard
  path, no duplication). Blocked stages remain selectable and explain themselves.
- Unknown args route to the hub rather than the interview.
- SelectList + `getSelectListTheme()` per the TUI discipline; visual enrichment (boxed frames,
  glyphs, markdown panes) is a separate later slice, not part of this routing decision.

## Consequences

- Breaking change vs the f-006 cutover: bare `/oma` no longer opens the stepper; `/oma
  interview` is the new explicit name. Tests and docs updated in the same change.
- The hub needs a pure, filesystem-backed status model (`src/hub.ts`) — this is the seed of the
  f-009 doctor engine and must stay reusable outside the overlay.
- The f-007 loader rule applies unchanged (PROGRESS, f-007 section): extension runtime code may
  only import omp bundled-map packages, relative files, and bun/node builtins — the status
  model stays within it.
- Future stages (doctor) join the hub as rows; the hub is the only sanctioned growth point for
  top-level navigation.

## Confirmation evidence

- Live complaint + design session 2026-09-08 (this ADR's context).
- Routing + hub landed with `test/tui/hub.test.ts` (PTY walkthrough: rows, statuses, dispatch
  result, Esc) and `test/hub.test.ts` (status model over seeded tmpdirs); gates green — see
  PROGRESS.md f-010 section.
