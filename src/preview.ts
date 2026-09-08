import { ScrollView, truncateToWidth, wrapTextWithAnsi, replaceTabs } from "@oh-my-pi/pi-tui";
import type { Component } from "@oh-my-pi/pi-tui";
import type { KeybindingsLike } from "./keybindings.js";

// Fixed viewport budget for the previewed body; taller content scrolls.
const BODY_HEIGHT = 12;

export class WatchdogPreview implements Component {
	private readonly scrollView: ScrollView;
	private lastWidth: number | null = null;
	private doneCalled = false;

	constructor(
		private readonly content: string,
		private readonly targetName: string,
		private readonly keybindings: KeybindingsLike,
		private readonly done: (apply: boolean | undefined) => void,
	) {
		this.scrollView = new ScrollView([], { height: BODY_HEIGHT });
	}

	private finish(apply: boolean | undefined): void {
		if (this.doneCalled) return;
		this.doneCalled = true;
		this.done(apply);
	}

	handleInput(data: string): void {
		// Honor remapped interrupt keys.
		if (this.keybindings.matches(data, "app.interrupt")) {
			this.finish(undefined);
			return;
		}
		// Normalize raw PTY CR, same belt-and-braces as picker.ts; the literal
		// "\n" / "\x1b" fallbacks keep confirm/cancel working when a user
		// remaps the select actions away from enter/escape.
		const key = data === "\r" ? "\n" : data;
		if (key === "\n" || this.keybindings.matches(key, "tui.select.confirm")) {
			this.finish(true);
			return;
		}
		if (key === "\x1b" || key === "\x03" || this.keybindings.matches(key, "tui.select.cancel")) {
			this.finish(undefined);
			return;
		}
		// Everything else is scroll navigation (arrows, PageUp/Down, Home/End).
		this.scrollView.handleScrollKey(key);
	}

	render(width: number): readonly string[] {
		const safeWidth = Math.max(1, width);
		if (this.lastWidth !== safeWidth) {
			this.lastWidth = safeWidth;
			const rows: string[] = [];
			for (const line of this.content.split("\n")) {
				rows.push(...wrapTextWithAnsi(replaceTabs(line), safeWidth));
			}
			this.scrollView.setLines(rows);
		}
		const header = truncateToWidth(`${this.targetName} preview · enter write · esc cancel`, safeWidth);
		return [header, ...this.scrollView.render(safeWidth)];
	}

	invalidate(): void {
		this.scrollView.invalidate();
	}

	dispose(): void {}
}
