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

function spawnHost(preload?: string): SpawnedHost {
	const dir = mkdtempSync(join(tmpdir(), "oma-tui-"));
	const eventsPath = join(dir, "events.jsonl");
	const proc = Bun.spawn({
		cmd: [process.execPath, "run", join(import.meta.dir, "host.ts"), eventsPath, ...(preload ? [preload] : [])],
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

test("accept flow", async () => {
	const host = spawnHost();
	try {
		const events = (await host.waitUntil((es) =>
			es.some((e) => (e as Event).type === "frame"),
		)) as Event[];
		const size = events.find((e) => e.type === "size");
		assert.equal(size?.cols, 60, `expected 60 columns, got ${JSON.stringify(size)}`);
		const firstFrame = events.find((e) => e.type === "frame") as { lines: string[] };
		for (const title of [
			"Any write to the", // label column truncates at 30 cols; substrings must fit
			"Never swallow",
			"Any migration must",
		]) {
			assert.ok(
				firstFrame.lines.some((line) => line.includes(title)),
				`first frame missing title: ${title}\n${firstFrame.lines.join("\n")}`,
			);
		}
		assert.ok(
			firstFrame.lines.some((line) => line.includes("esc cancel")),
			`cancel hint must survive at the 60-col snapshot width\n${firstFrame.lines.join("\n")}`,
		);
		assert.equal(
			firstFrame.lines.filter((line) => line.includes("[keep]")).length,
			3,
			`expected 3 [keep] markers\n${firstFrame.lines.join("\n")}`,
		);

		// Pace each keystroke on observable frame progression: batching all
		// inputs at once lets the host coalesce renders, and the only [drop]
		// frame would land after dispose (where the harness suppresses frames).
		host.write("\x1b[B");
		const frameCount = (es: unknown[]) => es.filter((e) => (e as Event).type === "frame").length;
		await host.waitUntil((es) => frameCount(es) >= 2);
		host.write(" ");
		await host.waitUntil((es) => {
			const frames = es.filter((e) => (e as Event).type === "frame") as { lines: string[] }[];
			return frames.some((f) => f.lines.some((line) => line.includes("[drop] Never swallow")));
		});
		host.write("\r");

		await host.waitUntil((es) => es.some((e) => (e as Event).type === "done"));
		assert.equal(await host.exited, 0);
		// Assert on the final event stream, after the host's exit window closes.
		const finalEvents = host.readAll() as Event[];
		const done = finalEvents.find((e) => e.type === "done") as { result: { kept: string[]; dropped: string[] } | null };
		assert.deepEqual(done.result, { kept: ["t1", "t3"], dropped: ["t2"] });

		const frames = finalEvents.filter((e) => e.type === "frame") as { lines: string[] }[];
		assert.ok(
			frames.some((f) => f.lines.some((line) => line.includes("[drop] Never swallow"))),
			"no frame shows [drop] Never swallow",
		);
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

test("preload statuses from brief", async () => {
	const host = spawnHost(JSON.stringify({ dropIds: ["t2"] }));
	try {
		const events = (await host.waitUntil((es) =>
			es.some((e) => (e as Event).type === "frame"),
		)) as Event[];
		const firstFrame = events.find((e) => e.type === "frame") as { lines: string[] };
		assert.ok(
			firstFrame.lines.some((line) => line.includes("[drop] Never swallow")),
			`first frame must show the preloaded drop\n${firstFrame.lines.join("\n")}`,
		);
		assert.equal(
			firstFrame.lines.filter((line) => line.includes("[keep]")).length,
			2,
			`expected 2 [keep] markers\n${firstFrame.lines.join("\n")}`,
		);

		host.write("\r");
		await host.waitUntil((es) => es.some((e) => (e as Event).type === "done"));
		assert.equal(await host.exited, 0);
		const finalEvents = host.readAll() as Event[];
		const done = finalEvents.find((e) => e.type === "done") as { result: { kept: string[]; dropped: string[] } | null };
		assert.deepEqual(done.result, { kept: ["t1", "t3"], dropped: ["t2"] });
	} finally {
		host.cleanup();
	}
});
