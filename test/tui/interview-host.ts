import type { BriefCandidate, EvidenceContext } from "../../src/brief.js";
import { InterviewStepper, type InterviewResult } from "../../src/interview.js";
import { runOverlayHost } from "./hostlib.js";

// Watch-rule titles: a consideration is a future-facing rule for the advisor,
// not a bug report. Mirrors the shape scouts write into advisor-brief.md.
const CANDIDATES: readonly BriefCandidate[] = [
	{
		id: "t1",
		title: "Any write to the shared ingest map must hold the ingest lock",
		evidence: "src/ingest/loop.ts:41-58",
		status: "keep",
		rationale: "unlocked writers have corrupted the map twice",
	},
	{
		id: "t2",
		title: "Never swallow or soften auth errors in session refresh paths",
		evidence: "src/auth/session.ts:88",
		status: "keep",
		rationale: "",
	},
	{
		id: "t3",
		title: "Any migration must update db/schema.sql in the same change",
		evidence: "db/migrations/",
		status: "drop",
		rationale: "drift broke staging once",
	},
];

const DEFAULT_EVIDENCE: Record<string, EvidenceContext | null> = {
	t1: { startLine: 41, lines: ["const m = new Map()", "if (!held) m.set(k, v)"], more: 14 },
	t2: { startLine: 88, lines: ["  return null // soft-fail"], more: 0 },
	// t3 cites a directory (area guard): no inline lines.
	t3: null,
};

const eventsPath = process.argv[2];
if (!eventsPath) throw new Error("usage: bun run test/tui/interview-host.ts <events.jsonl> [configJson]");

// Optional second argv: JSON `{ "dropIds"?: string[] }` preloading drop
// statuses onto the static candidates (mirrors a parsed brief), plus
// `{ "evidence"?: Record<id, EvidenceContext | null> }` overrides.
// Invalid or absent JSON → defaults.
const config: { dropIds?: string[]; evidence?: Record<string, EvidenceContext | null> } = (() => {
	const raw = process.argv[3];
	if (!raw) return {};
	try {
		return JSON.parse(raw) as { dropIds?: string[]; evidence?: Record<string, EvidenceContext | null> };
	} catch {
		return {};
	}
})();

const dropIds = new Set(Array.isArray(config.dropIds) ? config.dropIds.filter((id) => typeof id === "string") : []);
const candidates = CANDIDATES.map((c) => ({ ...c, status: dropIds.has(c.id) ? ("drop" as const) : c.status }));
// The component takes a ReadonlyMap (id-keyed lookup at render time); build it
// from the static table plus any per-run config overrides.
const evidence: ReadonlyMap<string, EvidenceContext | null> = new Map(
	Object.entries({ ...DEFAULT_EVIDENCE, ...config.evidence }),
);
runOverlayHost<InterviewResult | undefined>(
	(keybindings, done) => new InterviewStepper(candidates, evidence, keybindings, done),
	eventsPath,
);
