# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Versions begin once there
is a runnable artifact; until then changes accumulate under Unreleased.

## [Unreleased]

### Changed
- Design reframed from a standalone Rust binary to an OMP extension + skill
  (`docs/design-docs/DESIGN.md`; recorded as ADR-0001).

### Added
- Extension scaffold: `package.json` + `tsconfig.json` (npm, node ≥22, tsx/tsc; bun for PTY
  tests), `/make-advisor` + `/oma` command skeleton with `hasUI` guard (f-001).
- Static trap picker overlay (f-002): `SelectList`-based keep/drop picker mounted via
  `ctx.ui.custom(…, { overlay: true })`, static candidates in `src/traps.ts`.
- PTY snapshot harness (`test/tui/`): bun-spawned pi-tui host emitting JSONL frame/done/disposed
  events, driven by `bun test` accept/cancel flow tests; wired into `./init.sh`.
- Scout scan (f-003): `/oma scan` sends the 4-lens scan prompt to the session agent (read-only
  conc/err/data/build scouts, strict candidate contract); `advisor-brief.md` at the project root
  is the candidate store. `src/brief.ts` parses/serializes it (round-trip safe, statuses inline);
  bare `/oma` opens the picker preloaded with brief statuses and writes accepted keep/drop
  decisions back (evidence + rationale preserved).
- Brief parser/writer tests (`test/brief.test.ts`) and env-gated live scan E2E
  (`test/e2e/scan.e2e.test.ts`, `npm run test:e2e` with `OMA_E2E=1`).
