# PROGRESS

Updated: 2026-09-06 (slices 1–2 implementation session)

## Current repository state

- Git repository initialized (`main`); foundation docs committed, then package scaffold.
- Slice 1 landed (f-001): `index.ts` registers `/make-advisor` + `/oma` (same options object —
  `registerCommand` has no alias field), `hasUI`-guarded, notify acknowledgement.
- Slice 2 (f-002) in flight: static trap picker overlay + PTY snapshot harness.
- Toolchain decided (matches `omp-langfuse` prior art): npm + node ≥22 + `tsx --test` +
  `tsc --noEmit`; `bun` only for the PTY test suite; no build step (`omp -e index.ts` loads TS
  directly). devDeps pinned `@oh-my-pi/pi-coding-agent`/`-pi-tui` 18.1.12 vs omp 18.1.11 runtime.

## Confirmed working surfaces

- `/make-advisor` and `/oma` in a UI session: notify line renders (verified under a PTY-hosted
  omp 18.1.11 session).
- Headless load: `omp -e ./index.ts -p …` exits 0, replies `ready`, no UI attempt.

## Active work

f-002 (static trap picker): `src/traps.ts`, `src/picker.ts`, overlay mount in `index.ts`, PTY
snapshot harness `test/tui/`. Next after that: f-003 scout scan.

## Blockers and unknowns

Open questions carried from DESIGN.md §11 (none block the MVP):

1. Does `omp -p --advisor` expose drain/dump semantics sufficient for unattended scoring? Probe
   before building the automated validator (feature `f-008`).
2. ~~pi-tui TestBackend vs PTY harness~~ Resolved by plan: PTY harness (`test/tui/host.ts`),
   bun-spawned, JSONL frame events.
3. Pricing source for cost preview (models.db vs hardcoded).
4. Scoring judge: string-match on severity vs a judge model.
5. Upstream posture: contribute the extension to the OMP ecosystem or keep it local.

Resolved this session:

- Handler contract: `registerCommand(name, { description?, handler })` where handler is
  `(args: string, ctx: ExtensionCommandContext)`. ctx types import from
  `@oh-my-pi/pi-coding-agent` root (`ExtensionAPI`, `ExtensionCommandContext` both exported).
  `ctx.ui.notify(message, type?)`.

## Verification status

- f-001 (2026-09-06, all pass):
  - `npm run typecheck` — clean, 0 errors.
  - `npm test` — `# pass 1 # fail 0` (loader factory test).
  - `npm run probe` — `PROBE_EXIT=0`, replied `ready` (headless load, hasUI guard silent).
  - Interactive under PTY (hub-hosted omp 18.1.11, cwd temp target project): `/make-advisor` and
    `/oma` each rendered the notify toast `omp-make-advisor: skeleton loaded — trap picker lands
    in slice 2 (f-002)` (confirmed in PTY captures).
  - `./init.sh` — docs checks + typecheck + `npm test` all green (`All checks passed.`).
- Plan deviation (recorded): `bun test test/tui/` is NOT yet in init.sh — it exits 1 while
  `test/tui/` does not exist, which would leave the repo red between the Step 3 and Step 5
  commits. It joins init.sh in the Step 5 commit alongside the harness. AGENTS.md notes this.

## Next useful move

Land f-002: `src/traps.ts` + `src/picker.ts` + overlay mount, then the PTY snapshot harness
(`test/tui/host.ts` + `test/tui/picker.test.ts`) gating the slice; then f-003 (scout scan feeding
real candidates).
