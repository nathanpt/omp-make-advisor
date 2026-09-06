# References

Reading list for building omp-make-advisor, mapped to the features that need each source.
DESIGN.md's Sources section is the origin of this list; add entries when a new external source
informs a decision.

## OMP documentation

| Source | Answers | Read when |
|---|---|---|
| [docs/tui.md](https://github.com/can1357/oh-my-pi/blob/main/docs/tui.md) | Component contract, `ctx.ui.custom()`, SelectList example, width safety | before any TUI slice (f-001+) |
| [docs/extensions.md](https://github.com/can1357/oh-my-pi/blob/main/docs/extensions.md) | extension lifecycle, API surfaces, isolation | slice 1 (f-001) |
| [docs/advisor-watchdog.md](https://github.com/can1357/oh-my-pi/blob/main/docs/advisor-watchdog.md) | advisor runtime, watchdog discovery, `/advisor` surfaces | before emit/validate (f-004+) |

## OMP source (read in a checkout of can1357/oh-my-pi)

| Path | Answers | Read when |
|---|---|---|
| `packages/coding-agent/src/advisor/config.ts` | roster schema, discovery, serializer semantics to mirror | f-004, f-007 |
| `packages/coding-agent/src/advisor/watchdog.ts` | discovery walk to mirror | f-007 |
| `packages/tui/src/tui.ts` | Component, Focusable, overlay, input dispatch | TUI slices |
| `packages/tui/src/utils.ts` | width/truncation/sanitization primitives | TUI slices |
| `packages/coding-agent/src/modes/controllers/extension-ui-controller.ts` | mounting/unmounting custom UI | f-001, f-002 |
| `.omp/tools/tui.ts` | headless PTY harness (kitty-vt emulation) for snapshot tests | f-002+ |

## External

| Source | Answers | Read when |
|---|---|---|
| [Pi extensions docs](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md) | upstream `ctx.ui` surface OMP inherits | background |
| [pi-omplike-advisor](https://pi.dev/packages/pi-omplike-advisor) | Pi-side staleness policy; `ADVISOR_E2E` gating pattern | Pi subset (later), E2E gating (f-008) |
| [CRAB benchmark](https://arxiv.org/abs/2603.23448) | fixture + precision methodology | f-005, f-008 |

## Local, location unknown

- The vault's TUI design language (grid, glyphs, semantic color, stepper nav, safe exploration) —
  referenced throughout DESIGN.md, not in this repo. Flagged in PROGRESS.md; link it here once
  located.
