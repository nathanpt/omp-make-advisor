import { test } from "bun:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverAdvisorConfigs } from "@oh-my-pi/pi-coding-agent/advisor/config";
import type { BriefCandidate } from "../src/brief.js";
import { buildRosterDoc, buildWatchdogYml, WATCHDOG_YML_FILENAME } from "../src/emit.js";

function candidate(id: string, status: "keep" | "drop" = "keep"): BriefCandidate {
	return { id, title: `Trap ${id}`, evidence: `src/${id}.ts`, status, rationale: "" };
}

// Two conc traps outrank the single-trap lenses; err/data/build tie and fall
// back to LENS_ORDER, so build sits just past the cap.
const RANKING: readonly BriefCandidate[] = ["conc-1", "conc-2", "err-1", "data-1", "build-1"].map((id) => candidate(id));

test("roster ranking: kept count desc, LENS_ORDER ties, capped at 3", () => {
	const names = buildRosterDoc(RANKING).advisors.map((a) => a.name);
	assert.deepEqual(names, ["Concurrency Watcher", "Error Handling Watcher", "Data Drift Watcher"]);
});

test("roster derives from kept candidates only (dropped lens disappears)", () => {
	const dropped = RANKING.map((c) => (c.id.startsWith("conc-") ? candidate(c.id, "drop") : c));
	const names = buildRosterDoc(dropped).advisors.map((a) => a.name);
	assert.deepEqual(names, ["Error Handling Watcher", "Data Drift Watcher", "Build Gate Watcher"]);
});

test("roster fallback: no lens-prefixed kept ids yields exactly one Consideration Watcher", () => {
	const names = buildRosterDoc([candidate("x-1")]).advisors.map((a) => a.name);
	assert.deepEqual(names, ["Consideration Watcher"]);
});

test("emitted roster validates against OMP's advisor discovery walk", async () => {
	const doc = buildRosterDoc(RANKING);
	const dir = mkdtempSync(join(tmpdir(), "oma-roster-"));
	const agentDir = mkdtempSync(join(tmpdir(), "oma-roster-agent-"));
	try {
		writeFileSync(join(dir, WATCHDOG_YML_FILENAME), buildWatchdogYml(RANKING), "utf8");
		// agentDir (an empty temp dir) isolates the user level; the project
		// walk from the temp dir upward finds no other WATCHDOG.yml.
		const discovered = await discoverAdvisorConfigs(dir, agentDir);
		assert.deepEqual(
			discovered.advisors.map((a) => a.name),
			doc.advisors.map((a) => a.name),
		);
		assert.equal(discovered.advisors[0]?.model, "@slow");
		assert.deepEqual(discovered.advisors[0]?.tools, ["read", "grep", "glob"]);
		assert.ok(discovered.sharedInstructions?.includes("omp-make-advisor"), "shared instructions must carry the generator attribution");
	} finally {
		rmSync(dir, { recursive: true, force: true });
		rmSync(agentDir, { recursive: true, force: true });
	}
});
