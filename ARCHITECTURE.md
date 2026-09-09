# ARCHITECTURE

**Status: as-built through f-012.** `docs/design-docs/DESIGN.md` stays the design intent; this
file is the map of what actually is. Outstanding: f-009 doctor (staleness nudge); deferred:
markdown detail panes (needs an initialized `MarkdownTheme` in test hosts).

## What is this system?

An OMP extension that interviews a project about its specific traps and emits a watchdog pair
(`WATCHDOG.md` + `WATCHDOG.yml`) guarding them, then scores the advisor against held-out fixtures.
The judgment is AI work done in-session; the extension contributes the deterministic slivers
(brief schema, emit serialization, fixture scoring) and the TUI surfaces.

## Where does work start?

1. A user runs `/oma` in an OMP session in the target project — bare command opens the **status
   hub** (fullscreen split-pane overlay; ADR-0002). Stages are also reachable directly:
   `/oma scan`, `/oma interview`, `/oma emit`, `/oma validate`.
2. The hub's rows carry live filesystem state (brief present? kept counts? watchdog pair?
   dev report?); Enter dispatches to the stage handler, which owns its own guards.
3. Every stage has a headless path: `omp -p "<scan prompt>"`, `omp -p "/oma emit"`, `omp -p "/oma"`
   (summary + next action). `ctx.hasUI` decides the surface.

## Components

| Component | Responsibility | Home | Key contract |
|---|---|---|---|
| Command entry + routing | `/oma` + subcommands, hub dispatch, headless fallbacks | `index.ts` (`runHub`/`runScan`/`runInterview`/`runEmit`/`runValidate`) | guards live in handlers; bare/unknown → hub (ADR-0002) |
| Hub | Status dashboard: left stage rows (SelectList, icon-column glyphs), right cursor-synced stage context; `<48` cols falls back to framed single pane | `src/hub.ts` (`readHubStatus`, `stageItems`, `HubScreen`, `renderHubSummary`) | pure fs truth; headless summary shares the same model |
| Chrome | Rounded `Box` frames, split-pane layout, dotted rules; `FrameTheme` structural slice of OMP's Theme (plain fallback for hosts) | `src/frame.ts` | chrome only — nav stays `SelectList` |
| Scan | 4 read-only scouts (conc/err/data/build) propose candidate traps with evidence | scan prompt in `index.ts` (`runScan`) + session agents | strict candidate contract; read-only |
| Brief | Interview state: candidates + per-trap keep/edit/drop | `advisor-brief.md` in the target project; `src/brief.ts` | round-trip safe; doubles as headless fallback |
| Interview TUI | One trap per screen, evidence gutter, progress, edit path | `src/interview.ts` | `SelectList` reuse; `done()` exactly once; `dispose()` idempotent; width safety |
| Emit | Preview then write the watchdog pair beside standing files | `src/preview.ts` + `src/emit.ts` + `src/advisor-yaml.ts` | never mutate standing files (sidecars); OMP serializer semantics |
| Validate | Fixtures → live advisor runs → scored report + report screen | `src/validate.ts` + `test/fixtures/precision/` (`validate.sh` runner, committed briefs, `expected.json` tasks) + `src/report.ts` | `no-run` = harness failure (exit 2); verdicts never set the exit code |
| Overlays | All screens mount via `ctx.ui.custom(..., { overlay: true, overlayOptions: { fullscreen: true } })` | `index.ts` | alternate-screen takeover (settings-page idiom); Esc returns to the session |

## Data flow

`advisor-brief.md` is the single authoring-state file: scan writes candidates, the interview (TUI
or headless edits) writes per-trap decisions, emit reads it to produce the watchdog pair. The
validator adds a second, dev-only artifact chain: `test/fixtures/precision/results/` holds
archived advisor transcripts + `report.json` + `scored-report.md` (gitignored; the recorded table
lives in PROGRESS.md). Nothing else persists between phases.

## Boundaries and invariants

- **Judgment vs code:** anything requiring reading code and inferring risk is agent work; only
  brief schema, emit serialization, and fixture scoring are extension code.
- **No mutation of standing agent files.** Emit-beside; the user moves files into place.
- **Every interactive flow has a headless path** via the brief file (and stdout for read-only
  surfaces).
- **OMP-only in v1.** Pi support is a documented later subset (different roster/staleness policy).
- **A slice is done only with its snapshot test** (DESIGN.md §6). f-011 is the recorded exception:
  `passes: false` until the deferred markdown-pane step lands.
- **Extension runtime imports**: omp bundled-map packages, relative files, bun/node builtins only
  (f-007 loader rule).

## Tests

- Unit (`npm test`, bun): brief round-trip, hub status model, advisor YAML golden, validator
  engine (extraction, verdict matrix, markdown golden), emit/roster.
- PTY snapshots (`npm run test:tui`): every overlay driven through a real pi-tui host emitting
  JSONL frame/done/disposed events. Design iteration happens in the gallery
  (`npm run gallery` — static frames at 60/80 cols), then gets pinned here.
- Live gates: `bash test/fixtures/precision/validate.sh` (recorded run), `npm run probe`.

## External dependencies

- OMP runtime: `ExtensionAPI` (commands, session/tools access, `ctx.ui`), `pi-tui` widgets
  (`Box`, `Text`, `ScrollView`, `SelectList`), `@oh-my-pi/pi-coding-agent` theme adapters.
- OMP advisor ecosystem: roster schema and discovery walk mirrored, not replaced;
  `/advisor configure` remains the canonical editor.
- No other runtime dependencies intended in v1.

## Where to look next

- `docs/design-docs/DESIGN.md` — authoritative design, TUI contract, curriculum.
- `docs/feature-list.json` — what to build next, in order (f-009 doctor is next).
- `docs/references/index.md` — OMP/CRAB sources mapped to the features that need them.
- `PROGRESS.md` — current state, recorded runs, and the f-011 markdown deferral.
