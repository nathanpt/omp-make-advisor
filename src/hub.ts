import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { Box, SelectList } from "@oh-my-pi/pi-tui";
import { PLAIN_FRAME_THEME, frame, type FrameTheme } from "./frame.js";
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

// Row descriptions stay short: the SelectList description column gets ~24
// cells at the narrowest supported width (60 cols).
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

export type HubAction = "scan" | "interview" | "emit" | "validate";

// The hub menu: one row per pipeline stage, description = live state. Guards
// stay in the stage handlers — a blocked row stays selectable and explains
// itself; Enter simply dispatches.
export class HubScreen implements Component {
	private readonly list: SelectList;
	private readonly frame: Box;
	private doneCalled = false;

	constructor(
		private readonly status: HubStatus,
		private readonly keybindings: KeybindingsLike,
		private readonly done: (result: HubAction | undefined) => void,
		private readonly theme: FrameTheme = PLAIN_FRAME_THEME,
	) {
		const items = [
			{ value: "scan", label: "scan", description: scanDescription(status) },
			{ value: "interview", label: "interview", description: interviewDescription(status) },
			{ value: "emit", label: "emit", description: emitDescription(status) },
			{ value: "validate", label: "validate · dev", description: validateDescription(status) },
		];
		this.list = new SelectList(items, items.length, getSelectListTheme(), { overflowSearch: false });
		this.list.onSelect = (item) => this.finish(item.value as HubAction);
		this.list.onCancel = () => this.finish(undefined);
		this.frame = frame(this.theme, {
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
		return this.frame.render(Math.max(1, width));
	}

	invalidate(): void {
		this.list.invalidate?.();
		this.frame.invalidate();
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

export function renderHubSummary(status: HubStatus): string[] {
	const rows = [
		["scan", scanDescription(status)],
		["interview", interviewDescription(status)],
		["emit", emitDescription(status)],
		["validate · dev", validateDescription(status)],
	] as const;
	return [
		`oma · ${status.project}`,
		...rows.map(([label, description]) => `${label.padEnd(15)}${description}`),
		`next: ${nextAction(status)}`,
	];
}
