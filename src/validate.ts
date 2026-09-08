import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Deterministic scoring engine for the f-008 precision harness (DESIGN §4:
// "Precision run = Advisor over fixtures: flagged / missed per trap"; §7
// report screen). Everything here is pure over inputs; the only fs is the
// scoreFromResults aggregate entry used by test/fixtures/precision/validate.sh.
//
// Source of truth for the JSONL shape is the 2026-09-08 probe (PROGRESS.md
// "f-008 probe"): lines of {type, message:{role, content[], usage?, model?}};
// `advise` calls are content items {type:"toolCall", name:"advise",
// arguments:{note, severity?}} on role:"assistant" records; cost is
// message.usage.cost.total. Non-advise assistant turns (reads, silent
// reviews) also carry usage — their cost counts.

export type Severity = "nit" | "concern" | "blocker";
const SEVERITIES: readonly Severity[] = ["nit", "concern", "blocker"];
const SEVERITY_RANK: Record<Severity, number> = { nit: 0, concern: 1, blocker: 2 };

export interface AdviseRecord {
	slug: string;
	note: string;
	severity: Severity;
}

export interface FixtureResult {
	name: string; // fixture dir name, e.g. "conc-map"
	kind: "violation" | "clean";
	keywords: string[]; // from expected.json; [] for clean
	advisors: string[]; // slugs with transcripts found
	advises: AdviseRecord[];
	hits: string[]; // expected keywords found in >=1 note (case-insensitive)
	costUsd: number; // sum of usage.cost.total over ALL assistant records
	models: string[]; // distinct message.model values
	status: "scored" | "no-run"; // no-run: no advisor transcript found
	verdict: "keep" | "retune" | "drop";
}

export interface ValidateReport {
	generatedAt: string; // ISO timestamp, stamped by the runner
	fixtures: FixtureResult[]; // expected.json order
	totalCostUsd: number;
	totals: { keep: number; retune: number; drop: number };
}

// Advisors may hand-rolled severities outside the union; anything unknown
// falls back to the floor severity rather than corrupting the report.
function coerceSeverity(value: unknown): Severity {
	return SEVERITIES.includes(value as Severity) ? (value as Severity) : "nit";
}

export interface TranscriptSummary {
	advises: { note: string; severity: Severity }[];
	costUsd: number;
	models: string[];
}

// One advisor JSONL line narrowed to exactly what scoring reads (probe
// shape: {message:{role, content[], usage, model}}). Returns null for any
// non-assistant or malformed line — append-only logs may tear mid-write.
function parseAssistantLine(
	line: string,
): { costTotal: number; model: string | null; advises: { note: unknown; severity: unknown }[] } | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(line);
	} catch {
		return null;
	}
	if (typeof parsed !== "object" || parsed === null || !("message" in parsed)) return null;
	const { message } = parsed;
	if (
		typeof message !== "object" ||
		message === null ||
		!("role" in message) ||
		message.role !== "assistant"
	) {
		return null;
	}
	const costTotal =
		"usage" in message &&
		typeof message.usage === "object" &&
		message.usage !== null &&
		"cost" in message.usage &&
		typeof message.usage.cost === "object" &&
		message.usage.cost !== null &&
		"total" in message.usage.cost &&
		typeof message.usage.cost.total === "number"
			? message.usage.cost.total
			: 0;
	const model = "model" in message && typeof message.model === "string" ? message.model : null;
	const advises: { note: unknown; severity: unknown }[] = [];
	if ("content" in message && Array.isArray(message.content)) {
		for (const item of message.content) {
			if (typeof item !== "object" || item === null) continue;
			if (!("type" in item) || item.type !== "toolCall") continue;
			if (!("name" in item) || item.name !== "advise") continue;
			const args =
				"arguments" in item && typeof item.arguments === "object" && item.arguments !== null
					? item.arguments
					: {};
			advises.push({
				note: "note" in args ? args.note : undefined,
				severity: "severity" in args ? args.severity : undefined,
			});
		}
	}
	return { costTotal, model, advises };
}

export function extractAdvisorTranscript(slug: string, jsonlText: string): TranscriptSummary {
	const advises: { note: string; severity: Severity }[] = [];
	const models = new Set<string>();
	let costUsd = 0;
	for (const line of jsonlText.split("\n")) {
		if (line.trim() === "") continue;
		const assistant = parseAssistantLine(line);
		if (assistant === null) continue;
		costUsd += assistant.costTotal;
		if (assistant.model !== null && assistant.model !== "") models.add(assistant.model);
		for (const call of assistant.advises) {
			advises.push({ note: String(call.note ?? ""), severity: coerceSeverity(call.severity) });
		}
	}
	return { advises, costUsd, models: [...models] };
}

