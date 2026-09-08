import { test } from "bun:test";
import assert from "node:assert/strict";
import { spawnHost, type Event } from "./spawn.js";


test("apply flow", async () => {
	const host = spawnHost("preview-host.ts");
	try {
		const events = (await host.waitUntil((es) =>
			es.some((e) => (e as Event).type === "frame"),
		)) as Event[];
		const size = events.find((e) => e.type === "size");
		assert.equal(size?.cols, 60, `expected 60 columns, got ${JSON.stringify(size)}`);
		const firstFrame = events.find((e) => e.type === "frame") as { lines: string[] };
		assert.ok(
			firstFrame.lines[0]?.includes("WATCHDOG.md preview · enter write · esc cancel"),
			`header line must survive at 60 cols\n${firstFrame.lines.join("\n")}`,
		);
		for (const marker of ["# Watchdog notes", "Especially watch for:"]) {
			assert.ok(
				firstFrame.lines.some((line) => line.includes(marker)),
				`first frame missing body marker: ${marker}\n${firstFrame.lines.join("\n")}`,
			);
		}

		host.write("\r");
		await host.waitUntil((es) => es.some((e) => (e as Event).type === "done"));
		assert.equal(await host.exited, 0);
		const finalEvents = host.readAll() as Event[];
		const done = finalEvents.find((e) => e.type === "done") as { result: boolean | null };
		assert.equal(done.result, true);
		assert.equal(finalEvents.filter((e) => e.type === "done").length, 1, "done must fire exactly once");
		assert.equal(finalEvents.filter((e) => e.type === "disposed").length, 1, "disposed must fire exactly once");
		const disposedAt = finalEvents.findIndex((e) => e.type === "disposed");
		assert.ok(
			!finalEvents.slice(disposedAt + 1).some((e) => e.type === "frame"),
			"no frame may be emitted after disposed",
		);
	} finally {
		host.cleanup();
	}
});

test("cancel flow", async () => {
	const host = spawnHost("preview-host.ts");
	try {
		await host.waitUntil((es) => es.some((e) => (e as Event).type === "frame"));
		host.write("\x1b");
		await host.waitUntil((es) => es.some((e) => (e as Event).type === "done"));
		assert.equal(await host.exited, 0);
		const finalEvents = host.readAll() as Event[];
		const done = finalEvents.find((e) => e.type === "done") as { result: boolean | null };
		assert.equal(done.result, null);
		assert.equal(finalEvents.filter((e) => e.type === "done").length, 1, "done must fire exactly once");
		assert.equal(finalEvents.filter((e) => e.type === "disposed").length, 1, "disposed must fire exactly once");
	} finally {
		host.cleanup();
	}
});

test("scroll flow", async () => {
	const host = spawnHost("preview-host.ts");
	try {
		const events = (await host.waitUntil((es) =>
			es.some((e) => (e as Event).type === "frame"),
		)) as Event[];
		const firstFrame = events.find((e) => e.type === "frame") as { lines: string[] };
		// The last bullet starts below the 12-row viewport at 60 cols (long
		// bullets wrap), so it can only appear after a scroll.
		const scrollMarker = "Pin the ingest worker";
		assert.ok(
			!firstFrame.lines.some((line) => line.includes(scrollMarker)),
			`marker must start hidden below the viewport\n${firstFrame.lines.join("\n")}`,
		);
		// PageDown (11 rows at a 12-row viewport) reaches the marker in one
		// key; a single down arrow only scrolls one wrapped row.
		host.write("\x1b[6~");
		await host.waitUntil((es) => {
			const frames = es.filter((e) => (e as Event).type === "frame") as { lines: string[] }[];
			return frames.some((f) => f.lines.some((line) => line.includes(scrollMarker)));
		});

		// Scroll-then-confirm composes: preview still applies afterwards.
		host.write("\r");
		await host.waitUntil((es) => es.some((e) => (e as Event).type === "done"));
		assert.equal(await host.exited, 0);
		const finalEvents = host.readAll() as Event[];
		assert.equal((finalEvents.find((e) => e.type === "done") as { result: boolean | null }).result, true);
	} finally {
		host.cleanup();
	}
});
