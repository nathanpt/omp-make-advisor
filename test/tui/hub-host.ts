import { HubScreen } from "../../src/hub.js";
import { runOverlayHost } from "./hostlib.js";
import type { HubStatus } from "../../src/hub.js";

const eventsPath = process.argv[2];
if (!eventsPath) throw new Error("usage: bun run test/tui/hub-host.ts <events.jsonl>");

// Mid-flow state: brief with 4 of 6 kept, md sidecar beside a standing file,
// canonical yml, fresh dev report — exercises the status-bearing rows.
const status: HubStatus = {
	project: "demo",
	brief: { present: true, candidates: 6, kept: 4 },
	watchdog: { md: "sidecar", yml: "canonical" },
	report: { state: "ready", generatedAt: "2026-09-08T20:15:23.865Z", totalCostUsd: 0.063 },
};

runOverlayHost((keybindings, done) => new HubScreen(status, keybindings, done), eventsPath);
