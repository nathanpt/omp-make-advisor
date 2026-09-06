import { test } from "bun:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

interface SpawnedHost {
	eventsPath: string;
	write(data: string): void;
	waitUntil(predicate: (events: unknown[]) => boolean, timeoutMs?: number): Promise<unknown[]>;
	exited: Promise<number>;
	kill(): void;
}

function spawnHost(): SpawnedHost {
	const dir = mkdtempSync(join(tmpdir(), "oma-tui-"));
	const eventsPath = join(dir, "events.jsonl");
	const proc = Bun.spawn({
		cmd: [process.execPath, "run", join(import.meta.dir, "host.ts"), eventsPath],
		pty: true,
		stdin: "pipe",
		stdout: "ignore",
		stderr: "inherit",
		env: { ...process.env, COLUMNS: "60", LINES: "20" },
	});
	const readEvents = (): unknown[] => {
		try {
			return readFileSync(eventsPath, "utf8")
				.split("\n")
				.filter((line) => line.length > 0)
				.map((line) => JSON.parse(line));
		} catch {
			return [];
		}
	};
	const waitUntil = async (predicate: (events: unknown[]) => boolean, timeoutMs = 5000): Promise<unknown[]> => {
		const deadline = Date.now() + timeoutMs;
		for (;;) {
			const events = readEvents();
			if (predicate(events)) return events;
			if (Date.now() > deadline) throw new Error(`timeout waiting for events; got: ${JSON.stringify(events)}`);
			// Real delay by necessity: the awaited condition is JSONL output written
			// by an external PTY child process, which fake timers cannot advance.
			const { promise: tick, resolve: ticked } = Promise.withResolvers<void>();
			setTimeout(ticked, 100);
			await tick;
		}
	};
	return {
		eventsPath,
		write: proc.stdin.write.bind(proc.stdin),
		waitUntil,
		exited: proc.exited,
		kill: proc.kill.bind(proc),
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
			"Concurrent map writes",
			"Silent catch swallows",
			"Fixture drift between",
		]) {
			assert.ok(
				firstFrame.lines.some((line) => line.includes(title)),
				`first frame missing title: ${title}\n${firstFrame.lines.join("\n")}`,
			);
		}
		assert.equal(
			firstFrame.lines.filter((line) => line.includes("[keep]")).length,
			3,
			`expected 3 [keep] markers\n${firstFrame.lines.join("\n")}`,
		);

		host.write("\x1b[B");
		host.write(" ");
		host.write("\r");

		const finalEvents = (await host.waitUntil((es) =>
			es.some((e) => (e as Event).type === "done"),
		)) as Event[];
		const done = finalEvents.find((e) => e.type === "done") as { result: { kept: string[]; dropped: string[] } | null };
		assert.deepEqual(done.result, { kept: ["t1", "t3"], dropped: ["t2"] });

		const frames = finalEvents.filter((e) => e.type === "frame") as { lines: string[] }[];
		assert.ok(
			frames.some((f) => f.lines.some((line) => line.includes("[drop] Silent catch"))),
			"no frame shows [drop] Silent catch",
		);
		assert.equal(finalEvents.filter((e) => e.type === "done").length, 1, "done must fire exactly once");
		assert.equal(finalEvents.filter((e) => e.type === "disposed").length, 1, "disposed must fire exactly once");

		assert.equal(await host.exited, 0);
	} finally {
		host.kill();
	}
});

test("cancel flow", async () => {
	const host = spawnHost();
	try {
		await host.waitUntil((es) => es.some((e) => (e as Event).type === "frame"));
		host.write("\x1b");
		const finalEvents = (await host.waitUntil((es) =>
			es.some((e) => (e as Event).type === "done"),
		)) as Event[];
		const done = finalEvents.find((e) => e.type === "done") as { result: unknown };
		assert.equal(done.result, null);
		assert.equal(await host.exited, 0);
	} finally {
		host.kill();
	}
});
