import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { Box, SelectList, wrapTextWithAnsi } from "@oh-my-pi/pi-tui";
import { PLAIN_FRAME_THEME, frame, splitPane, type FrameTheme } from "./frame.js";
import type { Component } from "@oh-my-pi/pi-tui";
import type { KeybindingsLike } from "./keybindings.js";
import type { ValidateReport } from "./validate.js";
import { getSelectListTheme } from "@oh-my-pi/pi-coding-agent";
import { readBrief } from "./brief.js";
import {
	WATCHDOG_FILENAME,
	WATCHDOG_SIDECAR_FILENAME,
	WATCHDOG_YML_FILENAME,
	WATCHDOG_YML_SIDECAR_FILENAME,
} from "./emit.js";

// ADR-0002: bare `/oma` opens a status hub. The status model is pure
// filesystem truth (brief, watchdog pair, dev report) so f-009's doctor can
// reuse it outside the overlay; the screen is a thin SelectList over it.

export interface HubStatus {
	project: string; // cwd basename — which repo the flow targets
	brief: { present: boolean; candidates: number; kept: number };
	watchdog: { md: WatchdogPresence; yml: WatchdogPresence };
	report: { state: "none" | "ready" | "malformed"; generatedAt: string; totalCostUsd: number };
}

type WatchdogPresence = "none" | "canonical" | "sidecar";

function watchdogPresence(cwd: string, canonicalName: string, sidecarName: string): WatchdogPresence {
	if (existsSync(join(cwd, canonicalName))) return "canonical";
	if (existsSync(join(cwd, sidecarName))) return "sidecar";
	return "none";
}

export function readHubStatus(cwd: string): HubStatus {
	const read = readBrief(cwd);
	const brief = read.ok
		? {
				present: true,
				candidates: read.result.candidates.length,
				kept: read.result.candidates.filter((c) => c.status === "keep").length,
			}
		: { present: false, candidates: 0, kept: 0 };
	const reportPath = join(cwd, "test/fixtures/precision/results/report.json");
	let report: HubStatus["report"] = { state: "none", generatedAt: "", totalCostUsd: 0 };
	if (existsSync(reportPath)) {
		try {
			const parsed = JSON.parse(readFileSync(reportPath, "utf8")) as ValidateReport;
			report = { state: "ready", generatedAt: parsed.generatedAt ?? "", totalCostUsd: parsed.totalCostUsd ?? 0 };
		} catch {
			report = { state: "malformed", generatedAt: "", totalCostUsd: 0 };
		}
	}
	return {
		project: basename(cwd),
		brief,
		watchdog: {
			md: watchdogPresence(cwd, WATCHDOG_FILENAME, WATCHDOG_SIDECAR_FILENAME),
			yml: watchdogPresence(cwd, WATCHDOG_YML_FILENAME, WATCHDOG_YML_SIDECAR_FILENAME),
		},
		report,
	};
}

// Headless summary rows stay descriptive (D3: stdout is the interface). The
// PTY rows are tighter — status glyph in the icon column, compact label.
function scanDescription(status: HubStatus): string {
	return status.brief.present ? `✓ advisor-brief · ${status.brief.candidates} traps` : "— run /oma scan first";
}

function interviewDescription(status: HubStatus): string {
	if (!status.brief.present) return "— blocked: scan first";
	return status.brief.kept > 0 ? `✓ ${status.brief.kept} of ${status.brief.candidates} kept` : "— nothing kept";
}

function emitDescription(status: HubStatus): string {
	const { md, yml } = status.watchdog;
	if (md === "canonical" && yml === "canonical") return "✓ pair in place";
	if (md === "sidecar" || yml === "sidecar") return "⚠ sidecars to move";
	return status.brief.kept > 0 ? `— ${status.brief.kept} kept ready` : "— nothing to emit";
}

function validateDescription(status: HubStatus): string {
	switch (status.report.state) {
		case "ready":
			return `✓ report ${status.report.generatedAt.slice(5, 10)} $${status.report.totalCostUsd.toFixed(2)}`;
		case "malformed":
			return "— malformed (dev)";
		default:
			return "— no report (dev)";
	}
}

// Split-pane rows: status glyph in the icon column (SelectList renders icons
// at any width — the description column does not survive a 25-cell pane),
// compact label carries the rest. Rich state lives in the right pane.
function stageItems(status: HubStatus): { value: HubAction; icon: string; label: string }[] {
	const emitState = (): { icon: string; text: string } => {
		const { md, yml } = status.watchdog;
		if (md === "canonical" && yml === "canonical") return { icon: "✓", text: "in place" };
		if (md === "sidecar" || yml === "sidecar") return { icon: "⚠", text: "sidecars" };
		return status.brief.kept > 0 ? { icon: "—", text: `${status.brief.kept} ready` } : { icon: "—", text: "nothing kept" };
	};
	const validateState = (): { icon: string; text: string } => {
		switch (status.report.state) {
			case "ready":
				return { icon: "✓", text: `$${status.report.totalCostUsd.toFixed(2)}` };
			case "malformed":
				return { icon: "—", text: "malformed" };
			default:
				return { icon: "—", text: "no report" };
		}
	};
	const emit = emitState();
	const validate = validateState();
	return [
		{
			value: "scan",
			icon: status.brief.present ? "✓" : "—",
			label: `scan · ${status.brief.candidates} traps`,
		},
		{
			value: "interview",
			icon: status.brief.kept > 0 ? "✓" : "—",
			label: status.brief.present ? `interview · ${status.brief.kept}/${status.brief.candidates}` : "interview · blocked",
		},
		{ value: "emit", icon: emit.icon, label: `emit · ${emit.text}` },
		{ value: "validate", icon: validate.icon, label: `validate · ${validate.text}` },
	];
}

