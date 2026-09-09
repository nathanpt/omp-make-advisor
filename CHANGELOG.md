# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Versions begin once there
is a runnable artifact; until then changes accumulate under Unreleased.

## [Unreleased]

### Changed
- Design reframed from a standalone Rust binary to an OMP extension + skill
  (`docs/design-docs/DESIGN.md`; recorded as ADR-0001).
- **Bare `/oma` opens the status hub**; the interview stepper is `/oma interview`, and unknown
  args route to the hub (f-010, ADR-0002). Breaking vs the f-006 cutover.
- oma overlays (`/oma` hub, `/oma validate` report) render fullscreen on the alternate screen
  (settings-page idiom) instead of floating above the live composer.

### Fixed
- Precision runner (`validate.sh`) archives advisor transcripts via per-fixture
  `--session-dir`: in the shared `~/.omp/agent/sessions` tree the `__advisor*.jsonl` projections
  land minutes after process exit, which scored every fixture `no-run` in early recorded runs.

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
- Emit (f-004): `/oma emit` previews then writes `WATCHDOG.md` + `WATCHDOG.yml` via a
  hand-checked OMP-serializer mirror (`src/advisor-yaml.ts`); standing files are never mutated —
  sidecars (`WATCHDOG.oma.*`) land beside them. Preview overlays reuse a `ScrollView` detail pane.
- Precision fixtures (f-005): six mini-repos (`test/fixtures/precision/`) with violation/clean
  splits, `expected.json`, and a baseline `run.sh`; `verifyEvidenceAnchors` liveness checks for
  brief evidence.
- Interview stepper (f-006): `/oma` walks one trap per screen — evidence gutter with line
  numbers, `2/5 ▮▮▯▯▯` progress, keep/edit/drop via `SelectList`, free-text reword with
  preview-before-apply; static `src/traps.ts` removed (brief-driven flow).
- Emit polish (f-007): scan→emit flow completion, evidence-anchor validation, keep/drop
  confirmation toasts, and a simplify pass (shared frame/theme helpers, compact candidates).
- Validator + report (f-008): `src/validate.ts` deterministic scoring engine (advise
  extraction with torn-line skip, keyword hits, keep/retune/drop verdicts, `no-run` as harness
  failure), `test/fixtures/precision/validate.sh` live runner, `/oma validate` scored-report
  screen + headless markdown; recorded run: keep 4 · retune 0 · drop 2, advisors $0.0630.
- Status hub (f-010, ADR-0002): bare `/oma` fullscreen dashboard with live per-stage state
  (`src/hub.ts` `readHubStatus` — brief counts, watchdog pair canonical/sidecar, dev report);
  headless `/oma` prints the summary + next action.
- Visual pass (f-011): `src/frame.ts` rounded frames (`FrameTheme` = structural slice of OMP's
  Theme, plain fallback for test hosts) and `npm run gallery` — static renders of every screen
  at 60/80 cols for design iteration.
- Split-pane hub + detail card (f-012): cursor-synced right pane (stage purpose + artifact
  line), status glyphs in the `SelectList` icon column, aligned-facts detail card (severity
  badge, dotted rule, dim label column, model right-aligned); framed single-pane fallback below
  48 cols.
- Scan cost visibility: every scan entry point names the models that will bill —
  `/oma scan` toast and headless output, the hub's scan pane, and the headless `/oma` summary
  all show `<provider>/<id> · 1 main + 4 scout turns` (session model from `ctx.models`; scouts
  inherit it unless agent config overrides).
- Hub scan card: cost facts grouped in the card — `models: … · 1 main + 4 scout turns` and
  `Last run cost: $X (precision runs, MM-DD)` from the dev report — and the footer right slot
  always shows the kept count instead of the advisor spend.
