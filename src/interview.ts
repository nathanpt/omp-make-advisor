import { Input, SelectList, replaceTabs, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@oh-my-pi/pi-tui";
import type { Component } from "@oh-my-pi/pi-tui";
import { getSelectListTheme } from "@oh-my-pi/pi-coding-agent";
import type { BriefCandidate, EvidenceContext } from "./brief.js";
import type { KeybindingsLike } from "./keybindings.js";

// One interview outcome per consideration: the (possibly edited) rule text
// plus its keep/drop status. Order matches the candidate order in the brief.
export interface InterviewDecision {
	id: string;
	title: string;
	status: "keep" | "drop";
}

// What a completed interview hands back: one decision per ORIGINAL candidate
// (always complete — bulk or walked), plus the customs created this session
// (status "keep"; customs have no original to decide on).
export interface InterviewResult {
	decisions: InterviewDecision[];
	added: BriefCandidate[];
}

type Choice = "keep" | "edit" | "drop";

const CHOICES: readonly { value: Choice; label: string; description: string }[] = [
	{ value: "keep", label: "keep", description: "guard this rule" },
	{ value: "edit", label: "edit", description: "reword the rule text" },
	{ value: "drop", label: "drop", description: "exclude from the brief" },
];

type MenuChoice = "walk" | "keep-all" | "drop-all" | "add" | "remove" | "save";

const MENU_ROWS: readonly { value: MenuChoice; label: string; description: string }[] = [
	{ value: "walk", label: "walk each", description: "keep, reword, or drop one at a time" },
	{ value: "keep-all", label: "keep all", description: "accept every consideration" },
	{ value: "drop-all", label: "drop all", description: "reject every consideration" },
	{ value: "add", label: "add custom", description: "write your own consideration" },
	{ value: "remove", label: "remove custom", description: "pick an added consideration to delete" },
	{ value: "save", label: "save & exit", description: "write decisions to the brief" },
];

// The bar caps at 12 cells so `Consideration 12/12 ▮… · enter select · esc
// cancel` still fits the narrowest supported terminal (60 cols).
const MAX_BAR_CELLS = 12;

// Row positions in CHOICES; buildList preselects by status and must never
// land on the edit row. Derived, not positional, so reordering CHOICES
// cannot silently break preselection.
const KEEP_ROW = CHOICES.findIndex((c) => c.value === "keep");
const DROP_ROW = CHOICES.findIndex((c) => c.value === "drop");

type Mode = "menu" | "walk" | "custom-title" | "custom-evidence" | "custom-rationale" | "custom-manage";

export class InterviewStepper implements Component {
	private titles: string[];
	private readonly decisions: InterviewDecision[] = [];
	// Bulk verdicts from keep-all/drop-all, one per original candidate. While
	// set it drives the menu header counts and the walk list preselection; a
	// walk supersedes it (the walk produces a complete decisions array, which
	// is what completion returns).
	private bulk: InterviewDecision[] | null = null;
	private readonly added: BriefCandidate[] = [];
	// `index` advances in lockstep with decisions.length (one decision per
	// non-edit choice); the active `Input` — edit screen seeded, custom forms
	// empty — is non-null exactly while a text screen is live, and
	// single-threaded input dispatch keeps the two in lockstep.
	private index = 0;
	private mode: Mode = "menu";
	private input: Input | null = null;
	private list: SelectList;
	private menu: SelectList;
	// Live only in custom-manage mode: the pick-one-to-delete list over this
	// session's added customs.
	private manage: SelectList | null = null;
	private customTitle = "";
	private customEvidence = "";
	private doneCalled = false;
	private readonly selectListTheme = getSelectListTheme();
	constructor(
		private readonly candidates: readonly BriefCandidate[],
		private readonly evidence: ReadonlyMap<string, EvidenceContext | null>,
		private readonly keybindings: KeybindingsLike,
		private readonly done: (result: InterviewResult | undefined) => void,
	) {
		this.titles = candidates.map((c) => c.title);
		this.menu = this.buildMenu();
		this.list = this.buildList();
	}

	// Effective status of original i: the bulk verdict when set, else the
	// brief's recorded status. Drives the menu header counts and the walk
	// preselection — walking after a bulk choice preselects the bulk rows.
	private effectiveStatus(i: number): "keep" | "drop" {
		return this.bulk?.[i]?.status ?? this.candidates[i]?.status ?? "keep";
	}

	private buildMenu(): SelectList {
		// The remove row only exists while there is something to remove.
		const rows = MENU_ROWS.filter((row) => row.value !== "remove" || this.added.length > 0).map((row) =>
			row.value === "add" && this.added.length > 0
				? { ...row, label: `${row.label} (${this.added.length} added)` }
				: row,
		);
		const list = new SelectList([...rows], rows.length, this.selectListTheme, { overflowSearch: false });
		list.setSelectedIndex(0);
		list.onSelect = (item) => this.chooseMenu(item.value as MenuChoice);
		list.onCancel = () => this.finish(undefined);
		return list;
	}

	private buildList(): SelectList {
		const list = new SelectList([...CHOICES], CHOICES.length, this.selectListTheme, { overflowSearch: false });
		// Preselect the row matching the effective status.
		list.setSelectedIndex(this.effectiveStatus(this.index) === "drop" ? DROP_ROW : KEEP_ROW);
		list.onSelect = (item) => this.choose(item.value as Choice);
		list.onCancel = () => this.finish(undefined);
		return list;
	}

	private chooseMenu(choice: MenuChoice): void {
		switch (choice) {
			case "walk":
				// The walk re-decides everything; its completion supersedes bulk.
				this.mode = "walk";
				this.list = this.buildList();
				return;
			case "keep-all":
			case "drop-all": {
				const status = choice === "keep-all" ? "keep" : "drop";
				// Staying on the menu: the header counts re-read bulk state, and
				// the list rows are state-independent (no rebuild, cursor stays).
				this.bulk = this.candidates.map((c, i) => ({ id: c.id, title: this.titles[i], status }));
				return;
			}
			case "add":
				this.enterCustom("custom-title");
				return;
			case "remove":
				this.enterManage();
				return;
			case "save":
				this.finish({
					// Bulk verdicts when present; a completed walk's decisions; or
					// the identity (existing brief statuses) when neither ran.
					decisions:
						this.bulk ??
						(this.decisions.length === this.candidates.length
							? this.decisions
							: this.candidates.map((c, i) => ({ id: c.id, title: this.titles[i], status: c.status }))),
					added: this.added,
				});
				return;
		}
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
			// Walk completion finishes immediately — the menu had its chance.
			this.finish({ decisions: this.decisions, added: this.added });
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
	}

	private exitEdit(): void {
		this.input = null;
		// Rebuild on both exits (save and revert) so the cursor resets to the
		// row matching the recorded status — the next natural action is keep
		// or drop, never a second edit.
		this.list = this.buildList();
	}

	// Add-custom form: three sequential single-line Inputs — title (required),
	// evidence and rationale (optional, empty submit saves ""). Esc on any
	// screen aborts the whole add; nothing partial is kept.
	private enterCustom(screen: "custom-title" | "custom-evidence" | "custom-rationale"): void {
		this.mode = screen;
		const input = new Input();
		input.focused = true;
		input.onSubmit = (value) => {
			const trimmed = value.trim();
			if (screen === "custom-title") {
				// An empty title would corrupt the brief block grammar; ignore
				// the submit and stay live (same rule as the edit screen).
				if (trimmed === "") return;
				this.customTitle = trimmed;
				this.enterCustom("custom-evidence");
				return;
			}
			if (screen === "custom-evidence") {
				this.customEvidence = trimmed;
				this.enterCustom("custom-rationale");
				return;
			}
			// Rationale is the last screen: commit and return to the menu.
			this.added.push({
				id: this.nextCustomId(),
				title: this.customTitle,
				evidence: this.customEvidence,
				rationale: trimmed,
				status: "keep",
			});
			this.exitCustom();
		};
		input.onEscape = () => this.exitCustom();
		this.input = input;
	}

	private exitCustom(): void {
		this.customTitle = "";
		this.customEvidence = "";
		this.input = null;
		this.mode = "menu";
		// Rebuild so the add row picks up the "(N added)" suffix and the
		// remove row appears for the first added custom.
		this.menu = this.buildMenu();
	}

	// Remove screen: pick one of this session's added customs to delete.
	// Esc returns to the menu without deleting (cursor stays put).
	private enterManage(): void {
		this.mode = "custom-manage";
		const rows = this.added.map((c) => ({ value: c.id, label: c.title, description: c.id }));
		const list = new SelectList(rows, rows.length, this.selectListTheme, { overflowSearch: false });
		list.setSelectedIndex(0);
		list.onSelect = (item) => {
			const id = item.value as string;
			const idx = this.added.findIndex((c) => c.id === id);
			if (idx !== -1) this.added.splice(idx, 1);
			this.manage = null;
			this.mode = "menu";
			// Rebuild: the "(N added)" suffix and remove row track the count.
			this.menu = this.buildMenu();
		};
		list.onCancel = () => {
			this.manage = null;
			this.mode = "menu";
		};
		this.manage = list;
	}

	// Smallest `custom-K` unused across the original ids and any customs added
	// this session. (Customs persisted by a previous session are originals in
	// this brief, so they are covered by the candidate ids.)
	private nextCustomId(): string {
		const used = new Set([...this.candidates.map((c) => c.id), ...this.added.map((a) => a.id)]);
		let k = 1;
		while (used.has(`custom-${k}`)) k += 1;
		return `custom-${k}`;
	}

	private finish(result: InterviewResult | undefined): void {
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
		if (this.input) {
			this.input.handleInput(key);
			return;
		}
		const active =
			this.mode === "menu" ? this.menu : this.mode === "custom-manage" ? this.manage : this.list;
		active?.handleInput(key);
	}

	render(width: number): readonly string[] {
		const safeWidth = Math.max(1, width);
		if (this.input) {
			const rows = [truncateToWidth(this.inputHeader(), safeWidth)];
			const hint = this.fieldHint();
			if (hint !== "") rows.push(...wrapTextWithAnsi(hint, safeWidth));
			rows.push(...(this.input.render(safeWidth) ?? []));
			return rows;
		}
		if (this.mode === "custom-manage" && this.manage) {
			return [
				truncateToWidth("Remove added consideration · enter remove · esc back", safeWidth),
				...this.manage.render(safeWidth),
			];
		}
		if (this.mode === "menu") {
			return [truncateToWidth(this.menuHeader(), safeWidth), ...this.menu.render(safeWidth)];
		}
		const candidate = this.candidates[this.index];
		if (!candidate) return [];
		const rows: string[] = [truncateToWidth(this.header(), safeWidth)];
		rows.push(...wrapTextWithAnsi(replaceTabs(this.titles[this.index]), safeWidth));
		if (candidate.rationale !== "") {
			rows.push(...wrapTextWithAnsi(`why: ${replaceTabs(candidate.rationale)}`, safeWidth));
		}
		if (candidate.evidence !== "") {
			rows.push(truncateToWidth(`Evidence: ${replaceTabs(candidate.evidence)}`, safeWidth));
		}
		rows.push(...this.evidenceRows(candidate.id, safeWidth));
		rows.push(...this.list.render(safeWidth));
		return rows;
	}

	private inputHeader(): string {
		switch (this.mode) {
			case "custom-title":
				return "Custom consideration · title (required) · enter save · esc back";
			case "custom-evidence":
				return "Custom consideration · evidence path (optional) · enter save · esc back";
			case "custom-rationale":
				return "Custom consideration · rationale (optional) · enter save · esc back";
			default:
				return `Edit consideration ${this.index + 1}/${this.candidates.length} · enter save · esc revert`;
		}
	}

	// Field semantics for the add-custom form — the title carries the entire
	// rule, evidence the optional anchor, rationale the optional why.
	private fieldHint(): string {
		switch (this.mode) {
			case "custom-title":
				return 'The complete rule, one line — "Any change to X must Y", not a short label.';
			case "custom-evidence":
				return "Optional source anchor: path, path:line, or path:line-range. Blank if none.";
			case "custom-rationale":
				return "Optional why it matters: the risk, invariant, or past incident.";
			default:
				return "";
		}
	}

	// `Consideration 3/12 ▮▮▯… · enter select · esc cancel`. Filled cells
	// track the current position (not decisions already made) — the bar
	// answers "where am I", the n/m fraction answers "how far".
	private header(): string {
		const total = this.candidates.length;
		const cells = Math.min(total, MAX_BAR_CELLS);
		const filled = Math.round((cells * (this.index + 1)) / total);
		const bar = this.selectListTheme.selectedText("▮".repeat(filled)) + "▯".repeat(cells - filled);
		return `Consideration ${this.index + 1}/${total} ${bar} · enter select · esc cancel`;
	}

	// `Considerations · kept K · dropped D · esc cancel` — counts read the
	// effective state (bulk verdicts when set, else the brief's statuses).
	private menuHeader(): string {
		const kept = this.candidates.reduce((n, _, i) => n + (this.effectiveStatus(i) === "keep" ? 1 : 0), 0);
		return `Considerations · kept ${kept} · dropped ${this.candidates.length - kept} · esc cancel`;
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
		this.menu.invalidate();
		this.manage?.invalidate();
		this.input?.invalidate();
	}

	dispose(): void {}
}
