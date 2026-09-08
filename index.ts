import type { ExtensionAPI, ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { InterviewStepper, type InterviewDecision } from "./src/interview.js";
import { readBrief, verifyEvidenceAnchors, writeBrief, readEvidenceContext } from "./src/brief.js";
import { buildScanPrompt } from "./src/scan.js";
import { buildWatchdogMd, emitWatchdog, WATCHDOG_FILENAME } from "./src/emit.js";
import { WatchdogPreview } from "./src/preview.js";

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

	const runInterview = async (ctx: ExtensionCommandContext): Promise<void> => {
		// Headless: advisor-brief.md itself is the fallback checklist (statuses are
		// edited inline in the file); the interview is the interactive surface only.
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
		// Evidence lines are read once, before the overlay mounts; the stepper
		// itself stays pure render logic. Null contexts (area-guard dirs,
		// unresolvable anchors) simply render without inline lines.
		const evidence = new Map(candidates.map((c) => [c.id, readEvidenceContext(ctx.cwd, c.evidence)]));
		const result = await ctx.ui.custom<InterviewDecision[] | undefined>(
			(_tui, _theme, keybindings, done) => new InterviewStepper(candidates, evidence, keybindings, done),
			{ overlay: true },
		);
		if (!result) {
			ctx.ui.notify("oma: cancelled - brief unchanged", "info");
			return;
		}
		const byId = new Map(result.map((d) => [d.id, d]));
		// Write back onto the parsed candidates so evidence and rationale survive.
		const updated = candidates.map((c) => {
			const decision = byId.get(c.id);
			return decision ? { ...c, title: decision.title, status: decision.status } : c;
		});
		writeBrief(ctx.cwd, updated);
		const kept = updated.filter((c) => c.status === "keep").length;
		const edited = result.filter((d) => candidates.find((c) => c.id === d.id)?.title !== d.title).length;
		ctx.ui.notify(
			`oma: brief updated — kept ${kept}, dropped ${updated.length - kept}` +
				(edited > 0 ? `, edited ${edited}` : ""),
			"info",
		);
	};

	const runEmit = async (ctx: ExtensionCommandContext): Promise<void> => {
		const read = readBrief(ctx.cwd);
		if (!read.ok) {
			// Headless failure is a no-op (D3 corollary): no notify channel,
			// and the brief's absence is itself inspectable.
			if (!ctx.hasUI) return;
			const message =
				read.error.code === "ENOENT"
					? `oma: no advisor-brief.md in ${ctx.cwd} — run /oma scan first`
					: `oma: advisor-brief.md unreadable (${read.error.code ?? "unknown error"}) — check permissions`;
			ctx.ui.notify(message, "warning");
			return;
		}
		const candidates = read.result.candidates;
		if (candidates.length === 0) {
			if (ctx.hasUI) ctx.ui.notify("oma: advisor-brief.md has no candidates", "warning");
			return;
		}
		const kept = candidates.filter((c) => c.status === "keep");
		if (kept.length === 0) {
			if (ctx.hasUI) ctx.ui.notify("oma: no kept candidates in advisor-brief.md — nothing to emit", "warning");
			return;
		}
		const content = buildWatchdogMd(candidates);
		// The preview header names the file emitWatchdog will actually write;
		// emitWatchdog's own existsSync stays authoritative at write time.
		const targetName = existsSync(join(ctx.cwd, WATCHDOG_FILENAME)) ? "WATCHDOG.oma.md" : "WATCHDOG.md";
		if (ctx.hasUI) {
			const apply = await ctx.ui.custom<boolean | undefined>(
				(_tui, _theme, keybindings, done) => new WatchdogPreview(content, targetName, keybindings, done),
				{ overlay: true },
			);
			if (!apply) {
				ctx.ui.notify("oma: cancelled - nothing written", "info");
				return;
			}
		}
		const result = emitWatchdog(ctx.cwd, content);
		// Headless writes silently (D3): the file on disk is the report.
		if (!ctx.hasUI) return;
		ctx.ui.notify(
			result.besideStanding
				? "oma: wrote WATCHDOG.oma.md beside standing WATCHDOG.md — review, then move into place"
				: `oma: wrote WATCHDOG.md — ${kept.length} traps`,
			"info",
		);
	};


	const commandOptions = {
		description: "Interview the project and emit its watchdogs (oma)",
		getArgumentCompletions: (prefix: string) => {
			const subcommands = [
				{ value: "scan", label: "scan", description: "Fan out read-only scouts; write advisor-brief.md" },
				{ value: "emit", label: "emit", description: "Preview and write WATCHDOG.md from kept brief candidates" },
			];
			const matches = subcommands.filter((s) => prefix === "" || s.value.startsWith(prefix));
			return matches.length > 0 ? matches : null;
		},
		handler: async (args: string, ctx: ExtensionCommandContext): Promise<void> => {
			const sub = args.trim();
			if (sub === "scan") return runScan(ctx);
			if (sub === "emit") return runEmit(ctx);
			return runInterview(ctx);
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
	// Liveness check: parseBrief validates grammar only — a hallucinated anchor
	// would otherwise flow silently into the interview and the WATCHDOG emit.
	const unanchored = verifyEvidenceAnchors(ctx.cwd, candidates);
	if (unanchored.length > 0) {
		const ids = unanchored.map((failure) => failure.id).join(", ");
		ctx.ui.notify(
			`oma: warning — ${unanchored.length} candidate${unanchored.length === 1 ? "" : "s"} cite evidence that does not resolve (${ids}) — drop or rescan`,
			"warning",
		);
	}
	});
}
