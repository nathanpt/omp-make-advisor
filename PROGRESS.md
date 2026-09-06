# PROGRESS

Updated: 2026-09-06 (foundation session)

## Current repository state

- Design complete enough to build from: `docs/design-docs/DESIGN.md` (reframed 2026-09-06 from a
  standalone Rust binary to an OMP extension + skill).
- No code, no package scaffold, no tests.
- Not a git repository yet — no history, nothing committed.

## Confirmed working surfaces

None — nothing runnable exists yet.

## Active work

None in flight. Foundation documents created this session: `README.md`, `AGENTS.md`,
`PROGRESS.md` (this file), `ARCHITECTURE.md`, `CHANGELOG.md`, `init.sh`,
`docs/feature-list.json`, `docs/decisions/` (README + ADR-0001),
`docs/exec-plans/{active,completed}/`, `docs/references/index.md`.

## Blockers and unknowns

Open questions carried from DESIGN.md §11 (none block the MVP):

1. Does `omp -p --advisor` expose drain/dump semantics sufficient for unattended scoring? Probe
   before building the automated validator (feature `f-008`).
2. Does `pi-tui` expose a TestBackend / gallery-fixture path for unit-level frame asserts, or is a
   PTY harness (`.omp/tools/tui.ts` style) the only route? Probe before slice 2's snapshot test.
3. Pricing source for cost preview (models.db vs hardcoded).
4. Scoring judge: string-match on severity vs a judge model.
5. Upstream posture: contribute the extension to the OMP ecosystem or keep it local.

Foundation unknowns:

- Extension build/package/test toolchain (package manager, test runner, repo layout) — decided by
  slice 1; must be recorded in AGENTS.md "Commands" then.
- Location of the vault's TUI design language (referenced by DESIGN.md) — not in this repo.

## Verification status

- Documentation only so far; no code verification applicable.
- `./init.sh` (run 2026-09-06, after all foundation files landed): `OK: 9 features, deps
  resolve, links resolve, AGENTS.md 74 lines` — pass. Covers feature-contract JSON validity,
  dependency references, markdown link resolution, and the AGENTS.md line budget.
- Earlier same-session spot checks (python3 JSON/link/line-count assertions) — pass, consistent
  with the init.sh result.

## Next useful move

`git init` + initial commit of the foundation (owner go-ahead required — not done automatically),
then start feature `f-001`: scaffold the extension and land slice 1 (command skeleton + `hasUI`
guard).
