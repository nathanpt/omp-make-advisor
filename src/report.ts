import { Box, ScrollView, SelectList, replaceTabs, wrapTextWithAnsi } from "@oh-my-pi/pi-tui";
import type { Component } from "@oh-my-pi/pi-tui";
import { dottedRule, PLAIN_FRAME_THEME, frame, type FrameTheme } from "./frame.js";
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
				this.scrollView.setLines(this.buildDetailRows(fixture, innerWidth));
			}
			return this.detailFrame.render(safeWidth);
		}
		return this.listFrame.render(safeWidth);
	}

	// Detail i — aligned facts: severity badge over the note, dotted rule,
	// then a dim label column with the values (model right-aligned).
	private buildDetailRows(fixture: FixtureResult, innerWidth: number): string[] {
		const rows: string[] = [];
		const tone = (severity: string): "error" | "warning" | "dim" =>
			severity === "blocker" ? "error" : severity === "concern" ? "warning" : "dim";
		for (const advise of fixture.advises) {
			rows.push(
				this.theme.fg(tone(advise.severity), `● ${advise.severity.toUpperCase()}`) +
					this.theme.fg("dim", ` · ${advise.slug}`),
			);
			for (const line of wrapTextWithAnsi(replaceTabs(advise.note), innerWidth)) rows.push(line);
			rows.push("");
		}
		if (fixture.advises.length > 0) rows.push(dottedRule(this.theme, innerWidth));
		const fact = (label: string, value: string, color?: "success" | "dim"): string =>
			this.theme.fg("dim", `${label} `.padEnd(11)) + (color ? this.theme.fg(color, value) : value);
		rows.push(fact("keywords", fixture.keywords.join(", ") || "—", fixture.keywords.length > 0 ? undefined : "dim"));
		rows.push(fact("hits", fixture.hits.join(", ") || "—", fixture.hits.length > 0 ? "success" : "dim"));
		const costValue = `$${fixture.costUsd.toFixed(4)}`;
		const model = fixture.models.join(", ");
		const modelFill = Math.max(1, innerWidth - 11 - costValue.length - model.length);
		rows.push(this.theme.fg("dim", "cost".padEnd(11)) + costValue + " ".repeat(modelFill) + this.theme.fg("dim", model));
		return rows;
	}

	invalidate(): void {
		this.list.invalidate?.();
		this.scrollView.invalidate();
		this.listFrame.invalidate();
		this.detailFrame?.invalidate();
	}

	dispose(): void {}
}
