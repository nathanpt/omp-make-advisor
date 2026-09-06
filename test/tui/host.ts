import { appendFileSync } from "node:fs";
import { ProcessTerminal, TUI } from "@oh-my-pi/pi-tui";
import type { Component } from "@oh-my-pi/pi-tui";
import type { CandidateTrap } from "../../src/brief.js";
import { TrapPicker, type PickerResult } from "../../src/picker.js";

// Watch-rule titles: a trap is a future-facing rule for the advisor, not a
// bug report. Mirrors the shape scouts will write into advisor-brief.md.
const STATIC_CANDIDATES: readonly CandidateTrap[] = [
	{ id: "t1", title: "Any write to the shared ingest map must hold the ingest lock", evidence: "src/ingest/loop.ts:41-58" },
	{ id: "t2", title: "Never swallow or soften auth errors in session refresh paths", evidence: "src/auth/session.ts:88" },
	{ id: "t3", title: "Any migration must update db/schema.sql in the same change", evidence: "db/migrations/0042_add_flags.sql" },
];

const eventsPath = process.argv[2];
if (!eventsPath) throw new Error("usage: bun run test/tui/host.ts <events.jsonl>");

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

class Instrumented implements Component {
	private lastKey: string | null = null;
	private disposed = false;

	constructor(private readonly picker: TrapPicker) {}

	render(width: number): readonly string[] {
		const lines = this.picker.render(width);
		const key = lines.join("\n");
		if (!this.disposed && key !== this.lastKey) {
			this.lastKey = key;
			appendFileSync(eventsPath, JSON.stringify({ type: "frame", lines: [...lines] }) + "\n");
		}
		return lines;
	}

	handleInput(data: string): void {
		this.picker.handleInput(data);
	}

	invalidate(): void {
		this.picker.invalidate();
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		appendFileSync(eventsPath, JSON.stringify({ type: "disposed" }) + "\n");
		this.picker.dispose();
	}
}

const terminal = new ProcessTerminal();
const tui = new TUI(terminal);
appendFileSync(eventsPath, JSON.stringify({ type: "size", cols: terminal.columns, rows: terminal.rows }) + "\n");

const shutdown = (result: PickerResult | undefined) => {
	appendFileSync(eventsPath, JSON.stringify({ type: "done", result: result ?? null }) + "\n");
	wrapped.dispose();
	setTimeout(() => {
		tui.stop();
		process.exit(0);
	}, 100);
};
// Stub keybindings deliberately disable app.interrupt in the host: Esc-cancel is
// exercised through SelectList's own tui.select.cancel path, and interrupt
// matching stays a production-only concern.
const picker = new TrapPicker(STATIC_CANDIDATES, { matches: () => false }, shutdown, initialStates);
const wrapped = new Instrumented(picker);
tui.showOverlay(wrapped);
tui.setFocus(wrapped);
tui.start();
