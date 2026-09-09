// Render gallery (f-011): static frames of every styled oma screen at fixed
// widths, no PTY needed — screens are Components, we call render() directly.
// Iterate on layout here (`npm run gallery`), then pin changes in the PTY
// snapshot tests. PLAIN_FRAME_THEME keeps output diffable; production adds
// the user's theme colors on top of the same layout.
import { HubScreen, type HubStatus } from "../src/hub.js";
import { ReportScreen } from "../src/report.js";
import type { ValidateReport } from "../src/validate.js";
import type { Component } from "@oh-my-pi/pi-tui";

const HUB_STATUS: HubStatus = {
	project: "demo",
	brief: { present: true, candidates: 6, kept: 4 },
	watchdog: { md: "sidecar", yml: "canonical" },
	report: { state: "ready", generatedAt: "2026-09-08T20:15:23.865Z", totalCostUsd: 0.063 },
};

const REPORT: ValidateReport = {
	generatedAt: "2026-09-08T20:15:23.865Z",
	fixtures: [
		{
			name: "conc-map",
			kind: "violation",
			keywords: ["lock", "map"],
			advisors: ["concurrency-watcher"],
			advises: [
				{
					slug: "concurrency-watcher",
					note: "batchIndex.delete runs outside withIngestLock — wrap dropBatch in withIngestLock so the retry path can't race the main loop",
					severity: "concern",
				},
			],
			hits: ["lock"],
			costUsd: 0.0145,
			models: ["glm-5.3"],
			status: "scored",
			verdict: "keep",
		},
		{
			name: "clean-tidy",
			kind: "clean",
			keywords: [],
			advisors: ["trap-watcher"],
			advises: [{ slug: "trap-watcher", note: "comment drifts from store mutex discipline", severity: "nit" }],
			hits: [],
			costUsd: 0.004,
			models: ["glm-5.3"],
			status: "scored",
			verdict: "retune",
		},
		{
			name: "data-drift",
			kind: "violation",
			keywords: ["schema", "migration"],
			advisors: [],
			advises: [],
			hits: [],
			costUsd: 0,
			models: [],
			status: "no-run",
			verdict: "drop",
		},
	],
	totalCostUsd: 0.0185,
	totals: { keep: 1, retune: 1, drop: 1 },
};

const keybindings = { matches: () => false };

const reportDetail = (): ReportScreen => {
	const screen = new ReportScreen(REPORT, keybindings, () => {});
	screen.handleInput("\n"); // open the detail pane on the preselected row
	return screen;
};

const SCREENS: [name: string, make: () => Component][] = [
	["hub — status dashboard (bare /oma)", () => new HubScreen(HUB_STATUS, keybindings, () => {}, undefined, "models: glm-5.3 · 1 main + 4 scout turns")],
	["report — scored list (/oma validate)", () => new ReportScreen(REPORT, keybindings, () => {})],
	["report — fixture detail (enter)", reportDetail],
];

for (const width of [60, 80]) {
	console.log(`\n════════ oma gallery · width ${width} ════════`);
	for (const [name, make] of SCREENS) {
		console.log(`\n── ${name} ──`);
		for (const line of make().render(width)) console.log(line);
	}
}
