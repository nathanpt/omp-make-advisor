# PROGRESS

Updated: 2026-09-06 (slices 1–2 implementation session)

## Current repository state

- Git repository initialized (`main`); seven commits: foundation docs → package scaffold → f-001
  skeleton → f-002 picker → PTY harness → loader-test runner fix → this state record.
- Slice 1 (f-001) and slice 2 (f-002) complete and passing: `/make-advisor` + `/oma` register with
  a `hasUI` guard; the command mounts the static trap picker overlay (`ctx.ui.custom`, overlay
  mode); PTY snapshot tests gate the slice.
- Toolchain: npm + node ≥22 + `tsc --noEmit`; **bun runs both test suites** (`npm test`,
  `npm run test:tui`); no build step (`omp -e index.ts` loads TS directly); tsx removed (dead
  after the runner switch). devDeps `@oh-my-pi/pi-coding-agent`/`-pi-tui` 18.1.12 vs omp 18.1.11
  runtime — no drift observed.

## Confirmed working surfaces

- `/make-advisor` and `/oma` in a UI session (PTY-hosted omp 18.1.11): notify line renders.
- Trap picker overlay in a UI session: opens with three `[keep]` traps + evidence descriptions;
  `↓` moves the cursor, `space` toggles `[keep]`↔`[drop]`, `Enter` → `oma: kept 2, dropped 1 …`
  toast, `Esc` → `oma: cancelled - nothing recorded` toast; overlay closes cleanly afterward.
- Headless load: `omp -e ./index.ts -p …` exits 0, replies `ready`, no UI attempt.
- PTY harness (`test/tui/`): 60-col host renders frames; accept and cancel flows pass.

## Active work

None in flight. Next feature per selection rule: `f-003` (scout scan feeding real candidate
traps with evidence paths into `advisor-brief.md`).

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
  Verification: `npm run test:tui` ×5 runs all exit 0; typecheck/test/probe exit 0; interactive
  PTY session confirmed the new header renders untruncated and accept/cancel flows behave.

## Next useful move

Start `f-003`: read-only scout tasks propose candidate traps with evidence paths, feeding real
candidates into `advisor-brief.md` (which doubles as the headless fallback path).
