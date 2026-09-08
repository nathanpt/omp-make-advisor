# PROGRESS

Updated: 2026-09-08 (f-012 split-pane session)

## Current repository state

- Git repository initialized (`main`); twenty-three commits through the f-012 split-pane hub (foundation
  docs → package scaffold → f-001..f-003 slices → install-manifest fix → f-004/f-005
  emit+preview+precision → f-006 stepper + cutover → f-007 emit + simplify pass → f-008 probe
  → f-008 validator + scored report → f-010 status hub + routing → f-011 boxed frames + gallery
  → f-012 split-pane dashboard + aligned-facts detail).
- Slices 1–4 complete and passing: `/oma scan` fans out the 4-lens scouts into
  `advisor-brief.md`; bare `/oma` opens the **status hub** (f-010, ADR-0002) — one row per
  stage with live state; `/oma interview` opens the **interview stepper** — one trap per screen with
  inline evidence lines, `3/12` progress bar, keep/edit/drop via SelectList, and a free-text
  edit screen (pi-tui `Input`) whose saved title round-trips into the brief; `/oma emit`
  previews and writes the `WATCHDOG.md` + `WATCHDOG.yml` roster pair (f-007). `src/picker.ts` is
  deleted — the stepper superseded the batch picker (DESIGN.md §2 names the stepper as THE
  interview surface; accept/cancel/preload contracts migrated to `test/tui/interview.test.ts`;
  f-002 evidence annotated as superseded).
- f-008 complete and passing: `bash test/fixtures/precision/validate.sh` runs the advisor live
  over the six precision fixtures (`--session-dir` isolated), scores archived transcripts via
  `src/validate.ts` into `results/report.json` + `scored-report.md` (gitignored; PROGRESS
  carries the recorded table), and `/oma validate` renders the report screen (SelectList rows +
  ScrollView detail) or prints the markdown headless.
- f-010 (ADR-0002): bare `/oma` opens a status hub — one SelectList row per pipeline stage
  (scan / interview / emit / validate·dev) with live filesystem state as the row description;
  Enter dispatches to the stage handler, Esc closes. `/oma interview` is the stepper's new
  explicit name; headless `/oma` prints the summary + next action. The status model
  (`src/hub.ts readHubStatus`) is pure fs truth — the seed of the f-009 doctor engine.
- f-011: oma's hub + report surfaces render in rounded `Box` frames (OMP-native look) via
  `src/frame.ts` (`frame()` + `FrameTheme` — real uiTheme in production, `PLAIN_FRAME_THEME`
  in tests/gallery); `npm run gallery` renders every styled screen at widths 60/80 for design
  iteration without launching omp.
- f-012: the hub renders as a split-pane dashboard (Option B from the 2026-09-08 design
  review) — left: stage rows with status-glyph icons; right: cursor-synced detail (what the
  stage does + its artifact line); report detail uses the aligned-facts card (severity badge,
  dotted rule, dim label column, model right-aligned).
- Toolchain: npm + node ≥22 + `tsc --noEmit`; **bun runs both test suites** (`npm test`,
  `npm run test:tui`); no build step (`omp -e index.ts` loads TS directly). devDeps
  `@oh-my-pi/pi-coding-agent`/`-pi-tui` 18.1.12 vs omp runtime now **18.1.14** (was 18.1.11
  at f-003) — all f-006 flows verified green on 18.1.14; no drift observed. f-007 added
  `@types/bun` ^1.4.2 (types the `bun` builtin import in `src/advisor-yaml.ts`).



## Confirmed working surfaces

