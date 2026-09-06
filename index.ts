import type { ExtensionAPI, ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import { TrapPicker, type PickerResult } from "./src/picker.js";
import { readBrief, writeBrief } from "./src/brief.js";
import { buildScanPrompt } from "./src/scan.js";

export default function omaExtension(pi: ExtensionAPI): void {
	pi.setLabel("omp-make-advisor");

	// Per-binding, deliberately NOT module-level: omp re-runs the extension
	// factory inside task subagents against the same module instance, so shared
	// state would let a scout's agent_end close the root's scan phase. The scan
	// turn runs outside the command handler (pi.sendUserMessage starts an agent
	// turn), so progress is event-driven: tool_execution_end counts scout
	// batches returning, agent_end closes the phase and reads back the brief.
	const scanState = { active: false, batches: 0 };

	const runScan = (ctx: ExtensionCommandContext): void => {
		scanState.active = true;
		scanState.batches = 0;
		if (ctx.hasUI) ctx.ui.notify("oma: scan started — 4 read-only scouts fanning out", "info");
		// Idle: starts the scan turn. Streaming: queues as steer — acceptable here.
		// Works headless too: no UI calls above when ctx.hasUI is false.
		pi.sendUserMessage(buildScanPrompt());
	};

	const runPicker = async (ctx: ExtensionCommandContext): Promise<void> => {
		// Headless: advisor-brief.md itself is the fallback checklist (statuses are
		// edited inline in the file); the picker is the interactive surface only.
		if (!ctx.hasUI) return;
		const read = readBrief(ctx.cwd);
		if (!read.ok) {
			// ENOENT: the scan hasn't run here. Anything else (EACCES, EISDIR, …):
			// the file exists but cannot be read — re-scanning will not fix it.
			const message =
				read.error.code === "ENOENT"
					? `oma: no advisor-brief.md in ${ctx.cwd} — run /oma scan first`
					: `oma: advisor-brief.md unreadable (${read.error.code ?? "unknown error"}) — check permissions`;
			ctx.ui.notify(message, "warning");
			return;
		}
		const candidates = read.result.candidates;
		if (candidates.length === 0) {
			ctx.ui.notify("oma: advisor-brief.md has no candidates", "warning");
			return;
		}
		const initialStates = new Map(candidates.map((c) => [c.id, c.status]));
		const result = await ctx.ui.custom<PickerResult | undefined>(
			(_tui, _theme, keybindings, done) => new TrapPicker(candidates, keybindings, done, initialStates),
			{ overlay: true },
		);
		if (!result) {
			ctx.ui.notify("oma: cancelled - brief unchanged", "info");
			return;
		}
		const kept = new Set(result.kept);
		// Write back onto the parsed candidates so evidence and rationale survive.
		const updated = candidates.map((c) => ({ ...c, status: kept.has(c.id) ? ("keep" as const) : ("drop" as const) }));
		writeBrief(ctx.cwd, updated);
		ctx.ui.notify(`oma: brief updated — kept ${result.kept.length}, dropped ${result.dropped.length}`, "info");
	};

	const commandOptions = {
		description: "Interview the project and emit its watchdogs (oma)",
		getArgumentCompletions: (prefix: string) =>
			prefix === "" || "scan".startsWith(prefix)
				? [{ value: "scan", label: "scan", description: "Fan out read-only scouts; write advisor-brief.md" }]
				: null,
		handler: async (args: string, ctx: ExtensionCommandContext): Promise<void> => {
			if (args.trim() === "scan") return runScan(ctx);
			return runPicker(ctx);
		},
	};
	pi.registerCommand("make-advisor", commandOptions);
	pi.registerCommand("oma", commandOptions);

	pi.on("tool_execution_end", (event, ctx) => {
		if (!scanState.active || !ctx.hasUI) return;
		if (/^task$/i.test(event.toolName)) {
			scanState.batches += 1;
			ctx.ui.notify(`oma: scout batch ${scanState.batches} returned`, "info");
		}
	});
	pi.on("agent_end", (event, ctx) => {
		// Auto-retry/continuation settles are not terminal (AgentEndEvent contract);
		// the brief write lands only at the final settle.
		if (event.willContinue) return;
		if (!scanState.active) return;
		scanState.active = false;
		if (!ctx.hasUI) return;
		const read = readBrief(ctx.cwd);
		if (!read.ok) {
			ctx.ui.notify("oma: scan finished but advisor-brief.md was not written", "warning");
			return;
		}
		const { candidates, skipped } = read.result;
		ctx.ui.notify(
			`oma: scan complete — ${candidates.length} candidates in advisor-brief.md${skipped ? ` (${skipped} skipped as malformed)` : ""}`,
			"info",
		);
	});
}
