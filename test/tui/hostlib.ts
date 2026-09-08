import { appendFileSync } from "node:fs";
import { ProcessTerminal, TUI } from "@oh-my-pi/pi-tui";
import type { Component } from "@oh-my-pi/pi-tui";

// Records frame/disposed events around a mounted component. Frames are
// deduped on content so render polls don't flood the events file, and
// nothing is appended after dispose.
export class Instrumented implements Component {
	private lastFrame: string | null = null;
	private disposed = false;

	constructor(
		private readonly inner: Component,
		private readonly eventsPath: string,
	) {}

	render(width: number): readonly string[] {
		const lines = this.inner.render(width);
		const key = lines.join("\n");
		if (!this.disposed && key !== this.lastFrame) {
			this.lastFrame = key;
			appendFileSync(this.eventsPath, JSON.stringify({ type: "frame", lines: [...lines] }) + "\n");
		}
		return lines;
	}

	handleInput(data: string): void {
		this.inner.handleInput?.(data);
	}

	invalidate(): void {
		this.inner.invalidate?.();
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		appendFileSync(this.eventsPath, JSON.stringify({ type: "disposed" }) + "\n");
		this.inner.dispose?.();
	}
}

// Mounts `wrapped` as the sole overlay under a real ProcessTerminal and
// returns a hard-stop function. Callers own the settle delay before calling
// stop so final events flush first (the events contract tests rely on it).
export function mountHost(wrapped: Component, eventsPath: string): () => void {
	const terminal = new ProcessTerminal();
	const tui = new TUI(terminal);
	appendFileSync(eventsPath, JSON.stringify({ type: "size", cols: terminal.columns, rows: terminal.rows }) + "\n");
	tui.showOverlay(wrapped);
	tui.setFocus(wrapped);
	tui.start();
	return () => {
		tui.stop();
		process.exit(0);
	};
}
