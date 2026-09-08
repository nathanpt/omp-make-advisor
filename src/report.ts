import { ScrollView, SelectList, replaceTabs, truncateToWidth, wrapTextWithAnsi } from "@oh-my-pi/pi-tui";
import type { Component } from "@oh-my-pi/pi-tui";
import { getSelectListTheme } from "@oh-my-pi/pi-coding-agent";
import type { KeybindingsLike } from "./keybindings.js";
import type { FixtureResult, ValidateReport } from "./validate.js";

// Fixed viewport budget for the detail pane; taller content scrolls.
const BODY_HEIGHT = 12;

// The row's middle cell — what the advisor actually did on that fixture.
function statusLine(fixture: FixtureResult): string {
	if (fixture.status === "no-run") return "no transcript";
	if (fixture.kind === "violation") {
		if (fixture.hits.length > 0) return "flagged";
		if (fixture.advises.length > 0) return "off-keyword";
		return "silent";
	}
	return fixture.advises.length > 0 ? "noise" : "clean";
}

// Scored-report viewer for /oma validate: a SelectList of fixture rows with
// verdict totals in the footer; Enter drills into a scrolling detail pane
// (advises verbatim, keywords vs hits, cost/model). Esc walks back out and
// closes; done fires exactly once.
export class ReportScreen implements Component {
	private readonly list: SelectList;
	private readonly scrollView = new ScrollView([], { height: BODY_HEIGHT });
	private detail: FixtureResult | null = null;
	private lastDetailWidth: number | null = null;
	private doneCalled = false;

	constructor(
		private readonly report: ValidateReport,
		private readonly keybindings: KeybindingsLike,
		private readonly done: (result: boolean | undefined) => void,
	) {
		const items = this.report.fixtures.map((fixture) => ({
			value: fixture.name,
			label: `${fixture.name} · ${statusLine(fixture)} · ${fixture.verdict}`,
		}));
		this.list = new SelectList(items, items.length, getSelectListTheme(), { overflowSearch: false });
		this.list.onSelect = (item) => {
			const fixture = this.report.fixtures.find((f) => f.name === item.value);
			if (fixture) this.openDetail(fixture);
		};
		this.list.onCancel = () => this.finish(false);
	}

	private openDetail(fixture: FixtureResult): void {
		this.detail = fixture;
		this.lastDetailWidth = null; // force the pane rebuild on next render
	}

	private finish(result: boolean | undefined): void {
		if (this.doneCalled) return;
		this.doneCalled = true;
		this.done(result);
	}

	handleInput(data: string): void {
		// Honor remapped interrupt keys.
		if (this.keybindings.matches(data, "app.interrupt")) {
			this.finish(false);
			return;
		}
		// Normalize raw PTY CR, same belt-and-braces as interview/preview; the
		// literal-key fallbacks keep enter/esc working under remapped bindings.
		const key = data === "\r" ? "\n" : data;
		if (this.detail !== null) {
			// Esc from the detail returns to the list; only the list closes.
			if (key === "\n" || this.keybindings.matches(key, "tui.select.confirm")) {
				this.detail = null;
				return;
			}
			if (key === "\x1b" || key === "\x03" || this.keybindings.matches(key, "tui.select.cancel")) {
				this.detail = null;
				return;
			}
			this.scrollView.handleScrollKey(key);
			return;
		}
		this.list.handleInput(key);
	}

	render(width: number): readonly string[] {
		const safeWidth = Math.max(1, width);
		if (this.detail !== null) {
			const fixture = this.detail;
			if (this.lastDetailWidth !== safeWidth) {
				this.lastDetailWidth = safeWidth;
				const rows: string[] = [];
				for (const advise of fixture.advises) {
					rows.push(...wrapTextWithAnsi(replaceTabs(`- [${advise.severity}] (${advise.slug}) ${advise.note}`), safeWidth));
				}
				const keywords = fixture.keywords.join(", ") || "—";
				const hits = fixture.hits.join(", ") || "—";
				rows.push(...wrapTextWithAnsi(replaceTabs(`keywords: ${keywords} · hits: ${hits}`), safeWidth));
				rows.push(
					...wrapTextWithAnsi(
						replaceTabs(`cost $${fixture.costUsd.toFixed(4)} · model ${fixture.models.join(", ") || "—"}`),
						safeWidth,
					),
				);
				this.scrollView.setLines(rows);
			}
			const header = truncateToWidth(`${fixture.name} · enter back · esc close`, safeWidth);
			return [header, ...this.scrollView.render(safeWidth)];
		}
		const header = truncateToWidth("oma precision report · enter detail · esc close", safeWidth);
		const footer = truncateToWidth(
			`advisors $${this.report.totalCostUsd.toFixed(4)} · keep ${this.report.totals.keep} · retune ${this.report.totals.retune} · drop ${this.report.totals.drop}`,
			safeWidth,
		);
		return [header, ...this.list.render(safeWidth), footer];
	}

	invalidate(): void {
		this.list.invalidate?.();
		this.scrollView.invalidate();
	}

	dispose(): void {}
}
