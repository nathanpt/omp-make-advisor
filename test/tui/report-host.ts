import { ReportScreen } from "../../src/report.js";
import { runOverlayHost } from "./hostlib.js";
import type { ValidateReport } from "../../src/validate.js";

const eventsPath = process.argv[2];
if (!eventsPath) throw new Error("usage: bun run test/tui/report-host.ts <events.jsonl>");

// Fixed three-fixture report covering the three row archetypes: a flagged
// keep, a noisy clean (retune), and a no-run drop.
const report: ValidateReport = {
	generatedAt: "2026-09-08T20:00:00.000Z",
	fixtures: [
		{
			name: "conc-map",
			kind: "violation",
			keywords: ["lock", "map"],
			advisors: ["concurrency-watcher"],
			advises: [
				{
					slug: "concurrency-watcher",
					note: "batchIndex.delete runs outside withIngestLock",
					severity: "concern",
				},
			],
			hits: ["lock"],
			costUsd: 0.0123,
			models: ["glm-4.7"],
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
			models: ["glm-4.7"],
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
	totalCostUsd: 0.0163,
	totals: { keep: 1, retune: 1, drop: 1 },
};

runOverlayHost<boolean>((keybindings, done) => new ReportScreen(report, keybindings, done), eventsPath);
