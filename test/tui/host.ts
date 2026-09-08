import { appendFileSync } from "node:fs";
import type { CandidateTrap } from "../../src/brief.js";
import { TrapPicker, type PickerResult } from "../../src/picker.js";
import { Instrumented, mountHost } from "./hostlib.js";

// Watch-rule titles: a trap is a future-facing rule for the advisor, not a
// bug report. Mirrors the shape scouts will write into advisor-brief.md.
const STATIC_CANDIDATES: readonly CandidateTrap[] = [
	{ id: "t1", title: "Any write to the shared ingest map must hold the ingest lock", evidence: "src/ingest/loop.ts:41-58" },
	{ id: "t2", title: "Never swallow or soften auth errors in session refresh paths", evidence: "src/auth/session.ts:88" },
	{ id: "t3", title: "Any migration must update db/schema.sql in the same change", evidence: "db/migrations/0042_add_flags.sql" },
];

const eventsPath = process.argv[2];
if (!eventsPath) throw new Error("usage: bun run test/tui/host.ts <events.jsonl> [preloadJson]");

// Optional third argv: JSON `{ "dropIds"?: string[] }` preloading drop statuses.
// Invalid or absent JSON → no initial states (plain accept/cancel behavior).
const initialStates: ReadonlyMap<string, "keep" | "drop"> | undefined = (() => {
	const raw = process.argv[3];
	if (!raw) return undefined;
	try {
		const parsed = JSON.parse(raw) as { dropIds?: unknown };
		if (!Array.isArray(parsed.dropIds)) return undefined;
		return new Map(parsed.dropIds.filter((id): id is string => typeof id === "string").map((id) => [id, "drop" as const]));
	} catch {
		return undefined;
	}
})();

const shutdown = (result: PickerResult | undefined) => {
	appendFileSync(eventsPath, JSON.stringify({ type: "done", result: result ?? null }) + "\n");
	wrapped.dispose();
	setTimeout(stop, 100);
};
// Stub keybindings deliberately disable app.interrupt in the host: Esc-cancel is
// exercised through SelectList's own tui.select.cancel path, and interrupt
// matching stays a production-only concern.
const picker = new TrapPicker(STATIC_CANDIDATES, { matches: () => false }, shutdown, initialStates);
const wrapped = new Instrumented(picker, eventsPath);
const stop = mountHost(wrapped, eventsPath);
