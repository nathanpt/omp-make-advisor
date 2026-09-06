import { test } from "bun:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseBrief } from "../../src/brief.ts";
import { buildScanPrompt } from "../../src/scan.ts";

const EXTENSION = join(import.meta.dir, "..", "..", "index.ts");

// Live model turn: only runs when OMA_E2E=1 (AGENTS.md constraint — live tests
// are env-gated). `npm run test:e2e` sets it.
const e2e = process.env.OMA_E2E === "1" ? test : test.skip;

// Hazard anchors are FUTURE-RISK seeds for watch-rules, not asserted live bugs:
// the test asserts the scan's OUTPUT contract (brief structure + evidence paths
// exist), never specific findings.
function plantFixture(dir: string): void {
	mkdirSync(join(dir, "src"), { recursive: true });
	mkdirSync(join(dir, "db", "migrations"), { recursive: true });

	writeFileSync(
		join(dir, "src", "ingest.ts"),
		`// Ingest hot loop. The shared sessions map is mutated here; every other
// mutation path goes through withIngestLock. touchSession bypasses it.
const sessions = new Map<string, { id: string; lastTouch: number; payload: unknown }>();

export function withIngestLock<T>(fn: () => T): T {
	return fn(); // single-process prototype: lock is a no-op seam for now
}

// Called straight from the socket drain path. Must hold the ingest lock —
// see the lock comment at the top of this file.
export function touchSession(id: string): void {
	const session = sessions.get(id);
	if (session) session.lastTouch = Date.now();
}

export function ingest(id: string, payload: unknown): void {
	withIngestLock(() => {
		sessions.set(id, { id, lastTouch: Date.now(), payload });
	});
}
`,
	);

	writeFileSync(
		join(dir, "src", "refresh.ts"),
		`interface Creds {
	token: string;
	expiresAt: number;
}

declare function callRefreshEndpoint(token: string): Promise<Creds>;

export async function refreshSession(token: string): Promise<Creds | undefined> {
	try {
		return await callRefreshEndpoint(token);
	} catch {} // refresh failures are routine; callers re-auth on next use
	return undefined;
}
`,
	);

	writeFileSync(
		join(dir, "db", "schema.sql"),
		`CREATE TABLE users (
	id INTEGER PRIMARY KEY,
	name TEXT NOT NULL
);
`,
	);

	writeFileSync(
		join(dir, "db", "migrations", "0001.sql"),
		`-- 0001: add flags to users. db/schema.sql was never updated when this
-- landed — the is_admin column below exists only in this migration.
ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;
`,
	);
}

e2e(
	"live /oma scan writes a parseable advisor-brief.md",
	async () => {
		const dir = mkdtempSync(join(tmpdir(), "oma-e2e-"));
		try {
			plantFixture(dir);
			// Slash-command dispatch under `omp -p` does not start the scan turn
			// (observed: exit 0, no agent turn, no brief) — per plan contingency the
			// E2E drives the scan prompt directly; command wiring is proven by the
			// interactive PTY check.
			const proc = Bun.spawn({
				cmd: ["omp", "-e", EXTENSION, "-p", buildScanPrompt()],
				cwd: dir,
				stdout: "pipe",
				stderr: "pipe",
			});
			const [code, stdout, stderr] = await Promise.all([
				proc.exited,
				new Response(proc.stdout).text(),
				new Response(proc.stderr).text(),
			]);
			assert.equal(code, 0, `omp exited ${code}\nstdout:\n${stdout}\nstderr:\n${stderr}`);

			const briefPath = join(dir, "advisor-brief.md");
			assert.ok(existsSync(briefPath), `advisor-brief.md missing; stdout:\n${stdout}`);
			const { candidates } = parseBrief(readFileSync(briefPath, "utf8"));
			assert.ok(
				candidates.length >= 1,
				`no candidates parsed; brief:\n${readFileSync(briefPath, "utf8")}\nstdout:\n${stdout}`,
			);
			const grounded = candidates.filter(
				(c) => c.evidence !== "" && existsSync(join(dir, c.evidence.split(":")[0])),
			);
			assert.ok(
				grounded.length >= 1,
				`no candidate has an existing evidence path; candidates:\n${JSON.stringify(candidates, null, 2)}`,
			);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	},
	600_000,
);
