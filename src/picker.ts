import { SelectList, truncateToWidth } from "@oh-my-pi/pi-tui";
import type { Component, Keybinding } from "@oh-my-pi/pi-tui";
import { getSelectListTheme } from "@oh-my-pi/pi-coding-agent";
import type { CandidateTrap } from "./brief.js";

export interface PickerResult {
	kept: string[];
	dropped: string[];
}

// Structural seam: the production mount passes omp's KeybindingsManager; the PTY
// host passes a stub so app.interrupt stays a production-only concern.
interface KeybindingsLike {
	matches(data: string, action: Keybinding): boolean;
}

// Must fit the narrowest supported terminal (60 cols) so the cancel hint survives.
const HEADER = "Traps · space keep/drop · enter accept · esc cancel";

export class TrapPicker implements Component {
	private states: Map<string, "keep" | "drop">;
	private list: SelectList;
	private cursor = 0;
	private doneCalled = false;

	constructor(
		private readonly candidates: readonly CandidateTrap[],
		private readonly keybindings: KeybindingsLike,
		private readonly done: (result: PickerResult | undefined) => void,
		initialStates?: ReadonlyMap<string, "keep" | "drop">,
	) {
		// Ids absent from initialStates default to keep (same as the bare picker).
		this.states = new Map(
			candidates.map((c) => [c.id, initialStates?.get(c.id) === "drop" ? ("drop" as const) : ("keep" as const)]),
		);
		this.list = this.buildList();
	}

	private buildList(): SelectList {
		const list = new SelectList(
			this.candidates.map((c) => ({
				value: c.id,
				label: `${this.states.get(c.id) === "keep" ? "[keep]" : "[drop]"} ${c.title}`,
				description: c.evidence,
			})),
			this.candidates.length,
			getSelectListTheme(),
			// Keep type-to-filter off explicitly: space must stay a toggle key at any
			// candidate count, not just while item count stays within maxVisible.
			{ overflowSearch: false },
		);
		list.onSelectionChange = (item) => {
			const index = this.candidates.findIndex((c) => c.id === item.value);
			if (index >= 0) this.cursor = index;
		};
		list.onSelect = () => this.finish(this.result());
		list.onCancel = () => this.finish(undefined);
		list.setSelectedIndex(this.cursor);
		return list;
	}

	private toggle(): void {
		const candidate = this.candidates[this.cursor];
		if (!candidate) return;
		this.states.set(candidate.id, this.states.get(candidate.id) === "keep" ? "drop" : "keep");
		this.list = this.buildList();
	}

	private result(): PickerResult {
		return {
			kept: this.candidates.filter((c) => this.states.get(c.id) === "keep").map((c) => c.id),
			dropped: this.candidates.filter((c) => this.states.get(c.id) === "drop").map((c) => c.id),
		};
	}

	private finish(result: PickerResult | undefined): void {
		if (this.doneCalled) return;
		this.doneCalled = true;
		this.done(result);
	}

	handleInput(data: string): void {
		// Honor remapped interrupt keys; defaults already overlap SelectList's own
		// Esc/Ctrl+C cancel handling.
		if (this.keybindings.matches(data, "app.interrupt")) {
			this.finish(undefined);
			return;
		}
		if (data === " ") {
			this.toggle();
			return;
		}
		// Normalize raw PTY CR so Enter still accepts even if a user remaps
		// tui.select.confirm away from the enter key (SelectList also confirms on
		// a literal "\n" unconditionally).
		this.list.handleInput(data === "\r" ? "\n" : data);
	}

	render(width: number): readonly string[] {
		// SelectList rows arrive already tab-replaced and width-truncated
		// (ScrollView does both per row); only the picker-owned header needs
		// the width guard.
		return [truncateToWidth(HEADER, width), ...this.list.render(width)];
	}

	invalidate(): void {
		this.list.invalidate();
	}

	dispose(): void {}
}
