# omp-make-advisor

**Status:** draft, pre-implementation — reframed 2026-09-06 from standalone binary to OMP extension
**One-liner:** Interview a project, emit the watchdogs that guard it — as an OMP extension with a TUI stepper.
**Learning goal:** Use this build to learn pretty TUI design on OMP's real stack (`pi-tui` + `ctx.ui.custom()`), applying the vault's TUI design language.

## Why an extension, not a binary

Earlier draft specified a standalone Rust CLI. Wrong shape: ~80% of this tool is AI judgment (read code, infer traps, discuss tradeoffs) and the runtime it targets (advisor, WATCHDOG discovery, `/advisor status` cost) already lives in-session. A binary would shell out to the agent for the real work. Instead:

- **Extension** (`ExtensionAPI`): slash command, session/tools access, `ctx.ui` for the interview TUI.
- **Skill** (SKILL.md): the phased procedure the agent follows — scan → brief → interview → emit → validate — so any session can run it consistently.
- **No new process model.** The deterministic slivers (YAML schema check, fixture scoring) are extension code, not a separate binary.

Divergence from lunchbox, stated plainly: lunchbox is Rust + Ratatui standalone (filesystem isolation tool). This is TypeScript + `pi-tui` in-process (authoring tool). The **design language transfers** (grid, glyphs, semantic color, stepper nav, safe exploration); the **widget stack does not**. Both are deliberate.

## 1. Problem

Same as before: OMP owns the advisor mechanism, nobody owns authoring. Blank `WATCHDOG.md`, no generator, no measurement. Advisors run with weak guidance at max reasoning — the most expensive way to get the least.

## 2. Goals

- `/make-advisor` slash command (alias `oma`) starts the flow in any project session.
- Scout scan proposes candidate traps with evidence paths (reuses the 13-repo AGENTS.md pattern: parallel read-only scouts, strict contract).
- **TUI stepper interview**: one trap per screen, keep/edit/drop, evidence inline, progress bar — the Magnitude onboarding pattern, built on `SelectList` + overlay.
- Emit: global + project `WATCHDOG.md`, starter `WATCHDOG.yml` roster with model/tool suggestions. Reuse OMP's own serializer semantics (literal block scalars, canonical `.yml`, round-trip safe).
- Validate: held-out trap fixtures + clean fixtures, headless advisor runs, scored report.
- Learn `pi-tui` properly: Component contract, theme tokens, keybindings, overlay vs editor-area, headless snapshot testing.
- Guard everything with `hasUI`: every interactive flow degrades to a file-based checklist headless (the file-as-interface fallback — free, since interview state already lives in a brief file).

## 3. Non-goals (v1)

- Replacing `/advisor configure` (we generate drafts; the built-in editor remains the editor).
- Auto-routing, watchdog marketplace, 40 harnesses.
- Mutating standing agent files (emit-beside + user moves).
- Pi support (subset differs: no roster, different staleness policy — later, documented).

## 4. Vocabulary

| Term | Meaning |
|---|---|
| Trap | One concrete project-specific risk with an evidence path |
| Candidate | Machine-proposed trap awaiting keep/edit/drop |
| Brief | The interview state file (`advisor-brief.md`): candidates + per-trap status — doubles as headless fallback |
| Watchdog pair | Emitted `WATCHDOG.md` + `WATCHDOG.yml` |
| Fixture | Planted violation (or clean negative) used to score the advisor |
| Precision run | Advisor over fixtures: flagged / missed per trap |

## 5. Architecture

