import { Box, Text, truncateToWidth, visibleWidth } from "@oh-my-pi/pi-tui";
import type { Component } from "@oh-my-pi/pi-tui";

// Shared chrome for oma overlays (f-011/f-012): rounded frames and the
// split-pane dashboard layout, in the OMP-native style (welcome screen /
// skill-card look). FrameTheme is a structural slice of OMP's Theme —
// production passes the real uiTheme from the ctx.ui.custom factory; hosts
// and the gallery fall back to PLAIN_FRAME_THEME (same glyphs, no color), so
// tests stay ANSI-light and deterministic.

export type FrameColor = "borderMuted" | "borderAccent" | "dim" | "success" | "warning" | "error";

export interface FrameTheme {
	boxRound: {
		topLeft: string;
		topRight: string;
		bottomLeft: string;
		bottomRight: string;
		horizontal: string;
		vertical: string;
		/** Rounded boxes reuse the sharp tee glyphs for junctions (theme-class). */
		teeUp: string;
		teeDown: string;
		teeLeft: string;
		teeRight: string;
	};
	boxDotted?: {
		horizontal: string;
	};
	fg(color: FrameColor, text: string): string;
}

export const PLAIN_FRAME_THEME: FrameTheme = {
	boxRound: {
		topLeft: "╭",
		topRight: "╮",
		bottomLeft: "╰",
		bottomRight: "╯",
		horizontal: "─",
		vertical: "│",
		teeUp: "┴",
		teeDown: "┬",
		teeLeft: "┤",
		teeRight: "├",
	},
	boxDotted: { horizontal: "┄" },
	fg: (_color, text) => text,
};

/** Rounded Box frame with a title row and dim footer lines inside. */
export function frame(
	theme: FrameTheme,
	parts: { title: string; body: Component; footer?: readonly string[] },
): Box {
	const box = new Box(1, 0);
	box.setBorder({ chars: theme.boxRound, color: (s) => theme.fg("borderMuted", s) });
	const title = new Text(parts.title, 0, 0);
	title.setStyleFn((s) => theme.fg("borderAccent", s));
	box.addChild(title);
	box.addChild(parts.body);
	for (const line of parts.footer ?? []) {
		const footerLine = new Text(line, 0, 0);
		footerLine.setStyleFn((s) => theme.fg("dim", s));
		box.addChild(footerLine);
	}
	return box;
}

const padTo = (text: string, width: number): string => text + " ".repeat(Math.max(0, width - visibleWidth(text)));

// Two-pane layout (ADR-fenced: chrome only — the left column is whatever
// interactive component the caller renders, typically a SelectList):
//
// ╭─ title ─────────┬──────────────╮
// │ left rows       │ right rows   │
// ├─────────────────┴──────────────┤
// │ footerLeft          footerRight│
// ╰────────────────────────────────╯
//
// Both line arrays must already be wrapped to their column widths; rows are
// truncated, never overflowed.
export function splitPane(
	theme: FrameTheme,
	width: number,
	leftLines: readonly string[],
	rightLines: readonly string[],
	spec: { title: string; footerLeft: string; footerRight?: string },
): string[] {
	const safe = Math.max(24, width);
	const leftW = Math.min(28, Math.max(16, Math.floor(safe * 0.42)));
	const rightW = safe - leftW - 3;
	const border = (s: string): string => theme.fg("borderMuted", s);
	const v = border(theme.boxRound.vertical);
	const h = border(theme.boxRound.horizontal);
	const dotted = theme.boxDotted?.horizontal ?? "┄";

	const titleShown = truncateToWidth(` ${spec.title} `, Math.max(1, leftW - 2));
	const top =
		border(theme.boxRound.topLeft + h) +
		theme.fg("borderAccent", titleShown) +
		border(h.repeat(Math.max(0, leftW - 1 - visibleWidth(titleShown))) + theme.boxRound.teeDown + h.repeat(rightW) + theme.boxRound.topRight);
	const rule =
		border(theme.boxRound.teeRight + h.repeat(leftW) + theme.boxRound.teeUp + h.repeat(rightW) + theme.boxRound.teeLeft);
	const bottom = border(theme.boxRound.bottomLeft + h.repeat(safe - 2) + theme.boxRound.bottomRight);

	const rowCount = Math.max(leftLines.length, rightLines.length);
	const rows: string[] = [];
	for (let i = 0; i < rowCount; i++) {
		const left = truncateToWidth(leftLines[i] ?? "", leftW);
		const right = truncateToWidth(rightLines[i] ?? "", rightW);
		rows.push(`${v}${padTo(left, leftW)}${v}${padTo(right, rightW)}${v}`);
	}

	const inner = safe - 2;
	const footerRight = spec.footerRight ?? "";
	const footerLeftShown = truncateToWidth(spec.footerLeft, Math.max(1, inner - visibleWidth(footerRight)));
	const footer = `${v}${theme.fg("dim", padTo(footerLeftShown, inner - visibleWidth(footerRight)) + footerRight)}${v}`;

	return [top, ...rows, rule, footer, bottom];
}

/** Dotted separator row (boxDotted.horizontal), inner columns wide. */
export function dottedRule(theme: FrameTheme, width: number): string {
	return theme.fg("dim", (theme.boxDotted?.horizontal ?? "┄").repeat(Math.max(1, width)));
}