export function scoreFixture(
	name: string,
	expected: { kind: string; expectKeywords?: string[] },
	transcripts: readonly { slug: string; jsonlText: string }[],
): FixtureResult {
	const advisors: string[] = [];
	const advises: AdviseRecord[] = [];
	const models = new Set<string>();
	let costUsd = 0;
	for (const { slug, jsonlText } of transcripts) {
		advisors.push(slug);
		const summary = extractAdvisorTranscript(slug, jsonlText);
		advises.push(...summary.advises.map((a) => ({ slug, ...a })));
		costUsd += summary.costUsd;
		for (const model of summary.models) models.add(model);
	}
	const kind = expected.kind === "clean" ? "clean" : "violation";
	const keywords = expected.expectKeywords ?? [];
	const lowerNotes = advises.map((a) => a.note.toLowerCase());
	const hits = keywords.filter((keyword) => lowerNotes.some((note) => note.includes(keyword.toLowerCase())));
	const status: FixtureResult["status"] = transcripts.length === 0 ? "no-run" : "scored";
	// Verdict rules, evaluated in order (DESIGN §7 keep/retune/drop):
	// no transcript is a harness failure, not an advisor miss — it drops.
	let verdict: FixtureResult["verdict"];
	if (status === "no-run") verdict = "drop";
	else if (kind === "violation") verdict = hits.length > 0 ? "keep" : advises.length > 0 ? "retune" : "drop";
	else verdict = advises.length === 0 ? "keep" : "retune";
	return { name, kind, keywords, advisors, advises, hits, costUsd, models: [...models], status, verdict };
}

export function buildReport(fixtures: readonly FixtureResult[]): ValidateReport {
	const totals = { keep: 0, retune: 0, drop: 0 };
	let totalCostUsd = 0;
	for (const fixture of fixtures) {
		totals[fixture.verdict] += 1;
		totalCostUsd += fixture.costUsd;
	}
	// generatedAt stays "" here so unit tests stay deterministic; the runner
	// stamps the real timestamp.
	return { generatedAt: "", fixtures: [...fixtures], totalCostUsd, totals };
}

function highestSeverity(advises: readonly AdviseRecord[]): string {
	let best: Severity | null = null;
	for (const a of advises) {
		if (best === null || SEVERITY_RANK[a.severity] > SEVERITY_RANK[best]) best = a.severity;
	}
	return best ?? "—";
}

export function renderReportMarkdown(report: ValidateReport): string {
	const lines: string[] = [
		"# oma precision report",
		"",
		`Run: ${report.generatedAt} · advisors $${report.totalCostUsd.toFixed(4)} · keep ${report.totals.keep} · retune ${report.totals.retune} · drop ${report.totals.drop}`,
		"",
		"| fixture | kind | verdict | advises | severity | hits | cost |",
		"|---|---|---|---|---|---|---|",
	];
	for (const f of report.fixtures) {
		const advisesCell = f.status === "no-run" ? "no-run" : String(f.advises.length);
		lines.push(`| ${f.name} | ${f.kind} | ${f.verdict} | ${advisesCell} | ${highestSeverity(f.advises)} | ${f.hits.join(", ") || "—"} | $${f.costUsd.toFixed(4)} |`);
	}
	for (const f of report.fixtures) {
		if (f.advises.length === 0) continue;
		lines.push("", `## ${f.name}`, "");
		for (const a of f.advises) lines.push(`- [${a.severity}] ${a.slug}: ${a.note}`);
	}
	return lines.join("\n") + "\n";
}

// Script entry for validate.sh: scores every expected.json fixture against
// the <name>.advisor.<slug>.jsonl transcripts the runner archived, writes the
// JSON + markdown artifacts, echoes the markdown, returns the report.
export function scoreFromResults(
	expectedPath: string,
	resultsDir: string,
	outJsonPath: string,
	outMdPath: string,
): ValidateReport {
	const expected = JSON.parse(readFileSync(expectedPath, "utf8")) as Record<
		string,
		{ kind: string; expectKeywords?: string[] }
	>;
	const files = readdirSync(resultsDir).sort();
	const fixtures: FixtureResult[] = Object.entries(expected).map(([name, exp]) => {
		const prefix = `${name}.advisor.`;
		const transcripts: { slug: string; jsonlText: string }[] = [];
		for (const file of files) {
			if (!file.startsWith(prefix) || !file.endsWith(".jsonl")) continue;
			// __advisor.jsonl (legacy bare name) archives as <name>.advisor.jsonl → slug "default"
			const slug = file.slice(prefix.length, -".jsonl".length) || "default";
			transcripts.push({ slug, jsonlText: readFileSync(join(resultsDir, file), "utf8") });
		}
		return scoreFixture(name, exp, transcripts);
	});
	const report = buildReport(fixtures);
	report.generatedAt = new Date().toISOString();
	writeFileSync(outJsonPath, JSON.stringify(report, null, "\t") + "\n", "utf8");
	const markdown = renderReportMarkdown(report);
	writeFileSync(outMdPath, markdown, "utf8");
	console.log(markdown);
	return report;
}
