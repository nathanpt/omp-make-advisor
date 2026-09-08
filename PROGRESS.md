# PROGRESS

Updated: 2026-09-08 (f-004 + f-005 session)

## Current repository state

- Git repository initialized (`main`); eleven commits: foundation docs → package scaffold → f-001
  skeleton → f-002 picker → PTY harness → loader-test runner fix → state record → post-slices
  cleanup → f-003 brief module → f-003 picker preload → f-003 scan wiring.
- Slices 1–3 complete and passing: `/oma scan` sends the 4-lens scan prompt to the session agent
  (scouts write `advisor-brief.md` at the project root); bare `/oma` opens the picker preloaded
  with brief statuses and writes accepted decisions back (evidence + rationale preserved);
  `src/traps.ts` deleted — `CandidateTrap` lives in `src/brief.ts`.
- Toolchain: npm + node ≥22 + `tsc --noEmit`; **bun runs both test suites** (`npm test`,
  `npm run test:tui`); no build step (`omp -e index.ts` loads TS directly); tsx removed (dead
  after the runner switch). devDeps `@oh-my-pi/pi-coding-agent`/`-pi-tui` 18.1.12 vs omp 18.1.11
  runtime — no drift observed.

## Confirmed working surfaces

- `/oma scan` in a UI session (PTY-hosted omp 18.1.11, temp fixture repo): start notify renders;
  4 `⟦task⟧` scouts fan out; scout-batch notifies render (staggered scouts persist in frames;
  near-simultaneous ones share a redraw window); at `agent_end` the completion notify
  "oma: scan complete — N candidates in advisor-brief.md" rendered in full post-simplify-pass
  (an earlier run saw it collide with the model's reply toast — timing, not logic).
- Bare `/oma` after a scan: picker opens on the scanned candidates with statuses preloaded
  (re-open showed `❯ [drop] …` for a previously dropped trap); `space`+`Enter` →
  `oma: brief updated — kept 10, dropped 1` toast and the brief on disk shows the flipped
  `· drop ·` with evidence/rationale intact; `Esc` → `oma: cancelled - brief unchanged` toast,
  file byte-identical (md5 unchanged).
- Headless scan (E2E, `OMA_E2E=1`): `omp -e index.ts -p "<scan prompt>"` in a planted fixture
  repo exits 0 and writes a parseable brief with existing evidence paths.
- Headless load: `omp -e ./index.ts -p …` exits 0, replies `ready`, no UI attempt.
- PTY harness (`test/tui/`): 60-col host renders frames; accept, cancel, and preload flows pass.
- Live self-scan (installed plugin, this repo, 2026-09-06): `/oma scan` wrote an 11-candidate
  `advisor-brief.md`; `parseBrief` → 11 candidates, 0 skipped; all 11 evidence anchors resolve
  with line ranges within file bounds (`verifyEvidenceAnchors` on the live brief returns `[]`).

## Active work

None in flight. f-004 (WATCHDOG.md emit with preview) and f-005 (precision
fixtures + recorded run) are complete and passing. Next feature per selection
rule: `f-006` (full interview stepper; deps f-003 ✓) or `f-007` (WATCHDOG.yml
roster emission — carries the literal-block-scalar serializer semantics noted
below).

## Blockers and unknowns

Open questions carried from DESIGN.md §11 (none block the MVP):

1. Does `omp -p --advisor` expose drain/dump semantics sufficient for unattended scoring? Probe
   before building the automated validator (feature `f-008`).
2. ~~pi-tui TestBackend vs PTY harness~~ Resolved: PTY harness (`test/tui/host.ts`), bun-spawned,
   JSONL frame events — landed and passing.
3. Pricing source for cost preview (models.db vs hardcoded).
4. Scoring judge: string-match on severity vs a judge model.
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

## Next useful move

Start `f-006` (full interview stepper: per-trap evidence inline, progress bar,
keep/edit/drop with free-text edit; deps f-003 ✓) — `WatchdogPreview` +
f-004 step 4). The precision run also sharpened f-008: clean-repo specificity
and keyword-vs-judge scoring are the two measured gaps. Carried from the
self-scan (still true): f-009's staleness signal is precisely
`verifyEvidenceAnchors` reuse at picker/doctor time — evidence line-ranges
that no longer resolve.
