import { test } from "bun:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

interface SpawnedHost {
	write(data: string): void;
	waitUntil(predicate: (events: unknown[]) => boolean, timeoutMs?: number): Promise<unknown[]>;
	/** Snapshot of the events file as it stands right now. */
	readAll(): unknown[];
	exited: Promise<number>;
	/** Kill the host (no-op after exit) and remove its temp events file. */
	cleanup(): void;
}

function spawnHost(config?: string): SpawnedHost {
	const dir = mkdtempSync(join(tmpdir(), "oma-tui-"));
	const eventsPath = join(dir, "events.jsonl");
	const proc = Bun.spawn({
		cmd: [
			process.execPath,
			"run",
			join(import.meta.dir, "interview-host.ts"),
			eventsPath,
			...(config ? [config] : []),
		],
		pty: true,
		stdin: "pipe",
		stdout: "ignore",
		stderr: "inherit",
		env: { ...process.env, COLUMNS: "60", LINES: "20" },
	});
	const readEvents = (): unknown[] => {
		let raw: string;
		try {
			raw = readFileSync(eventsPath, "utf8");
		} catch {
			return [];
		}
		const events: unknown[] = [];
		for (const line of raw.split("\n")) {
			if (!line) continue;
			try {
				events.push(JSON.parse(line));
			} catch {
				// Torn tail from an in-flight append; the next poll re-reads it whole.
			}
		}
		return events;
	};
	const waitUntil = async (predicate: (events: unknown[]) => boolean, timeoutMs = 5000): Promise<unknown[]> => {
		const deadline = Date.now() + timeoutMs;
		for (;;) {
			const events = readEvents();
			if (predicate(events)) return events;
			if (proc.exitCode !== null) {
				throw new Error(`host exited (code ${proc.exitCode}) before satisfying predicate; events: ${JSON.stringify(events)}`);
			}
			if (Date.now() > deadline) throw new Error(`timeout waiting for events; got: ${JSON.stringify(events)}`);
			// Real delay by necessity: the awaited condition is JSONL output written
			// by an external PTY child process, which fake timers cannot advance.
			const { promise: tick, resolve: ticked } = Promise.withResolvers<void>();
			setTimeout(ticked, 100);
			await tick;
		}
	};
	return {
		write: proc.stdin.write.bind(proc.stdin),
		waitUntil,
		readAll: readEvents,
		exited: proc.exited,
		cleanup: () => {
			proc.kill();
			rmSync(dir, { recursive: true, force: true });
		},
	};
}

interface Event {
	type: string;
	[key: string]: unknown;
}

interface FrameEvent extends Event {
	lines: string[];
}

interface Decision {
	id: string;
	title: string;
	status: "keep" | "drop";
}

// Frames carry theme ANSI (progress-bar accent, list cursor); strip SGR so
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

// The cursor glyph follows the host's symbol preset (ASCII ">"); the cursor
// row is the choice row without the two-space indent.
const cursorOn = (frame: FrameEvent, word: "keep" | "drop"): boolean =>
	frame.lines.some((line) => /^\S/.test(plain(line)) && new RegExp(`\\b${word}\\b`).test(plain(line)));

