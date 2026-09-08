import { test } from "bun:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { briefToText } from "../src/brief.ts";
import type { BriefCandidate } from "../src/brief.ts";
import { readHubStatus, renderHubSummary } from "../src/hub.ts";

const CANDIDATES: readonly BriefCandidate[] = [
	{ id: "conc-1", title: "Hold the ingest lock on shared map writes", evidence: "src/loop.ts:1-5", status: "keep", rationale: "" },
	{ id: "err-1", title: "Never swallow auth errors", evidence: "src/auth.ts", status: "keep", rationale: "" },
	{ id: "data-1", title: "Migrations update schema.sql", evidence: "db/schema.sql", status: "drop", rationale: "" },
];

const seedBrief = (cwd: string, candidates: readonly BriefCandidate[] = CANDIDATES): void => {
	writeFileSync(join(cwd, "advisor-brief.md"), briefToText(candidates), "utf8");
};

const seedReport = (cwd: string, body: string): void => {
	const dir = join(cwd, "test/fixtures/precision/results");
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "report.json"), body, "utf8");
};

test("empty repo: nothing present, next action is scan", () => {
	const cwd = mkdtempSync(join(tmpdir(), "oma-hub-"));
	try {
		const status = readHubStatus(cwd);
		assert.equal(status.project !== "", true);
		assert.deepEqual(status.brief, { present: false, candidates: 0, kept: 0 });
		assert.deepEqual(status.watchdog, { md: "none", yml: "none" });
		assert.equal(status.report.state, "none");
		const summary = renderHubSummary(status);
		assert.ok(summary[0].startsWith("oma · "));
		assert.ok(summary.some((line) => line.includes("scan") && line.includes("— run /oma scan first")));
		assert.ok(summary.some((line) => line.startsWith("next: /oma scan")));
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("seeded repo: brief counts, sidecar watchdog, ready report", () => {
	const cwd = mkdtempSync(join(tmpdir(), "oma-hub-"));
	try {
		seedBrief(cwd);
		writeFileSync(join(cwd, "WATCHDOG.oma.md"), "# sidecar\n", "utf8");
		writeFileSync(join(cwd, "WATCHDOG.yml"), "instructions: x\n", "utf8");
		seedReport(cwd, JSON.stringify({ generatedAt: "2026-09-08T20:15:23.865Z", totalCostUsd: 0.063 }));
		const status = readHubStatus(cwd);
		assert.deepEqual(status.brief, { present: true, candidates: 3, kept: 2 });
		assert.deepEqual(status.watchdog, { md: "sidecar", yml: "canonical" });
		assert.equal(status.report.state, "ready");
		assert.equal(status.report.totalCostUsd, 0.063);
		const summary = renderHubSummary(status);
		assert.ok(summary.some((line) => line.includes("✓ 2 of 3 kept")));
		assert.ok(summary.some((line) => line.includes("⚠ sidecars to move")));
		assert.ok(summary.some((line) => line.includes("✓ report 09-08 $0.06")));
		assert.ok(summary.some((line) => line.startsWith("next: move WATCHDOG.oma.*")));
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("next-action ladder: interview, emit, activate", () => {
	const cwd = mkdtempSync(join(tmpdir(), "oma-hub-"));
	try {
		seedBrief(cwd, CANDIDATES.map((c) => ({ ...c, status: "drop" as const })));
		assert.ok(renderHubSummary(readHubStatus(cwd)).some((l) => l.startsWith("next: /oma interview")));
		seedBrief(cwd);
		assert.ok(renderHubSummary(readHubStatus(cwd)).some((l) => l.startsWith("next: /oma emit")));
		writeFileSync(join(cwd, "WATCHDOG.md"), "# canonical\n", "utf8");
		writeFileSync(join(cwd, "WATCHDOG.yml"), "instructions: x\n", "utf8");
		assert.ok(renderHubSummary(readHubStatus(cwd)).some((l) => l.startsWith("next: /advisor on")));
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("malformed report.json surfaces as malformed, not ready", () => {
	const cwd = mkdtempSync(join(tmpdir(), "oma-hub-"));
	try {
		seedReport(cwd, "{torn");
		const status = readHubStatus(cwd);
		assert.equal(status.report.state, "malformed");
		assert.ok(renderHubSummary(status).some((line) => line.includes("— malformed (dev)")));
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});
