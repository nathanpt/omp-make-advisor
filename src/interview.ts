import { Input, SelectList, replaceTabs, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@oh-my-pi/pi-tui";
import type { Component } from "@oh-my-pi/pi-tui";
import { getSelectListTheme } from "@oh-my-pi/pi-coding-agent";
import type { BriefCandidate, EvidenceContext } from "./brief.js";
import type { KeybindingsLike } from "./keybindings.js";

// One interview outcome per trap: the (possibly edited) rule text plus its
// keep/drop status. Order matches the candidate order in the brief.
export interface InterviewDecision {
	id: string;
	title: string;
	status: "keep" | "drop";
}

type Choice = "keep" | "edit" | "drop";

const CHOICES: readonly { value: Choice; label: string; description: string }[] = [
	{ value: "keep", label: "keep", description: "guard this rule" },
	{ value: "edit", label: "edit", description: "reword the rule text" },
	{ value: "drop", label: "drop", description: "exclude from the brief" },
];

// The bar caps at 12 cells so `Trap 12/12 ▮… · enter select · esc cancel`
// still fits the narrowest supported terminal (60 cols).
const MAX_BAR_CELLS = 12;

export class InterviewStepper implements Component {
	private titles: string[];
	private readonly decisions: InterviewDecision[] = [];
	private index = 0;
	private editing = false;
	private input: Input | null = null;
	private list: SelectList;
	private doneCalled = false;
	private readonly selectListTheme = getSelectListTheme();

	constructor(
		private readonly candidates: readonly BriefCandidate[],
		private readonly evidence: ReadonlyMap<string, EvidenceContext | null>,
		private readonly keybindings: KeybindingsLike,
		private readonly done: (result: InterviewDecision[] | undefined) => void,
	) {
		this.titles = candidates.map((c) => c.title);
		this.list = this.buildList();
	}

	private buildList(): SelectList {
		const list = new SelectList([...CHOICES], CHOICES.length, this.selectListTheme, { overflowSearch: false });
		// Preselect the row matching the brief's recorded status (edit sits
		// between; it is never a preselection target).
		list.setSelectedIndex(this.candidates[this.index]?.status === "drop" ? 2 : 0);
		list.onSelect = (item) => this.choose(item.value as Choice);
		list.onCancel = () => this.finish(undefined);
		return list;
	}

	private choose(choice: Choice): void {
		if (choice === "edit") {
			this.enterEdit();
			return;
		}
		const candidate = this.candidates[this.index];
		if (!candidate) return;
		this.decisions.push({ id: candidate.id, title: this.titles[this.index], status: choice });
		this.index += 1;
		if (this.index >= this.candidates.length) {
			this.finish(this.decisions);
			return;
		}
		this.list = this.buildList();
	}

	// Safe exploration on the edit screen: Enter saves, Esc reverts, and
	// nothing touches the brief until the whole interview commits.
	private enterEdit(): void {
		const input = new Input();
		input.setValue(this.titles[this.index]);
		input.focused = true;
		input.onSubmit = (value) => {
			const trimmed = value.trim();
			// An empty title would corrupt the brief block grammar; ignore the
			// submit and stay on the edit screen.
			if (trimmed === "") return;
			this.titles[this.index] = trimmed;
			this.exitEdit();
		};
		input.onEscape = () => this.exitEdit();
		this.input = input;
		this.editing = true;
	}

	private exitEdit(): void {
		this.editing = false;
		this.input = null;
		// Rebuild so the cursor resets to the row matching the recorded status —
		// after saving, the natural next action is keep or drop.
		this.list = this.buildList();
	}

	private finish(result: InterviewDecision[] | undefined): void {
		if (this.doneCalled) return;
		this.doneCalled = true;
		this.done(result);
	}

	handleInput(data: string): void {
		// Honor remapped interrupt keys; defaults already overlap SelectList's and
		// Input's own Esc/Ctrl+C handling.
		if (this.keybindings.matches(data, "app.interrupt")) {
			this.finish(undefined);
			return;
		}
		// Normalize raw PTY CR so Enter still confirms even if a user remaps the
		// select actions away from the enter key (SelectList and Input also react
		// to a literal "\n" unconditionally).
		const key = data === "\r" ? "\n" : data;
		if (this.editing) {
			this.input?.handleInput(key);
			return;
		}
		this.list.handleInput(key);
	}

	render(width: number): readonly string[] {
		const safeWidth = Math.max(1, width);
		if (this.editing) {
			const header = `Edit trap ${this.index + 1}/${this.candidates.length} · enter save · esc revert`;
			return [truncateToWidth(header, safeWidth), ...(this.input?.render(safeWidth) ?? [])];
		}
		const candidate = this.candidates[this.index];
		if (!candidate) return [];
		const rows: string[] = [truncateToWidth(this.header(), safeWidth)];
		rows.push(...wrapTextWithAnsi(replaceTabs(this.titles[this.index]), safeWidth));
		if (candidate.rationale !== "") {
			rows.push(...wrapTextWithAnsi(`why: ${replaceTabs(candidate.rationale)}`, safeWidth));
		}
		rows.push(truncateToWidth(`Evidence: ${replaceTabs(candidate.evidence)}`, safeWidth));
		rows.push(...this.evidenceRows(candidate.id, safeWidth));
		rows.push(...this.list.render(safeWidth));
		return rows;
	}

	// `Trap 3/12 ▮▮▯… · enter select · esc cancel`. Filled cells track the
	// current position (not decisions already made) — the bar answers "where
	// am I", the n/m fraction answers "how far".
	private header(): string {
		const total = this.candidates.length;
		const cells = Math.min(total, MAX_BAR_CELLS);
		const filled = Math.round((cells * (this.index + 1)) / total);
		const bar = this.selectListTheme.selectedText("▮".repeat(filled)) + "▯".repeat(cells - filled);
		return `Trap ${this.index + 1}/${total} ${bar} · enter select · esc cancel`;
	}

	// Guttered source lines, wrapped with the gutter indent preserved on
	// continuations so multi-line anchors stay visually anchored.
	private evidenceRows(id: string, width: number): string[] {
		const context = this.evidence.get(id) ?? null;
		if (!context || context.lines.length === 0) return [];
		const rows: string[] = [];
		const gutterWidth = visibleWidth(`${context.startLine + context.lines.length - 1} │ `);
		const bodyWidth = Math.max(1, width - gutterWidth);
		for (let i = 0; i < context.lines.length; i += 1) {
			const gutter = `${String(context.startLine + i).padStart(gutterWidth - 3)} │ `;
			const indent = " ".repeat(gutterWidth);
			const wrapped = wrapTextWithAnsi(replaceTabs(context.lines[i] ?? ""), bodyWidth);
			for (let j = 0; j < wrapped.length; j += 1) {
				rows.push((j === 0 ? gutter : indent) + wrapped[j]);
			}
		}
		if (context.more > 0) rows.push(truncateToWidth(`… +${context.more} more lines`, width));
		return rows;
	}

	invalidate(): void {
		this.list.invalidate();
		this.input?.invalidate();
	}

	dispose(): void {}
}