test("walkthrough: one trap per screen, evidence inline, progress advances", async () => {
	const host = spawnHost();
	try {
		const events = await host.waitUntil((es) => es.some((e) => (e as Event).type === "frame"));
		const size = events.find((e) => e.type === "size");
		assert.equal(size?.cols, 60, `expected 60 columns, got ${JSON.stringify(size)}`);

		const first = frameWith(events, "Trap 1/3");
		for (const expected of [
			"Trap 1/3 ▮▯▯ · enter select · esc cancel",
			"Any write to the shared ingest map must hold the ingest lock",
			"why: unlocked writers have corrupted the map twice",
			"Evidence: src/ingest/loop.ts:41-58",
			"41 │ const m = new Map()",
			"42 │ if (!held) m.set(k, v)",
			"… +14 more lines",
		]) {
			assert.ok(
				first.lines.some((line) => plain(line).trimEnd() === expected),
				`first screen missing line "${expected}"\n${first.lines.map(plain).join("\n")}`,
			);
		}
		assert.ok(cursorOn(first, "keep"), `cursor must rest on keep\n${first.lines.map(plain).join("\n")}`);

		// Pace each keystroke on observable frame progression: batching all
		// inputs at once lets the host coalesce renders past dispose.
		host.write("\r");
		let current = await host.waitUntil((es) =>
			framesOf(es).some((f) => f.lines.some((line) => plain(line).includes("Trap 2/3"))),
		);
		frameWith(current, "2/3 ▮▮▯");
		frameWith(current, "Never swallow or soften auth errors");

		host.write("\r");
		current = await host.waitUntil((es) =>
			framesOf(es).some((f) => f.lines.some((line) => plain(line).includes("Trap 3/3"))),
		);
		const dirScreen = frameWith(current, "Evidence: db/migrations/");
		assert.ok(
			!dirScreen.lines.some((line) => plain(line).includes(" │ ")),
			`directory evidence must not render source lines\n${dirScreen.lines.map(plain).join("\n")}`,
		);
		// t3's brief status is drop: the cursor preselects the drop row.
		assert.ok(cursorOn(dirScreen, "drop"), `drop status must preselect the drop row\n${dirScreen.lines.map(plain).join("\n")}`);

		host.write("\r");
		await host.waitUntil((es) => es.some((e) => (e as Event).type === "done"));
		assert.equal(await host.exited, 0);
		const finalEvents = host.readAll() as Event[];
		const done = finalEvents.find((e) => e.type === "done") as { result: Decision[] | null };
		assert.deepEqual(done.result, [
			{ id: "t1", title: "Any write to the shared ingest map must hold the ingest lock", status: "keep" },
			{ id: "t2", title: "Never swallow or soften auth errors in session refresh paths", status: "keep" },
			{ id: "t3", title: "Any migration must update db/schema.sql in the same change", status: "drop" },
		]);
		assert.equal(finalEvents.filter((e) => e.type === "done").length, 1, "done must fire exactly once");
		const disposedAt = finalEvents.findIndex((e) => e.type === "disposed");
		assert.ok(disposedAt >= 0, "disposed event missing");
		assert.equal(finalEvents.filter((e) => e.type === "disposed").length, 1, "disposed must fire exactly once");
		assert.ok(
			!finalEvents.slice(disposedAt + 1).some((e) => e.type === "frame"),
			"no frame may be emitted after disposed",
		);
	} finally {
		host.cleanup();
	}
});

test("drop choice records a dropped decision", async () => {
	const host = spawnHost();
	try {
		let events = await host.waitUntil((es) => es.some((e) => (e as Event).type === "frame"));
		host.write("\x1b[B"); // move to drop
		await host.waitUntil((es) => framesOf(es).some((f) => cursorOn(f, "drop")));
		host.write("\r");
		events = await host.waitUntil((es) =>
			framesOf(es).some((f) => f.lines.some((line) => plain(line).includes("Trap 2/3"))),
		);
		// The recorded decision is visible only in the final result; finish the walk.
		host.write("\r");
		await host.waitUntil((es) =>
			framesOf(es).some((f) => f.lines.some((line) => plain(line).includes("Trap 3/3"))),
		);
		host.write("\r");
		await host.waitUntil((es) => es.some((e) => (e as Event).type === "done"));
		assert.equal(await host.exited, 0);
		const done = host.readAll().find((e) => e.type === "done") as { result: Decision[] | null };
		assert.equal(done.result?.[0].status, "drop");
		assert.equal(done.result?.filter((d) => d.status === "keep").length, 1);
	} finally {
		host.cleanup();
	}
});

test("cancel flow", async () => {
	const host = spawnHost();
	try {
		await host.waitUntil((es) => es.some((e) => (e as Event).type === "frame"));
		host.write("\x1b");
		await host.waitUntil((es) => es.some((e) => (e as Event).type === "done"));
		assert.equal(await host.exited, 0);
		const finalEvents = host.readAll() as Event[];
		const done = finalEvents.find((e) => e.type === "done") as { result: unknown };
		assert.equal(done.result, null);
		assert.equal(finalEvents.filter((e) => e.type === "done").length, 1, "done must fire exactly once");
		assert.equal(finalEvents.filter((e) => e.type === "disposed").length, 1, "disposed must fire exactly once");
	} finally {
		host.cleanup();
	}
});

test("preload: drop status preselects the drop row", async () => {
	const host = spawnHost(JSON.stringify({ dropIds: ["t1"] }));
	try {
		const events = await host.waitUntil((es) => es.some((e) => (e as Event).type === "frame"));
		const first = frameWith(events, "Trap 1/3");
		assert.ok(cursorOn(first, "drop"), `preloaded drop must rest the cursor on drop\n${first.lines.map(plain).join("\n")}`);
		// Enter confirms the preselected row; finish the walk trap by trap.
		for (const marker of ["Trap 2/3", "Trap 3/3"]) {
			host.write("\r");
			await host.waitUntil((es) =>
				framesOf(es).some((f) => f.lines.some((line) => plain(line).includes(marker))),
			);
		}
		host.write("\r");
		await host.waitUntil((es) => es.some((e) => (e as Event).type === "done"));
		const done = host.readAll().find((e) => e.type === "done") as { result: Decision[] | null };
		assert.equal(done.result?.[0].status, "drop");
	} finally {
		host.cleanup();
	}
});
