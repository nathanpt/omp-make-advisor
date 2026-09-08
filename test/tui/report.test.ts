import { test } from "bun:test";
import assert from "node:assert/strict";
import { spawnHost, type Event } from "./spawn.js";

interface FrameEvent extends Event {
	lines: string[];
}

// Frames carry theme ANSI (list cursor, scroll info); strip SGR so
// assertions read the text the user sees.
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

/** Index of a frame within the event stream — orders walkthrough steps. */
const frameIndex = (events: readonly unknown[], frame: FrameEvent): number => framesOf(events).indexOf(frame);

test("walkthrough: list renders rows + totals, enter opens detail, esc walks back out and closes", async () => {
	const host = spawnHost("report-host.ts");
	try {
		const events = await host.waitUntil((es) => es.some((e) => (e as Event).type === "frame"));
		// List: header, all three row archetypes, footer totals.
		const list = frameWith(events, "oma precision report");
		frameWith(events, "enter detail · esc close");
		frameWith(events, "conc-map · flagged · keep");
		frameWith(events, "clean-tidy · noise · retune");
		frameWith(events, "data-drift · no transcript · drop");
		frameWith(events, "advisors $0.0163 · keep 1 · retune 1 · drop 1");

		// Enter on the preselected first row → conc-map detail: header, the
		// advise note, keywords vs hits, cost/model.
		host.write("\r");
		const detailEvents = await host.waitUntil((es) =>
			framesOf(es).some((f) => f.lines.some((line) => plain(line).includes("enter back · esc close"))),
		);
		const detail = frameWith(detailEvents, "enter back · esc close");
		frameWith(detailEvents, "● CONCERN · concurrency-watcher");
		frameWith(detailEvents, "batchIndex.delete runs outside withIngestLock");
		frameWith(detailEvents, "keywords   lock, map");
		frameWith(detailEvents, "hits       lock");
		frameWith(detailEvents, "cost       $0.0123");
		frameWith(detailEvents, "glm-4.7");

		// Esc returns to the list (a fresh list frame after the detail).
		host.write("\x1b");
		const backEvents = await host.waitUntil(
			(es) => framesOf(es).filter((f) => f.lines.some((line) => plain(line).includes("oma precision report"))).length > 1,
		);
		const backFrame = framesOf(backEvents).filter((f) =>
			f.lines.some((line) => plain(line).includes("oma precision report")),
		).pop()!;
		assert.ok(frameIndex(backEvents, backFrame) > frameIndex(backEvents, detail), "list must return after the detail");

		// Esc on the list closes: done fires exactly once, dispose exactly once.
		host.write("\x1b");
		await host.waitUntil((es) => es.some((e) => (e as Event).type === "done"));
		assert.equal(await host.exited, 0);
		const finalEvents = host.readAll() as Event[];
		const done = finalEvents.find((e) => e.type === "done") as { result: unknown };
		assert.equal(done.result, false);
		assert.equal(finalEvents.filter((e) => e.type === "done").length, 1, "done must fire exactly once");
		assert.equal(finalEvents.filter((e) => e.type === "disposed").length, 1, "dispose must fire exactly once");
	} finally {
		host.cleanup();
	}
});
