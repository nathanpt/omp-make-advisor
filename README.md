# omp-make-advisor

Interview a project, emit the watchdogs that guard it — as an OMP extension.

OMP owns the advisor/watchdog mechanism; nobody owns authoring. This project adds the authoring
flow: it studies a codebase, settles which watch-rules are worth guarding, and writes the
advisor's watchdog pair beside any standing files without mutating them. A consideration — the
thing being authored — is a watch-rule for the advisor: a concrete statement of what a future
change must not do in a fragile area, not a bug report.

The judgment is AI work done in-session; the deterministic slivers (brief schema, emit
serialization, fixture scoring) are extension code. Every interactive flow degrades to the same
file-based checklist when headless.

## Use

Install once (links this working tree — edits are live; restart omp to reload):

```
omp install /mnt/dev/projects/omp-make-advisor
```

One-off alternative: `omp -e /mnt/dev/projects/omp-make-advisor/index.ts` from a target project.
Then open an OMP session in that project and run `/oma` — the hub names each stage and its next
action. After emit, enable enforcement with OMP's own `/advisor on`.

## Where things live

| Question | Answer |
|---|---|
| Full design: architecture, TUI contract, curriculum, decisions | [docs/design-docs/DESIGN.md](docs/design-docs/DESIGN.md) — authoritative |
| Current state, blockers, next move | [PROGRESS.md](PROGRESS.md) |
| Working rules for agents | [AGENTS.md](AGENTS.md) |
| System map (as-built, updated per slice) | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Decision records (ADRs) | [docs/decisions/README.md](docs/decisions/README.md) |
| Source reading list | [docs/references/index.md](docs/references/index.md) |
| Notable changes | [CHANGELOG.md](CHANGELOG.md) |

## Run / verify

```
./init.sh              # full gate: doc checks + typecheck + unit + PTY suites
npm test               # unit suite (bun)
npm run test:tui       # PTY snapshot suite (bun)
npm run gallery        # render the styled screens at 60/80 cols (no omp needed)
npm run probe          # headless omp load check
```

Live checks that need a session: `bash test/fixtures/precision/validate.sh` (recorded gate for the
validator; requires omp auth + a `@slow` model chain).
