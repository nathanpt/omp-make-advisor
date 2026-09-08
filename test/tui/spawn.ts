import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface Event {
	type: string;
	[key: string]: unknown;
}

export interface SpawnedHost {
	write(data: string): void;
	waitUntil(predicate: (events: unknown[]) => boolean, timeoutMs?: number): Promise<unknown[]>;
	/** Snapshot of the events file as it stands right now. */
	readAll(): unknown[];
	exited: Promise<number>;
	/** Kill the host (no-op after exit) and remove its temp events file. */
	cleanup(): void;
}

// Spawns a PTY host script (a sibling *.ts in this directory) under the
// snapshot-test budget: 60 cols, 20 rows, events to a temp JSONL file.
// `argv` forwards optional host arguments after the events path.
export function spawnHost(script: string, argv: readonly string[] = []): SpawnedHost {
	const dir = mkdtempSync(join(tmpdir(), "oma-tui-"));
	const eventsPath = join(dir, "events.jsonl");
	const proc = Bun.spawn({
		cmd: [process.execPath, "run", join(import.meta.dir, script), eventsPath, ...argv],
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