```
  /make-advisor
        │
        ▼
  ┌───────────┐   task scouts    ┌──────────────┐
  │ scan      │ ───────────────► │ advisor-brief │
  │ (skill)   │   read-only      │ .md on disk   │
  └───────────┘                  └──────┬───────┘
                                        │  TUI stepper (hasUI) or
                                        │  direct file edit (headless)
                                        ▼
                                 ┌──────────────┐
                                 │ interview    │  SelectList per trap:
                                 │ ctx.ui.custom│  keep / edit / drop
                                 │ overlay      │  evidence inline, % bar
                                 └──────┬───────┘
                                        ▼
                                 ┌──────────────┐
                                 │ emit         │  WATCHDOG.md + WATCHDOG.yml
                                 └──────┬───────┘  (preview first, Enter applies)
                                        ▼
                                 ┌──────────────┐
                                 │ validate     │  fixtures → headless
                                 │ + report     │  advisor runs → score + cost
                                 └──────────────┘
```

### TUI contract (from OMP docs/tui.md — verified 2026-09-06)

- Mount via `ctx.ui.custom<T>(factory, { overlay: true })`; factory receives `(tui, theme, keybindings, done)`. `done(result)` exactly once; `dispose()` idempotent.
- Implement `Component`: `render(width)` returns immutable `readonly string[]` (same reference when unchanged — enables memoization); `handleInput(data)` matched with `matchesKey` / `keybindings.matches(data, "app.interrupt")`.
- Width safety: `visibleWidth()` to measure, `truncateToWidth()` / `wrapTextWithAnsi()` to fit, `replaceTabs()` on external content.
- Reuse `SelectList` + `getSelectListTheme()` for the keep/edit/drop picker — do not hand-roll list nav for v1.
- Cursor via `CURSOR_MARKER`, not position queries. Overlay anchors bottom-center, full width.
- Headless/RPC: `ctx.ui.custom` is no-op / unsupported — **always branch on `ctx.hasUI`** and fall back to the brief file.

### Key files to study (OMP repo)

- `packages/tui/src/tui.ts` — Component, Focusable, overlay, input dispatch
- `packages/tui/src/utils.ts` — width/truncation/sanitization primitives
- `packages/coding-agent/src/modes/controllers/extension-ui-controller.ts` — mounting/unmounting
- `packages/coding-agent/src/advisor/config.ts` — roster schema, discovery, serializer semantics to mirror
- `packages/coding-agent/src/advisor/watchdog.ts` — discovery walk to mirror
- `docs/tui.md`, `docs/extensions.md`, `docs/advisor-watchdog.md`
- `.omp/tools/tui.ts` — headless PTY harness (kitty-vt emulation) for snapshot tests

## 6. Learning curriculum (the point of option 4)

Build slices in this order; each teaches one TUI concept from the vault design language:

1. **Skeleton command** — `registerCommand("make-advisor")` + `ctx.ui.notify`. Extension lifecycle, `hasUI` guard. (Design language: nothing yet — plumbing.)
2. **Static trap picker** — hardcoded candidates in a `SelectList` overlay, keep/drop, `done()` result. (Concepts: stepper nav, focus, `done` exactly-once, width safety.)
3. **Evidence + progress** — per-trap evidence lines, `3/12` progress bar, theme accent for focus ring. (Concepts: inline viz where the decision is, semantic color tokens.)
4. **Edit flow** — free-text edit path per trap (input component), preview screen before emit. (Concepts: safe exploration — preview inline, Enter applies, Esc reverts.)
5. **Live scan feed** — scouts fan out, overlay shows streaming progress (spinner → determinate bars). (Concepts: calm motion as liveness, <200ms feedback.)
6. **Report screen** — precision table + cost + keep/retune/drop verdict. (Concepts: information density with escape hatch.)

Each slice gets a headless snapshot test before the next begins — the test harness is part of the learning, not an afterthought.

## 7. Validation method

CRAB philosophy at project-trap scale (unchanged): held-out fixtures + equal-weight clean fixtures; `/advisor dump` as audit trail on disagreements. Headless validation probes `omp -p --advisor` drain/dump semantics first (open question carried over).

## 8. Tests

