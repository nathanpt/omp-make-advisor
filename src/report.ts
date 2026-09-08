import { Box, ScrollView, SelectList, replaceTabs, wrapTextWithAnsi } from "@oh-my-pi/pi-tui";
import type { Component } from "@oh-my-pi/pi-tui";
import { PLAIN_FRAME_THEME, frame, type FrameTheme } from "./frame.js";
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
	private readonly listFrame: Box;
	private detail: FixtureResult | null = null;
	private detailFrame: Box | null = null;
	private lastDetailWidth: number | null = null;
	private doneCalled = false;

	constructor(
		private readonly report: ValidateReport,
		private readonly keybindings: KeybindingsLike,
		private readonly done: (result: boolean | undefined) => void,
		private readonly theme: FrameTheme = PLAIN_FRAME_THEME,
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
		this.listFrame = frame(this.theme, {
			title: "oma precision report",
			body: this.list,
			footer: [
				`advisors $${this.report.totalCostUsd.toFixed(4)} · keep ${this.report.totals.keep} · retune ${this.report.totals.retune} · drop ${this.report.totals.drop}`,
				"enter detail · esc close",
			],
		});
	}

	private openDetail(fixture: FixtureResult): void {
		this.detail = fixture;
		this.detailFrame = frame(this.theme, {
			title: `${fixture.name} · ${statusLine(fixture)} · ${fixture.verdict}`,
			body: this.scrollView,
			footer: ["enter back · esc close"],
		});
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
		if (this.detail !== null && this.detailFrame !== null) {
			const fixture = this.detail;
			// Frame border + padding eat 4 columns; wrap body text to the
			// scroll viewport, not the outer width.
			const innerWidth = Math.max(1, safeWidth - 4);
			if (this.lastDetailWidth !== innerWidth) {
				this.lastDetailWidth = innerWidth;
				const rows: string[] = [];
				for (const advise of fixture.advises) {
					rows.push(...wrapTextWithAnsi(replaceTabs(`- [${advise.severity}] (${advise.slug}) ${advise.note}`), innerWidth));
				}
				const keywords = fixture.keywords.join(", ") || "—";
				const hits = fixture.hits.join(", ") || "—";
				rows.push(...wrapTextWithAnsi(replaceTabs(`keywords: ${keywords} · hits: ${hits}`), innerWidth));
				rows.push(
					...wrapTextWithAnsi(
						replaceTabs(`cost $${fixture.costUsd.toFixed(4)} · model ${fixture.models.join(", ") || "—"}`),
						innerWidth,
					),
				);
				this.scrollView.setLines(rows);
			}
			return this.detailFrame.render(safeWidth);
		}
		return this.listFrame.render(safeWidth);
	}

	invalidate(): void {
		this.list.invalidate?.();
		this.scrollView.invalidate();
		this.listFrame.invalidate();
		this.detailFrame?.invalidate();
	}

	dispose(): void {}
}
