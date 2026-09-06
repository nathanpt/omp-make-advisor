# AGENTS.md — omp-make-advisor

## Project overview

OMP extension + skill that interviews a project and emits a watchdog pair (`WATCHDOG.md` +
`WATCHDOG.yml`) guarding its specific traps, with a `pi-tui` stepper for the interview. Also a
learning vehicle for TUI design on OMP's real stack. Extension scaffold landed with slice 1;
`docs/design-docs/DESIGN.md` is the authoritative design.

## Commands

- `npm run typecheck` — `tsc --noEmit` over `index.ts` + `src/**/*.ts` (tests excluded).
- `npm test` — node test runner (tsx) over `test/*.test.ts`.
- `npm run test:tui` — bun test over `test/tui/` (PTY snapshot tests, f-002 gate).
- `npm run probe` — headless omp load check: `omp -e ./index.ts -p "reply with the single word ready"`.
- `./init.sh` — docs checks plus typecheck and tests (full gate).
- Interactive: `cd "$(mktemp -d)" && omp -e /mnt/dev/projects/omp-make-advisor/index.ts`, then run
  `/make-advisor` or `/oma`. Must run under a real PTY (omp via `hub` or a terminal), not a pipe.

## Hard constraints (priority order)

1. `docs/design-docs/DESIGN.md` is the contract. Read it before any design-bearing work. Deviating
   from a §12 default requires an ADR or a DESIGN.md update — never a silent divergence.
2. Never mutate standing agent files. Emit beside them; the user moves files into place.
3. Every interactive flow branches on `ctx.hasUI` and degrades to the `advisor-brief.md` file
   checklist when headless.
4. TUI discipline (verified against OMP 2026-09-06 — re-verify against OMP source if it moves):
   mount via `ctx.ui.custom(factory, { overlay: true })`; `done(result)` exactly once; `dispose()`
   idempotent; reuse `SelectList` + `getSelectListTheme()` — no hand-rolled list nav in v1; width
   safety via `visibleWidth()` / `truncateToWidth()` / `wrapTextWithAnsi()`; `replaceTabs()` on
   external content; cursor via `CURSOR_MARKER`, never position queries.
5. YAML emission mirrors OMP's advisor serializer semantics: literal block scalars, canonical
   `.yml`, round-trip safe.
6. One curriculum slice at a time (DESIGN.md §6). A slice is done only when its headless snapshot
   test exists and passes.
7. Tests must run without a live OMP session where possible; live/E2E tests are gated behind an
   env var.
8. OMP-only scope in v1. Pi support is a documented later subset, not a hidden dependency.

## Routing

- Read `docs/design-docs/DESIGN.md` before changing system boundaries or major modules. It holds
  the architecture, TUI contract, key OMP files to study, the build curriculum (§6), and the
  decision table (§12).
- Read `docs/feature-list.json` before selecting work; take exactly one highest-priority incomplete
  feature whose dependencies all pass. Update only status/evidence fields — never weaken or delete
  requirements to appear done.
- Read `PROGRESS.md` at session start: current state, blockers, unknowns, next move. Record exact
  verification commands and observed results there when finishing work.
- Read `docs/exec-plans/active/` before continuing planned work; move finished plans to
  `completed/`. Currently empty — no plans in flight.

## Decisions

For decisions that affect architecture, interfaces, data storage, security, deployment,
dependencies, or major user-visible behavior, create an ADR in `docs/decisions/` (rules and
template in its README) and link it from DESIGN.md. Read existing ADRs — starting with ADR-0001 —
before changing a decision they constrain. Supersede, never rewrite.

## Change discipline

- Before adding code or scaffolding, inspect the relevant paths and ask whether the requested outcome can be met by deleting, reusing, configuring, or extending something already present.
- Check existing implementations, platform facilities, standard-library functions, and installed dependencies before adding new code or dependencies.
- Implement the smallest complete change that satisfies the requirement. Do not add speculative abstractions, generality, files, or configuration.
- Do not reduce validation, error handling, security checks, accessibility, tests, observability, or readability merely to reduce lines.

## Completion and reporting

- A feature is passing only after its listed steps succeed; record the exact command and observed
  result in PROGRESS.md.
- Skipped or unavailable verification is `unverified`, not passing.
- Leave PROGRESS.md and feature-list.json in a state the next session can act on without reading
  this session's transcript.