- Unit: scan parsing, brief round-trip, YAML emit golden (matches OMP serializer semantics), fixture scoring.
- Headless TUI snapshots: drive each overlay through the `.omp/tools/tui.ts`-style PTY harness (or Ratatui-style `TestBackend` equivalent if `pi-tui` exposes one — check `gallery-fixtures`); assert frames, no eyeballing in CI.
- Live E2E (opt-in, needs auth): full flow against a fixture repo, like `pi-omplike-advisor`'s `ADVISOR_E2E` pattern.
- Extension tests must pass without OMP session running where possible; live tests gated behind env.

## 9. Relationship to lunchbox

| | Lunchbox | omp-make-advisor |
|---|---|---|
| Controls | Which skills the agent sees | What the reviewer watches for |
| Shape | Rust standalone binary | OMP extension + skill |
| TUI stack | Ratatui (standalone) | pi-tui via ctx.ui.custom (in-process) |
| Shares | Design language, `--json` discipline, `doctor` first contact, snapshot-test habit | Same |

A project can run both: lunchbox narrows the menu, omp-make-advisor sharpens the reviewer.

## 10. MVP vs later

### MVP (build first; stop and demo)

1. Command skeleton + static picker (curriculum slices 1–2) on a fixture repo
2. Scout scan feeding real candidates (slice 5 minimal: notify-level progress)
3. Emit single-advisor `WATCHDOG.md` with preview screen
4. 3–5 hand-built fixtures, manual precision run

### Next (still v1-ish)

- Edit flow + full interview stepper (slices 3–4)
- `WATCHDOG.yml` roster emission (2–3 roles)
- Automated validator + report screen (slice 6)
- `doctor` staleness nudge

### Later

- Pi subset, CI hook, trap library per stack, cost auto-parse + budget gate

## 11. Open questions (do not block MVP)

- Headless validation: does `omp -p --advisor` expose enough for unattended scoring? Probe first.
- Does `pi-tui` expose a `TestBackend`/gallery-fixture path for unit-level frame asserts, or is the PTY harness the only route?
- Pricing source for cost preview (models.db? hardcoded?).
- Scoring judge: string-match on severity vs judge model (which needs its own eval)?
- Upstream posture: contribute extension to OMP ecosystem, or keep local? (`/advisor configure` remains canonical either way.)

## 12. Defaults, summarized

| Decision | Default | Why |
|---|---|---|
| Shape | OMP extension + skill | Judgment lives in-session; binary would wrap prompts |
| Command | `/make-advisor` (`oma`) | Discoverable, short alias |
| Interview UI | Overlay stepper via ctx.ui.custom | /advisor configure pattern; editor area stays intact |
| List widget | SelectList, no hand-rolled nav | Boring, themed, tested |
| Headless | Brief-file fallback via hasUI branch | Zero extra code — state already file-backed |
| Standing files | never mutate, emit-beside | Trust; user moves |
| Scope | OMP only in v1 | Pi subset differs; later + documented |

Decision records: [ADR-0001](../decisions/0001-extension-plus-skill-over-standalone-binary.md) captures the shape decision. Future decision changes get a new ADR in `docs/decisions/` rather than silent edits here.

## Sources

- OMP TUI integration for extensions (Component contract, custom(), SelectList example): https://github.com/can1357/oh-my-pi/blob/main/docs/tui.md
- OMP extensions guide (lifecycle, API surfaces, isolation): https://github.com/can1357/oh-my-pi/blob/main/docs/extensions.md
- OMP advisor runtime: https://github.com/can1357/oh-my-pi/blob/main/docs/advisor-watchdog.md
- Advisor config implementation (schema, discovery, serializer): `packages/coding-agent/src/advisor/config.ts`
- Pi extension UI (`ctx.ui`, `ctx.ui.custom()`): https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md
- Pi port staleness handling: https://pi.dev/packages/pi-omplike-advisor
- CRAB benchmark: https://arxiv.org/abs/2603.23448
