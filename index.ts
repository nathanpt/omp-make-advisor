import { basename } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import { serializeAdvisorConfig } from "./src/advisor-yaml.js";
import { InterviewStepper, type InterviewDecision } from "./src/interview.js";
import { readBrief, verifyEvidenceAnchors, writeBrief, readEvidenceContext } from "./src/brief.js";
import { buildScanPrompt } from "./src/scan.js";
import {
	besideTarget,
	buildRosterDoc,
	buildWatchdogMd,
	emitBeside,
	WATCHDOG_FILENAME,
	WATCHDOG_SIDECAR_FILENAME,
	WATCHDOG_YML_FILENAME,
	WATCHDOG_YML_SIDECAR_FILENAME,
} from "./src/emit.js";
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
		const rosterDoc = buildRosterDoc(candidates);
		const roster = serializeAdvisorConfig(rosterDoc);
		if (ctx.hasUI) {
			// Headers name the files emitBeside will actually write; emitBeside's
			// own existsSync stays authoritative at write time. Esc on either
			// preview cancels everything — nothing is written.
			const preview = (text: string, targetName: string) =>
				ctx.ui.custom<boolean | undefined>(
					(_tui, _theme, keybindings, done) => new WatchdogPreview(text, targetName, keybindings, done),
					{ overlay: true },
				);
			if (!(await preview(content, besideTarget(ctx.cwd, WATCHDOG_FILENAME, WATCHDOG_SIDECAR_FILENAME)))) {
				ctx.ui.notify("oma: cancelled - nothing written", "info");
				return;
			}
			if (!(await preview(roster, besideTarget(ctx.cwd, WATCHDOG_YML_FILENAME, WATCHDOG_YML_SIDECAR_FILENAME)))) {
				ctx.ui.notify("oma: cancelled - nothing written", "info");
				return;
			}
		}
		const mdResult = emitBeside(ctx.cwd, WATCHDOG_FILENAME, WATCHDOG_SIDECAR_FILENAME, content);
		const ymlResult = emitBeside(ctx.cwd, WATCHDOG_YML_FILENAME, WATCHDOG_YML_SIDECAR_FILENAME, roster);
		// Headless writes silently (D3): the files on disk are the report.
		if (!ctx.hasUI) return;
		// Names come from the write results, so the notify reports what was
		// actually written — not the pre-write header prediction.
		const mdName = basename(mdResult.path);
		const ymlName = basename(ymlResult.path);
		ctx.ui.notify(
			mdResult.besideStanding && ymlResult.besideStanding
				? `oma: wrote ${mdName} + ${ymlName} beside standing files — review, then move into place — enable with /advisor on`
				: `oma: wrote ${mdName}${mdResult.besideStanding ? " (beside standing)" : ""} + ${ymlName}${ymlResult.besideStanding ? " (beside standing)" : ""} — ${kept.length} traps, ${rosterDoc.advisors.length} advisors — enable with /advisor on`,
			"info",
		);
	};

	const commandOptions = {
		description: "Interview the project and emit its watchdogs (oma)",
		getArgumentCompletions: (prefix: string) => {
			const subcommands = [
				{ value: "scan", label: "scan", description: "Fan out read-only scouts; write advisor-brief.md" },
				{ value: "emit", label: "emit", description: "Preview and write WATCHDOG.md + WATCHDOG.yml from kept brief candidates" },
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
