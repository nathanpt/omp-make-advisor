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

function spawnHost(): SpawnedHost {
	const dir = mkdtempSync(join(tmpdir(), "oma-tui-"));
	const eventsPath = join(dir, "events.jsonl");
	const proc = Bun.spawn({
		cmd: [process.execPath, "run", join(import.meta.dir, "preview-host.ts"), eventsPath],
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

test("apply flow", async () => {
	const host = spawnHost();
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
	const host = spawnHost();
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
	const host = spawnHost();
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
