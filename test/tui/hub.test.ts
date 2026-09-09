import { test } from "bun:test";
import assert from "node:assert/strict";
import { spawnHost, type Event } from "./spawn.js";

interface FrameEvent extends Event {
	lines: string[];
}

// Frames carry theme ANSI (list cursor); strip SGR so assertions read the
// text the user sees.
const plain = (line: string): string => line.replace(/\x1b\[[0-9;]*m/g, "");

const framesOf = (events: readonly unknown[]): FrameEvent[] =>
	events.filter((e) => (e as Event).type === "frame") as FrameEvent[];

function frameWith(events: readonly unknown[], substring: string): FrameEvent {
	const frame = framesOf(events).find((f) => f.lines.some((line) => plain(line).includes(substring)));
	assert.ok(
		frame,
		`no frame contains "${substring}"\n${framesOf(events).map((f) => f.lines.map(plain).join("\n")).join("\n---\n")}`,
	);
	return frame;
}

test("hub: header, four status rows, footer; enter dispatches scan; esc cancels once", async () => {
	const host = spawnHost("hub-host.ts");
	try {
		const events = await host.waitUntil((es) => es.some((e) => (e as Event).type === "frame"));
		frameWith(events, "oma · demo");
		frameWith(events, "enter open · esc close");
		frameWith(events, "scan · 6 traps");
		frameWith(events, "interview · 4/6");
		frameWith(events, "emit · sidecars");
		frameWith(events, "4 read-only scouts fan out");
		frameWith(events, "advisor-brief.md · 6 traps");
		frameWith(events, "models: glm-5.3 · 1 main + 4");
		frameWith(events, "Last run cost: $0.0630");
		frameWith(events, "4 of 6 kept");

		// Enter on the preselected first row dispatches scan.
		host.write("\r");
		await host.waitUntil((es) => es.some((e) => (e as Event).type === "done"));
		assert.equal(await host.exited, 0);
		const finalEvents = host.readAll() as Event[];
		const done = finalEvents.find((e) => e.type === "done") as { result: unknown };
		assert.equal(done.result, "scan");
		assert.equal(finalEvents.filter((e) => e.type === "done").length, 1, "done must fire exactly once");
		assert.equal(finalEvents.filter((e) => e.type === "disposed").length, 1, "dispose must fire exactly once");
	} finally {
		host.cleanup();
	}
});

test("hub: esc on the list cancels with undefined, exactly once", async () => {
	const host = spawnHost("hub-host.ts");
	try {
		await host.waitUntil((es) => es.some((e) => (e as Event).type === "frame"));
		host.write("\x1b");
		await host.waitUntil((es) => es.some((e) => (e as Event).type === "done"));
		const finalEvents = host.readAll() as Event[];
		const done = finalEvents.find((e) => e.type === "done") as { result: unknown };
		assert.equal(done.result, null);
		assert.equal(finalEvents.filter((e) => e.type === "done").length, 1, "done must fire exactly once");
		assert.equal(finalEvents.filter((e) => e.type === "disposed").length, 1, "dispose must fire exactly once");
	} finally {
		host.cleanup();
	}
});