// Rich right-pane copy for the split layout: what the stage does + its live
// artifact line. (Row labels above stay telegraphic.)
const STAGE_ABOUT: Record<HubAction, string> = {
	scan: "4 read-only scouts fan out over the repo and write advisor-brief.md with candidate traps per lens.",
	interview: "Walk every candidate trap: keep, reword, or drop. Decisions write back to the brief.",
	emit: "Preview and write WATCHDOG.md + WATCHDOG.yml from the kept traps. Standing files stay untouched — sidecars land beside them for review.",
	validate: "Render the scored precision report from the last validate.sh run (this repo's own fixtures).",
};

function stageMeta(action: HubAction, status: HubStatus): string {
	switch (action) {
		case "scan":
			return status.brief.present ? `advisor-brief.md · ${status.brief.candidates} traps` : "writes advisor-brief.md";
		case "interview":
			return `edits advisor-brief.md · ${status.brief.kept} kept`;
		case "emit":
			return "writes 2 files";
		case "validate": {
			const dev = "dev · reads results/report.json";
			return status.report.state === "ready" ? `${dev} · $${status.report.totalCostUsd.toFixed(4)}` : dev;
		}
	}
}

export type HubAction = "scan" | "interview" | "emit" | "validate";

// The hub menu: one row per pipeline stage, description = live state. Guards
// stay in the stage handlers — a blocked row stays selectable and explains
// itself; Enter simply dispatches.
export class HubScreen implements Component {
	private readonly list: SelectList;
	private readonly listFrame: Box;
	private active: HubAction = "scan";
	private doneCalled = false;

	constructor(
		private readonly status: HubStatus,
		private readonly keybindings: KeybindingsLike,
		private readonly done: (result: HubAction | undefined) => void,
		private readonly theme: FrameTheme = PLAIN_FRAME_THEME,
		private readonly scanModelLine?: string,
	) {
		const items = stageItems(status);
		this.list = new SelectList(items, items.length, getSelectListTheme(), { overflowSearch: false });
		this.list.onSelect = (item) => this.finish(item.value as HubAction);
		this.list.onCancel = () => this.finish(undefined);
		this.list.onSelectionChange = (item) => {
			this.active = item.value as HubAction;
		};
		// Narrow fallback (< 48 cols): single-pane framed list.
		this.listFrame = frame(this.theme, {
			title: `oma · ${status.project}`,
			body: this.list,
			footer: ["flow: scan → interview → emit → /advisor on", "enter open · esc close"],
		});
	}

	private finish(result: HubAction | undefined): void {
		if (this.doneCalled) return;
		this.doneCalled = true;
		this.done(result);
	}

	handleInput(data: string): void {
		if (this.keybindings.matches(data, "app.interrupt")) {
			this.finish(undefined);
			return;
		}
		this.list.handleInput(data === "\r" ? "\n" : data);
	}

	render(width: number): readonly string[] {
		const safeWidth = Math.max(1, width);
		// Split pane needs room for both columns; below that, fall back to the
		// framed single-pane list.
		if (safeWidth < 48) return this.listFrame.render(safeWidth);
		const leftW = Math.min(28, Math.max(16, Math.floor(safeWidth * 0.42)));
		const rightW = safeWidth - leftW - 3;
		const leftLines = this.list.render(leftW);
		const rightLines: string[] = [this.theme.fg("borderAccent", this.active), ""];
		for (const line of wrapTextWithAnsi(STAGE_ABOUT[this.active], rightW)) rightLines.push(line);
		rightLines.push("");
		for (const line of wrapTextWithAnsi(this.theme.fg("dim", stageMeta(this.active, this.status)), rightW)) {
			rightLines.push(line);
		}
		// Cost visibility (user requirement): the scan pane names the models
		// that will bill before anyone fans out.
		if (this.active === "scan" && this.scanModelLine) {
			for (const line of wrapTextWithAnsi(this.theme.fg("dim", this.scanModelLine), rightW)) {
				rightLines.push(line);
			}
		}
		const footerRight =
			this.status.report.state === "ready"
				? `advisors $${this.status.report.totalCostUsd.toFixed(4)}`
				: `${this.status.brief.kept} of ${this.status.brief.candidates} kept`;
		return splitPane(this.theme, safeWidth, leftLines, rightLines, {
			title: `oma · ${this.status.project}`,
			footerLeft: "enter open · esc close",
			footerRight,
		});
	}

	invalidate(): void {
		this.list.invalidate?.();
		this.listFrame.invalidate();
	}

	dispose(): void {}
}

// Headless /oma (D3): stdout is the file-equivalent interface. Same ladder the
// hub rows imply, resolved to one next action.
export function nextAction(status: HubStatus): string {
	if (!status.brief.present) return "/oma scan";
	if (status.brief.kept === 0) return "/oma interview";
	const { md, yml } = status.watchdog;
	if (md === "none" && yml === "none") return "/oma emit";
	if (md === "sidecar" || yml === "sidecar") return "move WATCHDOG.oma.* into place, then /advisor on";
	return "/advisor on (if not already)";
}

export function renderHubSummary(status: HubStatus, scanModelLine?: string): string[] {
	const rows = [
		["scan", scanDescription(status)],
		["interview", interviewDescription(status)],
		["emit", emitDescription(status)],
		["validate · dev", validateDescription(status)],
	] as const;
	const lines = [
		`oma · ${status.project}`,
		...rows.map(([label, description]) => `${label.padEnd(15)}${description}`),
	];
	if (scanModelLine) lines.push(`  ${scanModelLine}`);
	lines.push(`next: ${nextAction(status)}`);
	return lines;
}
