import { SelectList, replaceTabs, truncateToWidth } from "@oh-my-pi/pi-tui";
import type { Component } from "@oh-my-pi/pi-tui";
import { getSelectListTheme } from "@oh-my-pi/pi-coding-agent";
import type { CandidateTrap } from "./traps.js";

export interface PickerResult {
	kept: string[];
	dropped: string[];
}

interface KeybindingsLike {
	matches(data: string, action: string): boolean;
}

export class TrapPicker implements Component {
	private states: Map<string, "keep" | "drop">;
	private list: SelectList;
	private cursor = 0;
	private doneCalled = false;

	constructor(
		private readonly candidates: readonly CandidateTrap[],
		private readonly keybindings: KeybindingsLike,
		private readonly done: (result: PickerResult | undefined) => void,
	) {
		this.states = new Map(candidates.map((c) => [c.id, "keep" as const]));
		this.list = this.buildList();
	}

	private buildList(): SelectList {
		const list = new SelectList(
			this.candidates.map((c) => ({
				value: c.id,
				label: `${this.states.get(c.id) === "keep" ? "[keep]" : "[drop]"} ${c.title}`,
				description: c.evidence,
			})),
			Math.max(8, this.candidates.length),
			getSelectListTheme(),
		);
		list.onSelectionChange = (item) => {
			const index = this.candidates.findIndex((c) => c.id === item.value);
			if (index >= 0) this.cursor = index;
		};
		list.onSelect = () => this.finish();
		list.onCancel = () => this.finishCancel();
		list.setSelectedIndex(this.cursor);
		return list;
	}

	private toggle(): void {
		const candidate = this.candidates[this.cursor];
		if (!candidate) return;
		this.states.set(candidate.id, this.states.get(candidate.id) === "keep" ? "drop" : "keep");
		this.list = this.buildList();
	}

	private finish(): void {
		if (this.doneCalled) return;
		this.doneCalled = true;
		this.done({
			kept: this.candidates.filter((c) => this.states.get(c.id) === "keep").map((c) => c.id),
			dropped: this.candidates.filter((c) => this.states.get(c.id) === "drop").map((c) => c.id),
		});
	}

	private finishCancel(): void {
		if (this.doneCalled) return;
		this.doneCalled = true;
		this.done(undefined);
	}

	handleInput(data: string): void {
		if (this.keybindings.matches(data, "app.interrupt")) {
			this.finishCancel();
			return;
		}
		if (data === " ") {
			this.toggle();
			return;
		}
		this.list.handleInput(data === "\r" ? "\n" : data);
	}

	render(width: number): readonly string[] {
		return [
			"Trap candidates  -  space: keep/drop  ·  Enter: accept  ·  Esc: cancel",
			...this.list.render(width),
		].map((line) => truncateToWidth(replaceTabs(line), width));
	}

	invalidate(): void {
		this.list.invalidate();
	}

	dispose(): void {}
}