- `/oma scan` in a UI session (PTY-hosted omp 18.1.11, temp fixture repo): start notify renders;
  4 `⟦task⟧` scouts fan out; scout-batch notifies render (staggered scouts persist in frames;
  near-simultaneous ones share a redraw window); at `agent_end` the completion notify
  "oma: scan complete — N candidates in advisor-brief.md" rendered in full post-simplify-pass
  (an earlier run saw it collide with the model's reply toast — timing, not logic).
- Bare `/oma` after a scan (f-006 stepper, live 2026-09-08 on omp 18.1.14): opens on trap 1
  with real source lines inline (`1 │ …` gutter, `… +N more lines` cap) and the `Trap 1/3 ▮▯▯`
  progress bar; the edit screen seeds the rule text, and a saved reword lands verbatim in the
  brief (`(v2 wording)` observed on disk) with the completion toast
  `oma: brief updated — kept 2, dropped 1, edited 1`; preloaded drop preselects the drop row;
  `Esc` → `oma: cancelled - brief unchanged`, md5 byte-identical.
- Headless scan (E2E, `OMA_E2E=1`): `omp -e index.ts -p "<scan prompt>"` in a planted fixture
  repo exits 0 and writes a parseable brief with existing evidence paths.
- Headless load: `omp -e ./index.ts -p …` exits 0, replies `ready`, no UI attempt.
- PTY harness (`test/tui/`): 60-col host renders frames; accept, cancel, and preload flows pass.
- Live self-scan (installed plugin, this repo, 2026-09-06): `/oma scan` wrote an 11-candidate
  `advisor-brief.md`; `parseBrief` → 11 candidates, 0 skipped; all 11 evidence anchors resolve
  with line ranges within file bounds (`verifyEvidenceAnchors` on the live brief returns `[]`).


## Active work

None in flight. f-010 (hub + routing), f-011 (visual pass), and f-012 (split-pane hub +
aligned-facts detail) are complete — f-011 remains `passes: false` on the markdown-pane step
(deferral recorded in feature-list). Next per selection rule: `f-009` (doctor staleness nudge;
deps f-004 ✓) — its detection feeds hub rows.


## Blockers and unknowns

Open questions carried from DESIGN.md §11 (none block the MVP):

1. ~~Does `omp -p --advisor` expose drain/dump semantics sufficient for unattended scoring?~~
   Resolved: yes — f-008 probe + recorded runs. Caveat found by f-008: in the shared
   `~/.omp/agent/sessions` tree the `__advisor*.jsonl` projections land minutes after process
   exit; pass `--session-dir` for prompt, reliable transcripts (see f-008 section).
2. ~~pi-tui TestBackend vs PTY harness~~ Resolved: PTY harness (`test/tui/host.ts`), bun-spawned,
   JSONL frame events — landed and passing.
3. Pricing source for cost preview (models.db vs hardcoded).
4. ~~Scoring judge: string-match on severity vs a judge model.~~ Resolved for v1: case-insensitive
   keyword match on advise notes (DESIGN §11: a judge needs its own eval). The f-008 recorded
   run exposes the known tension: build-gate's formatting nit hit keyword `test` without
   catching the substance — keyword widening or a judge stays a data/eval decision, recorded
   per-run in the report.
5. Upstream posture: contribute the extension to the OMP ecosystem or keep it local.

Resolved this session:

- Handler contract: `registerCommand(name, { description?, handler })` where handler is
  `(args: string, ctx: ExtensionCommandContext)`. Types import from the
  `@oh-my-pi/pi-coding-agent` root (`ExtensionAPI`, `ExtensionCommandContext` both exported);
  `ctx.ui.notify(message, type?)`.
- In-session imports of `@oh-my-pi/pi-tui` value exports and `getSelectListTheme()` from
  `@oh-my-pi/pi-coding-agent` resolve inside omp (plan contingency; did not trigger).
- `@oh-my-pi/pi-tui` sources import `bun:` protocols (e.g. `src/terminal.ts`), so any value
  import of the extension graph is unloadable under node/tsx — all tests run under bun.
- `Bun.spawn({ pty: true })` needs explicit `stdin: "pipe"` for `proc.stdin` to exist, and honors
  `COLUMNS`/`LINES` env (host reported 60 cols).
- SelectList filter stays off while `items.length <= maxVisible` (`#canEditSearch`), so `space`
  never feeds a type-to-filter buffer in the picker.

## Verification status

- f-001 (2026-09-06, all pass):
  - `npm run typecheck` — clean, 0 errors.
  - loader test — 1 pass (runner: bun since the fix below; passed under tsx at f-001 time
    because index.ts had no runtime pi-tui imports yet).
  - `npm run probe` — `PROBE_EXIT=0`, replied `ready` (headless load, hasUI guard silent).
  - Interactive under PTY (hub-hosted omp 18.1.11, cwd temp target project): `/make-advisor` and
    `/oma` each rendered the notify toast (confirmed in PTY captures).
- f-002 (2026-09-06, all pass):
  - `npm run typecheck` — clean with picker + overlay mount. Loader test 1 pass. `npm run
    probe` — exit 0, `ready`.
  - Interactive under PTY: overlay opens (three `[keep]` rows, `❯` cursor, evidence column);
    `↓`+`space` → `[drop] Silent catch…` frame; `Enter` → toast `oma: kept 2, dropped 1 - brief
    write lands with f-003`; reopen + `Esc` → toast `oma: cancelled - nothing recorded`.
  - `npm run test:tui` — `2 pass 0 fail` (accept flow: 60-col size event, three titles, 3×
    `[keep]`, `\x1b[B`+` `+`\r` → `{kept:["t1","t3"],dropped:["t2"]}`, `[drop]` frame, exactly one
    `done` + one `disposed`, exit 0; cancel flow: `\x1b` → `result: null`, exit 0).
  - `./init.sh` — docs checks + typecheck + `npm test` + `npm run test:tui` all green
    (`INIT_EXIT=0`, `All checks passed.`).
- f-003 (2026-09-06, all pass; commits `2556fe9`, `6c1bc6a`, `fec1a2c`):
  - `npm run typecheck` — clean. `npm test` — 7 pass (loader + 6 brief tests: round-trip,
    reload-preserves-flipped-status, malformed-block skip, duplicate-id skip, status
    normalization, empty/header-only). `npm run test:tui` — 3 pass (accept, cancel, preload:
    host seeded `dropIds:["t2"]` renders one `[drop] Never swallow` + two `[keep]`, accepts
    `{kept:["t1","t3"],dropped:["t2"]}`).
  - `npm run probe` — exit 0, replies `ready` (unchanged text).
  - `npm run test:e2e` (`OMA_E2E=1`, live model turn, 131s) — 1 pass: `omp -e index.ts -p
    "<buildScanPrompt()>"` in planted fixture repo (unlocked map mutation, `catch {}` refresh,
    schema/migration drift) exits 0, writes `advisor-brief.md`, parseBrief yields 11 candidates
    (live run) with evidence paths existing on disk.
  - Interactive PTY (hub-hosted omp, fixture repo, run once): `/oma scan` → start notify + 4
    task scouts + batch notifies; brief written (11 watch-rules, future-facing phrasing);
    `/oma` → picker preloaded; `space`+`Enter` → brief updated (`· drop ·` on disk, rationale
    preserved); reopen shows preloaded `[drop]`; `Esc` → cancelled toast, file byte-identical.
  - Plan deviations (recorded): (a) **E2E drives the scan prompt directly, not `/oma scan`** —
    `omp -p "/oma scan"` dispatches the command but `pi.sendUserMessage` does not start a turn
    before print-mode exit (observed: exit 0, no agent turn, no brief); the plan's contingency
    applied, command wiring proven by the interactive check instead; (b) PTY title assertions
    use truncation-safe substrings ("Any write to the", "Never swallow", "Any migration must")
    — the plan's "ingest map"/"auth errors"/"schema.sql" fall past the 60-col label cut;
    (c) E2E file named `scan.e2e.test.ts` (bun requires `.test.` in filenames);
    (d) completion toast collides with the model reply line (rendering artifact; see surfaces).
- Simplify pass (2026-09-06, post-f-003 review): three read-only lanes (reuse; quality;
  efficiency) over `56338ba..b90ba24`. Applied:
  - `scanState` moved into the factory closure (efficiency lane, verified against OMP source:
    task subagents re-run the extension factory against the same module instance, so
    module-level state let a scout's `agent_end` close the root's scan phase — latent under the
    18.1.11 runtime where notifies rendered, live under the 18.1.12 semantics the devDeps
    compile against).
  - `agent_end` handler honors `AgentEndEvent.willContinue` (documented contract: non-terminal
    auto-retry settles must not close the scan phase; platform-canonical pattern in omp's
    warp-events).
  - `runPicker` distinguishes ENOENT ("run /oma scan first") from other read errors
    (EACCES/EISDIR → "unreadable (code) — check permissions"); previously every failure claimed
    the file was missing.
  - Dropped the weightless `BriefCandidate→CandidateTrap` field-strip (structural subtyping
    covers it; `CandidateTrap` import removed) and the unused `SCOUT_LENSES` export (lens names
    live once, in the prompt literal).
  - E2E imports `BRIEF_FILENAME` instead of hardcoding `advisor-brief.md`; 590s watchdog +
    `proc.kill()` in finally stop the timeout path from leaking a hung omp and the temp dir.
  - AGENTS.md `npm test` line updated to the `test/*.test.ts` glob.
  Rejected: sharing one fixture between brief/PTY suites (no cross-dependency; coupling for
  symmetry), a `TrapStatus` alias (plan pinned inline unions), brief-mtime freshness check
  (rare window; the model reply line is the primary signal), templating the prompt with
  `BRIEF_FILENAME` (prompt is the plan-pinned literal; the E2E already couples prompt↔parser).
  Incident during the pass: the watchdog fix initially declared `proc`/`watchdog` inside the
  `try` block — invisible to `finally` (ReferenceError after passing assertions; tsconfig
  excludes tests, so typecheck could not catch it). Fixed by hoisting both declarations above
  `try`; live E2E re-run green.
  Verification: typecheck + `npm test` (7) + `npm run test:tui` (3) + probe (`ready`) green;
  live E2E `1 pass` (197s); interactive PTY re-check — bare `/oma` with no brief renders the
  ENOENT warning, `/oma scan` renders start + batch + full "oma: scan complete — 11 candidates
  in advisor-brief.md" notify, `/oma` picker → space+Enter writes `· drop ·` back with
  evidence intact.
- User-testing fix (2026-09-06, first real install): `omp install` linked the package but the
  extension never loaded — the installed-plugin discovery path (`plugins/loader.ts`
  `resolvePluginManifestEntries`) resolves ONLY `package.json`'s `"omp"/"pi"` manifest
  `extensions` entries; the `index.ts` fallback applies to directory discovery, not the plugin
  lock path. With no manifest, `/oma scan` fell through to the model as plain prose (user got a
  repo report instead of a scan). Fix: package.json gains `"main": "./index.ts"` +
  `"omp": { "extensions": ["./index.ts"] }`; no reinstall needed (the lock stores only
  version/enabled — the manifest is read live). Verified: headless `-p "/oma scan"` in a temp
  dir dispatches silently (1.2s, no model turn); live PTY session in herdr-lantern via plugin
  discovery (no `-e`): `/oma scan` → start + completion notifies, 9-candidate
  advisor-brief.md written with line-ranged evidence across all four lenses.
- Anchor-liveness hardening (2026-09-06, after first live self-scan): the settle path verified
  grammar only — the self-scan's anchors resolved because it was checked by hand; a hallucinated
  anchor would have flowed silently into the picker and the emit. Added
  `verifyEvidenceAnchors(cwd, candidates)` in src/brief.ts (bare paths may be directories/area
  guards; `path:line[-line]` anchors require a readable regular file whose line count covers the
  range; failures carry `unresolved`/`out-of-range` reasons) plus a warning notify in `agent_end`
  naming offending ids. Headless path unchanged (brief file remains the fallback).
  Verification: `npm run typecheck` clean; `npm test` 8 pass (new matrix test: exact-EOF range and
  bare dir pass, ghost path / past-EOF range / ranged dir fail with reasons); `./init.sh` green
  (`INIT_EXIT=0`); `npm run probe` exit 0 (`ready`); live smoke on this repo's own brief → `[]`.
- Incidents and corrections (2026-09-06):
  - **Masked test failure**: after the picker landed (f-002 commit), `npm test` under
    tsx/node began failing with `ERR_UNSUPPORTED_ESM_URL_SCHEME: Received protocol 'bun:'` —
    `@oh-my-pi/pi-tui/src/terminal.ts` imports `bun:` protocols, so node cannot load the
    extension graph. Two verification runs piped `npm test` through `tail`, which returned 0 and
    hid the failure (caught later by an unpiped `./init.sh` run: exit 1). Fix: loader test runs
    under bun (`bun test test/loader.test.ts`), `tsx` devDep removed, AGENTS.md Commands updated.
    Post-fix true exit codes: typecheck 0, `npm test` 0 (1 pass), `npm run test:tui` 0 (2 pass).
    Lesson recorded: never verify through a pipe; check `$?`/`PIPESTATUS` of the test binary.
  - **Plan deviations** (recorded): (a) `bun test test/tui/` entered init.sh at Step 5, not
    Step 3 — it exits 1 while `test/tui/` does not exist, which would leave the repo red between
    commits; (b) the plan's `tsx --test` runner was unsatisfiable once the extension imports
    pi-tui values (see incident above) — replaced with bun; (c) handler ctx typed as
    `ExtensionCommandContext` (real exported type) instead of the plan's inline structural
    annotation.
- Simplify pass (2026-09-06, post-slices review): two read-only reviewer lanes (reuse; quality/
  lifecycle) over the full session diff. Applied to `src/picker.ts`, `test/tui/host.ts`,
  `test/tui/picker.test.ts`, `package.json`:
  - Width safety only on the picker-owned header (SelectList/ScrollView already tab-replace and
    truncate every row — `scroll-view.ts` does `truncateToWidth(replaceTabs(row), …)`); header
    shortened to fit 60 cols so the `esc cancel` hint is no longer elided (was 70 cols) and is
    now asserted in the snapshot test.
  - Filter disabled via `{ overflowSearch: false }` instead of the `max(8, N)` arithmetic trick
    (SelectList's purpose-built option; identical output, robust to future row budgets).
  - `finish`/`finishCancel` collapsed into one guarded `finish(result)` (single done-once choke
    point); `KeybindingsLike.matches` now takes pi-tui's `Keybinding` union (typo-checked).
  - Harness: dead `onDone` param removed; `Instrumented.dispose` append-once; no frame emitted
    after `disposed`; frame dedup compares content (reference compare was a no-op); tests pace
    each keystroke on observed frame progression (batched inputs let renders coalesce past
    dispose — the old test only passed via post-dispose frames), assert final counts after host
    exit, fail fast if the host dies mid-wait, and clean up temp dirs.
  - peerDeps floor raised to `>=18.0.0` (16.x never tested).
  Kept deliberately: the `\r`→`\n` remap (Enter must accept even if `tui.select.confirm` is
  remapped; upstream mirrors this belt-and-braces), `KeybindingsLike` seam + host stub
  (interrupt stays production-only), `Bun.sleep` avoided per repo test-timer rule.
- f-004 + f-005 (2026-09-08, all pass):
  - **Harness refactor**: `test/tui/hostlib.ts` extracted (`Instrumented`
    generic over `Component`, `mountHost`); `test/tui/host.ts` rewritten on it,
    CLI contract unchanged. `npm run test:tui` — 3 pass post-refactor (picker
    suite; now 6 with preview suite below).
  - **Emitter**: `src/emit.ts` (`buildWatchdogMd`, `emitWatchdog`,
    `WATCHDOG_FILENAME`/`WATCHDOG_SIDECAR_FILENAME`);
    `test/emit.test.ts` — golden byte-exact (kept-only filter, empty-rationale
    form), md→brief→md round-trip identical, clobber matrix (absent → writes
    `WATCHDOG.md`, `besideStanding:false`; standing present → sidecar, standing
    buffer byte-identical).
  - **Preview**: `src/preview.ts` `WatchdogPreview` (ScrollView body, height 12,
    width-cached rebuild, done-once guard, `\r`→`\n` + literal-key
    belt-and-braces); `KeybindingsLike` now exported from `src/picker.ts`.
    `test/tui/preview-host.ts` + `test/tui/preview.test.ts` — apply
    (`\r`→`done{result:true}`), cancel (`\x1b`→`done{result:null}`), scroll
    (`\x1b[6~` PageDown reveals below-viewport marker, then confirm). 6/6 TUI
    tests pass.
  - **Command**: `/oma emit` (and `/make-advisor emit`) — `runEmit` mirrors
    runPicker's ENOENT-vs-other ladder; zero-candidates and zero-kept warn
    (UI-only); UI path previews then writes; headless writes silently (D3).
    Completions filter `scan`+`emit` by `startsWith`. Gates: `npm run
    typecheck` clean; `npm test` 11 pass; `npm run test:tui` 6 pass; `npm run
    probe` exit 0 `ready`; `./init.sh` `INIT_EXIT=0`.
  - **Live interactive PTY smoke** (hub-hosted omp 18.1.11, temp fixture repo
    with seeded 3-candidate brief): `/oma emit` renders preview header
    `WATCHDOG.md preview · enter write · esc cancel` + body; `\r` → notify
    `oma: wrote WATCHDOG.md — 2 traps`, file on disk `cmp`-identical to
    `buildWatchdogMd` output (md5 `df92fe63…`); with standing `WATCHDOG.md`
    present, header shows `WATCHDOG.oma.md preview`, `\r` writes the sidecar,
    standing md5 unchanged; `\x1b` → `oma: cancelled - nothing written`, no
    file created.
  - **f-004 step-4 interpretation** (documented per plan; step text untouched):
    "literal block scalars / round-trip" is the `WATCHDOG.yml` serializer
    concern (`advisor/config.ts:271-275`) and lands with f-007. For the md
    artifact it is satisfied as byte-stable deterministic emission + golden +
    regenerate-from-re-parsed-brief round-trip (both in `test/emit.test.ts`).
  - **f-005 precision run** (recorded run = third; see incident below):
    `bash test/fixtures/precision/run.sh` — 6 live headless scans (one per
    fixture, `timeout 300`, temp scratch repos, briefs archived under
    `test/fixtures/precision/results/`, gitignored), exit 0. Scoring (throwaway
    bun script, not committed): `parseBrief` + `verifyEvidenceAnchors` at each
    fixture root + case-insensitive title keywords per `expected.json`.

    | fixture | kind | flagged | evidence resolved | verdict |
    |---|---|---|---|---|
    | conc-map | violation | yes (conc-2 `withIngestLock`, conc-3 `Map`, build-2) | 12/12 | hit |
    | err-swallow | violation | no (no title contains swallow/auth) | 9/11 | keyword miss; substance caught (err-1, `src/auth/session.ts:14-17`) |
    | data-drift | violation | yes (data-1/2/3) | 6/6 | hit |
    | build-gate | violation | yes (8 candidates incl. err-1/2, build-1/3) | 9/9 | hit |
    | clean-tidy | clean | 9 candidates, all resolving | 9/9 | false positive |
    | clean-empty | clean | 1 candidate, resolving | 1/1 | false positive |

    Findings recorded as-is (f-005 passes on the run being executed and
    honestly logged, per pinned rule): 3/4 violations flagged with resolving
    evidence; err-swallow's trap is caught in substance but phrased without
    the literal expected keywords (keyword lists may need synonym widening or
    a semantic judge — feeds the f-008 scoring-judge question); both clean
    negatives false-positived — scouts emit defensive future-facing watch-rules
    even on deliberately boring repos, so v1 recall is high but specificity on
    clean trees is low (candidate count is not a cleanliness signal; the
    keep/drop interview is the filter). err-swallow also produced 2 candidates
    with non-conforming evidence syntax (`path (with path)`); the anchor check
    correctly fails them at settle.
  - **Incident — precision harness nested-copy bug**: run.sh's first copy line
    (`cp -r "$HERE/$name" "$tmp"/.`) copied the fixture DIRECTORY into the
    scratch repo, so scans ran one level above the intended root and evidence
    was correctly prefixed `<name>/path…`; scoring against the fixture root
    then showed 0 resolved everywhere. Two full morning runs were discarded
    after two single-fixture probes (contents-at-root with de-pathed README
    H1; contents-at-root with original H1 — both fully resolving) isolated the
    copy line as the sole cause (README H1 exonerated). Fixed to
    `cp -r "$HERE/$name/." "$tmp"/`; the table above is from the fixed run.

- f-006 (2026-09-08, all pass; commits `d24a122` slice 3, `37ef13d` slice 4, cutover commit):
  - **Slice 3 — stepper**: `src/interview.ts` `InterviewStepper` (SelectList keep/edit/drop
    per trap, one trap per screen, `Trap n/m ▮▯▯` position bar painted with
    `getSelectListTheme().selectedText`, rationale line, `Evidence:` anchor + guttered source
    lines wrapped with indent-preserving continuations and a `… +N more lines` cap);
    `readEvidenceContext(cwd, evidence, maxLines=5)` in src/brief.ts shares the
    `EVIDENCE_RANGE` grammar with `verifyEvidenceAnchors` (dirs/ghosts/past-EOF → null).
    `src/keybindings.ts` extracted as the shared `KeybindingsLike` seam.
  - **Slice 4 — edit flow**: pi-tui `Input` seeded with the rule title, `focused = true`
    (CURSOR_MARKER), enter save / esc revert, exit resets the SelectList cursor to the
    status row. Empty-submit guard protects the brief block grammar (title must be non-empty).
  - **Cutover**: bare `/oma` now runs `runInterview` (was `runPicker`); decisions write back
    titles+statuses onto the parsed candidates (evidence/rationale survive); completion toast
    `oma: brief updated — kept N, dropped M, edited K`. `src/picker.ts`, `test/tui/host.ts`,
    `test/tui/picker.test.ts` deleted; `src/preview.ts` imports the seam from
    `src/keybindings.js`. `/oma emit` unchanged — edited titles flow into WATCHDOG.md via the
    brief automatically.
  - Tests: `test/brief.test.ts` +1 (readEvidenceContext matrix: in-cap range, over-cap
    elision, single-line, exact-EOF, bare-file preview, dir/ghost/past-EOF → null);
    `test/tui/interview.test.ts` 7 PTY tests (walkthrough w/ inline evidence + bar + dir
    evidence without lines, drop, cancel, preload, edit-save round-trip incl. wrapped-title
    assertion, edit-esc revert, empty-submit guard via live-input probe).
  - Gates: `npm run typecheck` clean; `npm test` 12 pass; `npm run test:tui` 10 pass;
    `npm run probe` PROBE_EXIT=0 `ready` (unpiped); `./init.sh` INIT_EXIT=0
    `All checks passed.` (unpiped).
  - Live interactive PTY smoke (hub-hosted omp **18.1.14**, temp fixture repo with seeded
    3-candidate brief): stepper opened with real `src/ingest/loop.ts:1-5` lines inline;
    t2 edit appended ` (v2 wording)` — decision screen + brief on disk both carry the new
    title; t3 drop preselected from status; toast `oma: brief updated — kept 2, dropped 1,
    edited 1`; reopen + Esc → `oma: cancelled - brief unchanged`, md5 byte-identical; no
    WATCHDOG files written by the stray toast below.
  - **Incident — edit-screen empty-submit bug (caught by the PTY test)**: the guard skipped
    the empty assignment but still fell through to `exitEdit()` — comment said "stay on the
    edit screen", code left it. Found via the live-input probe (after ctrl+u + `\r`, a typed
    `Z` landed on the SelectList instead of the input). Fixed with an early return.
  - **Test-authoring lessons** (recorded for f-007/f-008 PTY work): (a) 60-col renders wrap
    appended title text across lines — assert wrapped segments, never the joined string;
    (b) keybinding-driven keys must be sent as single input events — `\x7f`.repeat(80) as one
    write matches no binding; use one-shot keys like ctrl+u (`tui.editor.deleteToLineStart`);
    (c) the cursor glyph follows the host symbol preset (ASCII `>` vs production `❯`) —
    assert the cursor row via indentation (`/^\S/` + word boundary), not the glyph.
  - **Observation, unexplained (omp 18.1.14)**: a `oma: cancelled - nothing written` toast
    appeared in the smoke session's scrollback before any interactive keystroke, with no
    WATCHDOG file written. Most plausible: the hub text-send's trailing enter interacted with
    omp's command-completion palette and dispatched `/oma emit`, whose preview the subsequent
    Esc cancelled. Bare `/oma` provably opened the stepper on both invocations; re-check when
    driving omp 18.1.14 via hub text sends.

- Simplify pass (2026-09-08, post-f-006): three read-only reviewer lanes (reuse; quality;
  efficiency) over `d24a122..HEAD` — which includes the f-004/f-005 work that had been left
  uncommitted and was swept into the slice-3 commit by its `git add -A` (commit-hygiene note;
  no history rewrite performed). Applied:
  - **Anchor semantics aligned** (all three lanes converged): `verifyEvidenceAnchors` now
    counts real lines only (trailing newline ≠ a line — a hallucinated `:1-4` on a 3-line
    file previously passed liveness while the interview clamped it), validates `start ≥ 1`
    and `start ≤ end` (inverted `:5-2` and `:0` previously passed silently), and skips the
    file read entirely for bare-path candidates whose line count was unused.
    `readEvidenceContext` returns null for `start < 1` (was a degenerate non-null context,
    contradicting its doc). Matrix extended: trailing-newline exact-EOF passes, phantom-EOF /
    inverted / zero fail, `readEvidenceContext` degenerate cases pinned.
  - **Sidecar decision deduplicated**: `watchdogTargetName(cwd)` exported from emit.ts;
    index.ts's preview header and completion notify interpolate
    `WATCHDOG_FILENAME`/`WATCHDOG_SIDECAR_FILENAME` instead of hardcoded strings.
  - **PTY harness deduplicated**: `test/tui/spawn.ts` (SpawnedHost/spawnHost/Event — the
    ~70-line spawn/poll/waitUntil block duplicated verbatim across interview and preview
    suites) and `runOverlayHost` in hostlib.ts (stub keybindings + done-event + dispose +
    settle-delay stop shared by both host scripts). `cursorOn` tightened to the actual `> `
    cursor-row prefix (was any unindented line containing the word).
  - Clarity: derived `KEEP_ROW`/`DROP_ROW` replace magic `? 2 : 0` in buildList;
    index.ts agent_end block re-indented + double blank collapsed; stale `picker.ts`
    references in preview.ts and preview-host.ts comments fixed; index/index≡decisions
    invariants and exitEdit's save-and-revert behavior documented; unused
    existsSync/path-join imports dropped from index.ts.
  Rejected: merging the runInterview/runEmit read-guard prologues (headless behaviors
  genuinely differ — a shared helper needs mode flags), folding `editing` into
  `input !== null` / dropping empty `dispose()` overrides / removing the `[...CHOICES]`
  defensive spread (intentional explicitness + TUI discipline), a structural merge of
  verifyEvidenceAnchors + readEvidenceContext into one core (different output shapes; the
  shared semantics are now pinned by tests instead), `padding()` over `" ".repeat` (style).
  Verification: typecheck clean; `npm test` 12 pass (extended anchor matrix);
  `npm run test:tui` 10 pass on the shared harness; probe exit 0 `ready` (unpiped);
  `./init.sh` INIT_EXIT=0 (unpiped). Live smoke on this repo's own 11-candidate brief:
  10/11 anchors pass under the stricter rules; the single failure is `conc-3` citing
  `src/picker.ts:76-88` — a file deleted by the f-006 cutover, correctly flagged
  unresolved (zero false positives; f-009's staleness signal firing on real data —
  rescan or drop conc-3 when next touching the brief).

- f-007 (2026-09-08, all pass):
  - **Roster emission**: `src/emit.ts` gains `WATCHDOG_YML_FILENAME`/`WATCHDOG_YML_SIDECAR_FILENAME`
    (`.oma.yml` sidecar), `buildRosterDoc` (kept candidates grouped by lens id prefix → one
    advisor per present lens, top 3 by kept count, `LENS_ORDER` breaks ties via stable sort;
    no lens ids → single fallback `Trap Watcher`; each advisor `model: "@slow"`, `tools:
    [read, grep, glob]`, no `enabled` key), `buildWatchdogYml` (composes the vendored
    serializer over the doc; `index.ts` calls `serializeAdvisorConfig` directly for the
    single-build count path).
    `watchdogTargetName`/`emitWatchdog` generalized to `besideTarget(cwd, canonical,
    sidecar)`/`emitBeside(…)` (clean cutover, all callers migrated — f-006 simplify pass's
    `watchdogTargetName` export superseded). `index.ts` `runEmit`: md preview → yml preview
    (Esc on either cancels everything, nothing written), then md-then-yml writes; combined
    notify `oma: wrote WATCHDOG.md + WATCHDOG.yml — N traps, M advisors — enable with
    /advisor on` (sidecar case names the actual written pair); `emit` completion description
    updated; headless writes both silently (D3 unchanged).
  - **Discovery — omp extension loader resolves unbundled bare imports from the session cwd**
    (load-bearing for every future slice): omp's `legacy-pi-compat` graph rewrite maps only
    its bundled specifier keys (`@oh-my-pi/pi-coding-agent` root + listed subpaths — NOT
    `advisor/*`, NOT `@oh-my-pi/omptype`) and resolves everything else against cwd
    node_modules. The plan's runtime import of `@oh-my-pi/pi-coding-agent/advisor/config`
    therefore failed from any cwd without our node_modules — static AND dynamic (`await
    import`, which the graph rewrite still tags `?mtime=`, moving the failure into
    `config.ts`'s own `omptype` import) — with `Cannot find package '@oh-my-pi/omptype'`.
    `npm run probe` passed throughout because cwd == repo; the *installed* plugin
    (`~/.omp/plugins` link) was broken everywhere until this fix. Resolution: serializer
    **vendored verbatim** into `src/advisor-yaml.ts` (`appendYamlString` +
    `serializeWatchdogConfig` from pi-coding-agent 18.1.12; only import is `YAML` from
    `bun` — the same encoder OMP itself calls), with byte-equivalence pinned by tests
    against OMP's real `serializeWatchdogConfig` (chomp edges `|2`/`|2-`/`|2+`, empty
    `tools: []`, `enabled`, quoting). DESIGN.md §2's "reuse OMP's own serializer semantics"
    holds (verbatim copy + enforced equivalence); plan's runtime-reuse mechanism recorded
    as deviated. **Rule: extension runtime code may only import omp bundled-map packages
    (`@oh-my-pi/pi-coding-agent` root, `@oh-my-pi/pi-tui`), relative files, and bun/node
    builtins; type-only imports of anything are fine (erased).**
  - Plan deviations (recorded): (a) runtime serializer import → vendored copy (above);
    (b) roster "dropped excluded" test drops BOTH conc candidates — the plan's fixture text
    ("conc-2 dropped") cannot produce its own pinned expected output `[Error Handling,
    Data Drift, Build Gate]` (conc-1 kept alone still ties into the top 3); expected output
    treated as contract; (c) golden pins `|2-` literal blocks (strip chomp, no trailing
    newline) — plan's "`|2`" was loose prose; serializer source line 288 confirms.
  - Tests: `test/emit.test.ts` — md golden + md round-trip (migrated to `emitBeside`/
    `besideTarget`), yml golden (pinned exact string; reviewed before committing: key order
    name → model → tools → instructions, quoted `"@slow"`, top-level `instructions:` first,
    single trailing newline), yml round-trip through OMP's real `loadWatchdogConfigFile` →
    `serializeWatchdogConfig` byte-identical, vendored-vs-OMP serializer equivalence on
    edge docs, `emitBeside` clobber matrix over both md and yml pairs.
    `test/roster.test.ts` — ranking (count desc, LENS_ORDER ties, cap 3), dropped-lens
    exclusion, fallback `Trap Watcher`, and the f-007 step-1 discovery-walk validation
    (`mkdtemp` project dir + empty temp `agentDir`; names in order, `@slow`, read/grep/glob,
    attribution in `sharedInstructions`).
  - Gates: `npm run typecheck` clean; `npm test` **19 pass**; `npm run test:tui` 10 pass;
    `npm run probe` exit 0 `ready`; `./init.sh` `All checks passed.` (all exit codes unpiped).
  - Headless new-behavior proof (temp dir, seeded 3-candidate brief conc-1/err-1 keep,
    data-1 drop): `omp -e <repo>/index.ts -p "/oma emit"` exit 0; `WATCHDOG.md` lists the 2
    kept traps; `WATCHDOG.yml` discovery (bun, absolute-path import, empty agentDir) yields
    exactly `[Concurrency Watcher, Error Handling Watcher]` + attribution; re-run with
    standing files → `WATCHDOG.oma.md`/`WATCHDOG.oma.yml` sidecars, standing md5s
    byte-identical (`90479f83…`/`f3f101ed…` — identical across headless and PTY runs).
  - Live PTY smoke (hub-hosted omp 18.1.14, fixture repo): `/oma emit` → header
    `WATCHDOG.md preview · enter write · esc cancel` → Enter → `WATCHDOG.yml preview` →
    Enter → toast `oma: wrote WATCHDOG.md + WATCHDOG.yml — 2 traps, 2 advisors — enable
    with /advisor on`, both files on disk; standing-file re-run → `WATCHDOG.oma.md
    preview` + `WATCHDOG.oma.yml preview` headers, sidecar toast `oma: wrote
    WATCHDOG.oma.md + WATCHDOG.oma.yml beside standing files — review, then move into
    place — enable with /advisor on`, standing md5s unchanged; third run Esc on the yml
    preview → `oma: cancelled - nothing written`, all four md5s unchanged, no new files.

- Simplify pass (2026-09-08, post-f-007): three read-only reviewer lanes (reuse; quality;
  efficiency) over the uncommitted f-007 diff. Applied:
  - Re-indented the runEmit block the f-007 edit had landed one tab shallow of its
    siblings (introduced by the session's own edit, caught by review).
  - Mixed sidecar toast fixed: `||` routed the md-standing/yml-fresh case (every f-004
    upgrader) into the both-sidecar message, telling the user to "move into place" a
    WATCHDOG.yml already at its canonical path. Now the both-standing guidance gates on
    `&&`; other cases render the counts form with `(beside standing)` annotated per
    sidecar name. Both-absent toast is byte-identical to the PTY-verified text.
  - Notify names derive from `basename(emitBeside result.path)` — third copy of the
    standing→name mapping removed; notify reports post-write truth.
  - Deleted the weightless `serializeRosterDoc` alias; `buildWatchdogYml` composes
    `serializeAdvisorConfig` directly and `index.ts` imports the vendored serializer
    (one name chain, not three).
  - Lens ids now a `Lens` union: `LENS_ORDER: readonly Lens[]`, `LENS_ROLES:
    Record<Lens, …>` (missing-entry became a compile error), `LENS_PREFIX` derived from
    `LENS_ORDER` (regex can't drift from the ranking set).
  - `besideTarget` doc comment corrected (notify derives from emitBeside's result, not
    besideTarget); vendored-file header now names the export rename
    (`serializeAdvisorConfig` vs upstream) and why; roster.test.ts uses
    `WATCHDOG_YML_FILENAME` instead of a hardcoded string; PROGRESS @types/bun version
    corrected to ^1.4.2 (effective state).
  Rejected: merging runInterview/runEmit brief-read guard prologues (recorded rejection
  from the post-f-006 pass stands — headless behaviors genuinely differ); extracting a
  kept-filter helper (weightless one-expression predicate ×4); shared withTempDir test
  helper (repo inline convention); `wx`-flag atomic write in emitBeside (residual
  stat→write TOCTOU window is microseconds with bounded regeneration consequence;
  documented write-time re-check is the standard idiom — deferred hardening); merging
  the two cancel branches (explicitness); a canonical/sidecar pair type (two constants,
  no growth path); renaming the vendored export to the upstream name (would shadow OMP's
  real export in the equivalence pin test — header note instead).
  Verification: `npm run typecheck` clean; `npm test` 19 pass; `npm run probe` exit 0
  `ready`; `./init.sh` `All checks passed.`; PTY re-smoke of the changed toast surface
  (both-absent byte-identical, mixed md-standing shows the annotated counts form, yml
  written canonical, md sidecar only).

- f-008 (2026-09-08, all pass):
  - **Scoring engine** (`src/validate.ts`, pure functions + one fs entry): `extractAdvisorTranscript`
    (per-line JSON.parse in try/catch — torn append-only tails skipped, never fatal; assistant
    records contribute `usage.cost.total`, distinct `model`, and `toolCall name="advise"` content
    items as `{note, severity}`, unknown severities coerced to `nit`), `scoreFixture` (hits =
    case-insensitive substring of expected keywords in any note; verdicts in order — no-run →
    drop; violation: hits → keep, advises → retune, else drop; clean: silent → keep, noise →
    retune), `buildReport` (generatedAt `""` — the runner stamps it), `renderReportMarkdown`
    (golden-pinned), `scoreFromResults` (script entry: expected.json + `<name>.advisor.<slug>.jsonl`
    globs → report.json + scored-report.md + stdout). `test/validate.test.ts`: extraction incl.
    malformed-line skip + severity default/coercion + cost over non-advise turns + models,
    five-path verdict matrix + no-run, markdown golden (highest severity ranking, advise
    sections, no-run cell, single trailing newline), case-insensitive hits (`Auth` vs
    `auth failure`).
  - **Fixture data**: `expected.json` gains per-fixture `task` prompts (exact strings passed to
    `omp -p --advisor --auto-approve`); one committed `advisor-brief.md` per fixture, GENERATED
    via `briefToText` (format cannot drift; round-trip + keep-anchor liveness asserted at
    generation). Drop candidates deliberately cite cross-lens paths that don't resolve in the
    fixture — dropped at emit, never reach the roster. One plan correction: conc-1 evidence is
    `src/ingest/loop.ts:1-15` (plan said `1-20`; the file has 15 lines — `verifyEvidenceAnchors`
    would flag it).
  - **Live runner** (`test/fixtures/precision/validate.sh`): per fixture — fresh temp copy
    (`/.` form), headless `/oma emit`, one `timeout 300 omp -p --advisor --auto-approve`
    turn (nonzero exit warns, never aborts the loop), transcript harvest, then `scoreFromResults`
    via bun. Exit 0 when every fixture scored, 2 on any no-run (harness failure ≠ advisor
    miss); verdicts never set the exit code — the report is the product. Per-fixture archives
    cleared up front so a no-run can never score a previous run's transcripts.
  - **Discovery — shared sessions tree projects `__advisor*.jsonl` minutes late;
    `--session-dir` writes directly.** Recorded runs 1–2 scored 6×no-run: harvests polling
    immediately, +45s/fixture, and +240s global all found nothing, yet every transcript
    eventually materialized at its final path 1–8 min after the `omp -p` exit (mtimes backdated
    to mid-turn; slug-dir entries flickered file↔dir across checks). Root cause class: the
    shared `~/.omp/agent/sessions` tree is broker-synced (`__omp_worker_daemon_broker`,
    IndexedSessionStorage projections); a custom `--session-dir` bypasses it — verified by a
    live poll probe: transcript on disk ≤1s after turn end, flat layout, exactly one session
    per fixture dir (no newest-session disambiguation needed). Runner commits the
    `--session-dir` shape; the failed runs' session dirs retained under
    `~/.omp/agent/sessions/-tmp-oma-validate-*` as evidence.
  - **Report screen** (`src/report.ts`, `/oma validate` in `index.ts`): SelectList rows
    `${name} · ${statusLine} · ${verdict}` (flagged/off-keyword/silent/noise/clean/no
    transcript), footer `advisors $X.XXXX · keep K · retune R · drop D`; Enter → ScrollView
    detail (`- [severity] (slug) note` wrapped, `keywords: … · hits: …`, `cost $… · model …`),
    Esc detail→list, Esc list→`done(false)` exactly once, dispose idempotent. Missing report →
    `oma: no report found — run bash test/fixtures/precision/validate.sh first`; malformed →
    `oma: report.json is malformed — re-run validate.sh` (notify headed, console headless);
    headless success prints the markdown (D3). PTY snapshot `test/tui/report.test.ts` +
    `report-host.ts` (fixed 3-fixture report: keep-flagged / retune-noise / drop-no-run).
    f-007 lesson re-applied: assert wrapped segments, not joined strings (the first run's
    joined-string assert failed on the 60-col wrap).
  - **Recorded run** (`bash test/fixtures/precision/validate.sh`, repo root, 2026-09-08, exit 0,
    158s; results/ gitignored — this is the durable record):

    | fixture | kind | verdict | advises | severity | hits | cost |
    |---|---|---|---|---|---|---|
    | conc-map | violation | keep | 1 | concern | lock | $0.0145 |
    | err-swallow | violation | drop | 0 | — | — | $0.0084 |
    | data-drift | violation | drop | 0 | — | — | $0.0083 |
    | build-gate | violation | keep | 1 | nit | test | $0.0186 |
    | clean-tidy | clean | keep | 0 | — | — | $0.0088 |
    | clean-empty | clean | keep | 0 | — | — | $0.0044 |

    `Run: 2026-09-08T20:15:23.865Z · advisors $0.0630 · keep 4 · retune 0 · drop 2`. Findings,
    as-is: conc-map caught in substance (concern — wrap the delete in `withIngestLock`);
    build-gate's only advise was a formatting nit (dropped leading tab) that hit keyword
    `test` — keyword-keep without substance catch; err-swallow and data-drift were silent
    misses (advisors spent $0.0084/$0.0083 reviewing, never advised); both clean fixtures
    correctly silent — 2/2 specificity at the advisor stage (the f-005 scan-phase
    clean-fixture false-positive problem does not reproduce here). Advisor models glm-5.3
    throughout. The plan's keyword-widening contingency (≥2 retunes from keyword misses) did
    not trigger; no keywords changed.
  - **Artifact check**: `results/report.json` parses (6 fixtures, totals `{keep 4, retune 0,
    drop 2}`); `results/scored-report.md` byte-equals `renderReportMarkdown(report)`; six
    `<name>.advisor.<slug>.jsonl` transcripts archived.
  - PTY smoke (hub-hosted omp 18.1.14, repo cwd): `/oma validate` → list header + six rows
    (cursor on conc-map) + footer; Enter → detail (header, wrapped note, keywords/hits,
    cost/model); Esc → list; Esc → overlay closed, main UI restored, process healthy.
  - Gates: `npm run typecheck` clean; `npm test` **24 pass**; `npm run test:tui` **11 pass**;
    `npm run probe` exit 0 `ready`; `./init.sh` `All checks passed.` (all exit codes unpiped).

- f-010 (2026-09-08, all pass) — status hub + command re-routing (ADR-0002):
  - **ADR-0002** (`docs/decisions/0002-bare-oma-routes-to-status-hub.md`): bare `/oma` → hub;
    `/oma interview` named; unknown args route to the hub (was: interview). DESIGN.md §5 entry
    label + §12 "Root command" row updated; decisions index updated. Considered and rejected:
    `/oma hub` alias (front door stays undiscoverable), auto-flow routing (hides the map).
  - **Status model** (`src/hub.ts`): `readHubStatus(cwd)` — brief presence/counts via
    `readBrief`, watchdog pair per file (canonical/sidecar/none via emit.ts constants),
    dev report (none/ready/malformed) from `test/fixtures/precision/results/report.json`.
    Pure + fs-only (f-007 loader rule respected). `nextAction()` ladder: scan → interview →
    emit → move sidecars → `/advisor on`. `renderHubSummary()` for headless.
  - **HubScreen**: SelectList (getSelectListTheme) rows `scan|-interview|emit|validate · dev`,
    descriptions = live state (`✓ advisor-brief · 6 traps`, `⚠ sidecars to move`,
    `✓ report 09-08 $0.06`, …), header `oma · <project> · enter open · esc close` (project name
    answers "which repo am I in"), footer `flow: scan → interview → emit → /advisor on`.
    Enter → `done(action)`; index.ts dispatches to the existing handlers — guards stay in the
    handlers, one guard path, blocked rows remain selectable and self-explanatory.
  - **Routing** (`index.ts`): bare + unknown → `runHub`; `scan|interview|emit|validate`
    explicit; completion adds `interview`; command description now names the hub. Headless
    `runHub` prints `renderHubSummary` lines (D3).
  - Tests: `test/hub.test.ts` (4) — empty repo, seeded repo (sidecar md + canonical yml +
    ready report), next-action ladder (interview/emit/activate), malformed report. PTY
    `test/tui/hub.test.ts` (2) + `hub-host.ts` (fixed mid-flow status) — header/rows/footer,
    Enter → done `scan` exactly once, Esc → done null exactly once, dispose once. Truncation
    lesson applied same-day: `✓ advisor-brief · 6 traps` renders as `…· 6 trap` at 60 cols —
    assert surviving segments.
  - Live smoke (hub-hosted omp 18.1.14, seeded temp repo: conc-map brief 3 traps / 2 kept +
    canonical standing pair): `/oma` → hub rendered with all four rows showing true state
    (`✓ advisor-brief · 3 traps`, `✓ 2 of 3 kept`, `✓ pair in place`, `— no report (dev)`).
    Headless `omp -p "/oma"` in the same repo printed the summary + `next: /advisor on (if not
    already)`. Enter-dispatch pinned by the PTY test (live Enter would start a paid scan turn).
  - Gates: `npm run typecheck` clean; `npm test` **28 pass**; `npm run test:tui` **13 pass**;
    `./init.sh` `All checks passed.`; `npm run probe` exit 0 `ready` (exit codes unpiped).

- f-012 (2026-09-08, all pass) — split-pane hub + aligned-facts detail (user-picked Option B +
  Detail i):
  - **Layout**: `splitPane()` in `src/frame.ts` — captioned top border with `teeDown`, left
    rows (25 cells) + divider + right rows (32 cells at 60 cols), `teeUp` rule, footer row with
    right-aligned meta, plain bottom border. All junction glyphs come from `theme.boxRound`
    (rounded boxes reuse sharp tees per theme-class); `FrameTheme.fg` gained
    `success|warning|error` (verified ThemeColor tokens) for severity/verdict tones.
  - **HubScreen**: SelectList `icon` column carries the status glyph (✓/⚠/—) — discovered the
    hard way that the label+description two-column layout only activates at width > 40
    (select-list.ts:445), so descriptions can't survive a 25-cell pane; labels are compact
    (`scan · 6 traps`, `interview · 4/6`), rich state moved to the right pane
    (STAGE_ABOUT/stageMeta). `list.onSelectionChange` drives the right pane; footer right
    shows `advisors $X` (report ready) or the kept count. Below 48 cols: framed single-pane
    fallback.
  - **ReportScreen detail**: `buildDetailRows` — `● SEVERITY · slug` badge (severity-toned),
    wrapped note, `dottedRule()` (boxDotted.horizontal), dim label column
    (`keywords/hits/cost`, labels padEnd 11 before coloring so widths stay ANSI-safe), hits
    in `success` when present, model right-aligned. Headless summary keeps the LONG
    descriptions (D3 stdout); PTY rows stay telegraphic.
  - Live smoke (hub-hosted omp 18.1.14, seeded repo): `/oma` → split pane with true state;
    DOWN moved the cursor and the right pane flipped to the interview copy; Esc closed cleanly.
  - Gates: `npm run typecheck` clean; `npm test` **28 pass**; `npm run test:tui` **13 pass**;
    `./init.sh` `All checks passed.` (exit codes unpiped).

## Next useful move

Start `f-009` (doctor staleness nudge; deps f-004 ✓). The detection engine is now
`readHubStatus` — extend it with the staleness signal (`verifyEvidenceAnchors` reuse at
interview/doctor time per the carried note) and surface warning rows in the hub. Headless
variant per constraint 3. `f-011`/`f-012` (visual pass, split-pane hub) are done — the gallery
(`npm run gallery`) remains the tool for further styling experiments; interview/preview
restyle can adopt the same frame/split language when picked up.

- f-008 probe (2026-09-08, live): conc-map fixture + emitted WATCHDOG pair;
  `timeout 300 omp -p --advisor --auto-approve "add dropBatch() deleting from batchIndex"`.
  Exit 0 in 56s. Findings: (1) roster advisor built from the emitted `WATCHDOG.yml`
  (`Concurrency Watcher`), `@slow` resolved to a live model — f-007's portability
  assumption held in a real session; (2) advisor used its read grant, caught the exact
  trap (bare `batchIndex.delete` vs `withIngestLock`), raised `advise` severity `concern`,
  then correctly stayed silent on the next delta (dedupe); (3) `__advisor.concurrency-
  watcher.jsonl` persisted every advisor turn (thinking, toolCalls with `{note, severity}`,
  usage) — 13 records; (4) advisory ALSO injected into the primary session JSONL as
  `<advisory advisor="Concurrency Watcher" severity="concern" guidance="weigh, don't
  blindly obey">`; (5) print-mode drain per advisor-watchdog.md: up to 10 min for final
  reviews (30s error budget) — our reviews completed well inside it; (6) `--auto-approve`
  required for unattended edits. Probe session retained at
  `~/.omp/agent/sessions/-tmp-tmp.CLnrjvHMMH/2026-09-08T19-20-29-*`.
- f-011 (2026-09-08, all pass) — visual pass: boxed frames + render gallery:
  - **Framework decision (no ADR needed)**: pi-tui stays — ratatui is Rust and would mean a
    sidecar binary (rejected by ADR-0001); oma renders in-process via `ctx.ui.custom`, and
    pi-tui already ships `Box`/`Text`/symbol themes. The OMP-native look (rounded borders,
    title/footer rows inside the frame) is the house pattern (welcome screen, skill cards,
    bash-interactive box).
  - **`src/frame.ts`**: `FrameTheme` (structural slice of OMP's Theme: `boxRound` glyphs +
    `fg(borderMuted|borderAccent|dim)`), `PLAIN_FRAME_THEME` fallback (same glyphs, no ANSI —
    keeps hosts deterministic), and `frame(theme, {title, body, footer[]}) → Box`. Screens
    take `theme` as an optional last ctor param; production factories pass the real uiTheme
    from `ctx.ui.custom` (index.ts). Nav stays SelectList (constraint 4) — the frame is
    chrome only.
  - **HubScreen**: framed — title `oma · <project>`, body = stage rows, footer = flow line +
    `enter open · esc close`. **ReportScreen**: list framed with title `oma precision report`
    + totals footer; detail rebuilt as a frame per openDetail (title `name · status · verdict`,
    body = ScrollView wrapped at innerWidth = width−4 to match the frame interior, footer
    `enter back · esc close`). Markdown component considered and deferred: it needs an
    initialized `MarkdownTheme` (global theme absent in test hosts) — revisit if/when detail
    panes need real typography.
  - **Gallery** (`scripts/gallery.ts`, `npm run gallery`): renders hub / report list / report
    detail at widths 60 and 80 with fixed fixture data — no PTY, plain theme, diffable. This
    is the design-iteration surface: change layout in src, run gallery, then pin via the PTY
    snapshot tests.
  - Tests updated to the framed layout (headers split into title + footer assertions; detail
    detection keyed on the footer `enter back · esc close`, unique to the detail frame).
  - Live smoke (hub-hosted omp 18.1.14, seeded repo): `/oma` → framed hub overlay composited
    over the welcome screen with real theme colors, all four rows showing true state; Esc
    closed cleanly.
  - Gates: `npm run typecheck` clean; `npm test` **28 pass**; `npm run test:tui` **13 pass**;
    `./init.sh` `All checks passed.`; `npm run probe` exit 0 `ready`.

Carried (still true): f-009's staleness signal is `verifyEvidenceAnchors` reuse at
interview/doctor time.
