import { test } from "bun:test";
import assert from "node:assert/strict";
import {
	buildReport,
	extractAdvisorTranscript,
	renderReportMarkdown,
	scoreFixture,
} from "../src/validate.ts";

const jsonl = (records: readonly unknown[]): string =>
	records.map((record) => JSON.stringify(record)).join("\n") + "\n";

const assistant = (content: readonly unknown[], usageTotal?: number, model = "glm-4.7"): unknown => ({
	type: "message",
	message: {
		role: "assistant",
		model,
		content,
		...(usageTotal === undefined ? {} : { usage: { cost: { total: usageTotal } } }),
	},
});

const advise = (note: string, severity?: string): unknown => ({
	type: "toolCall",
	name: "advise",
	arguments: severity === undefined ? { note } : { note, severity },
});

test("extraction: advises, severity default/coercion, cost over all assistant turns, models; skips non-assistant and torn lines", () => {
	const text = [
		JSON.stringify({ type: "title", title: "probe" }),
		JSON.stringify({ type: "session", sessionId: "s1" }),
		JSON.stringify({ type: "message", message: { role: "user", content: [{ type: "text", text: "do it" }] } }),
		// Silent review turn: usage counts, no advise.
		JSON.stringify(
			assistant(
				[
					{ type: "thinking", thinking: "reviewing the delta" },
					{ type: "toolCall", name: "read", arguments: { path: "src/a.ts" } },
				],
				0.01,
			),
		),
		// Torn tail of an append-only log — must be skipped, not fatal.
		'{"type":"message","message":{"role":"assistant","model":"glm-4.7","conte',
		JSON.stringify(assistant([advise("Shared map write bypasses the ingest lock", "concern")], 0.02)),
		JSON.stringify(assistant([advise("renewal masks the auth failure")], 0.03, "glm-4.7-air")),
		JSON.stringify(assistant([advise("unknown severity coerces", "urgent")], 0.04)),
		JSON.stringify({ type: "message", message: { role: "tool", content: [{ type: "toolResult", name: "read", content: "ok" }] } }),
	].join("\n") + "\n";
	const summary = extractAdvisorTranscript("concurrency-watcher", text);
	assert.deepEqual(summary.advises, [
		{ note: "Shared map write bypasses the ingest lock", severity: "concern" },
		{ note: "renewal masks the auth failure", severity: "nit" }, // missing severity → nit
		{ note: "unknown severity coerces", severity: "nit" }, // off-union severity → nit
	]);
	assert.ok(Math.abs(summary.costUsd - 0.1) < 1e-9, `cost ${summary.costUsd}`);
	assert.deepEqual(summary.models, ["glm-4.7", "glm-4.7-air"]);
});

test("verdict matrix: five scored paths plus no-run", () => {
	const hit = jsonl([assistant([advise("grab the lock before touching batchIndex", "concern")], 0.01)]);
	const miss = jsonl([assistant([advise("this looks risky", "nit")], 0.01)]);
	const silent = jsonl([assistant([{ type: "thinking", thinking: "clean delta" }], 0.01)]);
	const violation = { kind: "violation", expectKeywords: ["lock"] };
	const clean = { kind: "clean" };
	const scored = [
		["v-hit", violation, hit, "keep"],
		["v-miss", violation, miss, "retune"],
		["v-silent", violation, silent, "drop"],
		["c-silent", clean, silent, "keep"],
		["c-noise", clean, miss, "retune"],
	] as const;
	for (const [name, expected, transcript, verdict] of scored) {
		const result = scoreFixture(name, expected, [{ slug: "watcher", jsonlText: transcript }]);
		assert.equal(result.status, "scored", name);
		assert.equal(result.verdict, verdict, name);
	}
	const noRun = scoreFixture("v-norun", violation, []);
	assert.equal(noRun.status, "no-run");
	assert.equal(noRun.verdict, "drop");
});

test("hits match case-insensitively (keyword Auth vs note auth failure)", () => {
	const result = scoreFixture("err-swallow", { kind: "violation", expectKeywords: ["Auth"] }, [
		{ slug: "err-watcher", jsonlText: jsonl([assistant([advise("renewal masks the auth failure")], 0.01)]) },
	]);
	assert.deepEqual(result.hits, ["Auth"]);
	assert.equal(result.verdict, "keep");
});

test("markdown golden: table, highest severity, advise sections, single trailing newline", () => {
	const report = buildReport([
		{
			name: "conc-map",
			kind: "violation",
			keywords: ["lock", "map"],
			advisors: ["concurrency-watcher"],
			advises: [
				{ slug: "concurrency-watcher", note: "batchIndex.delete runs outside withIngestLock", severity: "concern" },
				{ slug: "concurrency-watcher", note: "caller.ts bypasses the map guard", severity: "blocker" },
			],
			hits: ["lock"],
			costUsd: 0.0123,
			models: ["g-1"],
			status: "scored",
			verdict: "keep",
		},
		{
			name: "clean-empty",
			kind: "clean",
			keywords: [],
			advisors: ["trap-watcher"],
			advises: [],
			hits: [],
			costUsd: 0.004,
			models: ["g-1"],
			status: "scored",
			verdict: "keep",
		},
	]);
	assert.equal(
		renderReportMarkdown(report),
		[
			"# oma precision report",
			"",
			"Run:  · advisors $0.0163 · keep 2 · retune 0 · drop 0",
			"",
			"| fixture | kind | verdict | advises | severity | hits | cost |",
			"|---|---|---|---|---|---|---|",
			"| conc-map | violation | keep | 2 | blocker | lock | $0.0123 |",
			"| clean-empty | clean | keep | 0 | — | — | $0.0040 |",
			"",
			"## conc-map",
			"",
			"- [concern] concurrency-watcher: batchIndex.delete runs outside withIngestLock",
			"- [blocker] concurrency-watcher: caller.ts bypasses the map guard",
			"",
		].join("\n"),
	);
});

test("markdown: no-run fixtures render a no-run advises cell", () => {
	const noRun = scoreFixture("v", { kind: "violation", expectKeywords: ["x"] }, []);
	const md = renderReportMarkdown(buildReport([noRun]));
	assert.ok(md.includes("| v | violation | drop | no-run | — | — | $0.0000 |"), md);
});
