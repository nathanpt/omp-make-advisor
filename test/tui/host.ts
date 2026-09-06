import { appendFileSync } from "node:fs";
import { ProcessTerminal, TUI } from "@oh-my-pi/pi-tui";
import type { Component } from "@oh-my-pi/pi-tui";
import { STATIC_CANDIDATES } from "../../src/traps.js";
import { TrapPicker, type PickerResult } from "../../src/picker.js";

const eventsPath = process.argv[2];
if (!eventsPath) throw new Error("usage: bun run test/tui/host.ts <events.jsonl>");

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
const picker = new TrapPicker(STATIC_CANDIDATES, { matches: () => false }, shutdown);
const wrapped = new Instrumented(picker);
tui.showOverlay(wrapped);
tui.setFocus(wrapped);
tui.start();
