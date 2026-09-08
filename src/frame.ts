import { Box, Text } from "@oh-my-pi/pi-tui";
import type { Component } from "@oh-my-pi/pi-tui";

// Shared chrome for oma overlays (f-011): a rounded Box frame in the
// OMP-native style (welcome screen / skill-card look), with a title row and
// dim footer hints inside. The theme is a structural slice of OMP's Theme —
// production passes the real uiTheme from the ctx.ui.custom factory; hosts
// and the gallery fall back to PLAIN_FRAME_THEME (same glyphs, no color), so
// tests stay ANSI-light and deterministic.

export interface FrameTheme {
	boxRound: {
		topLeft: string;
		topRight: string;
		bottomLeft: string;
		bottomRight: string;
		horizontal: string;
		vertical: string;
	};
	fg(color: "borderMuted" | "borderAccent" | "dim", text: string): string;
}

export const PLAIN_FRAME_THEME: FrameTheme = {
	boxRound: {
		topLeft: "╭",
		topRight: "╮",
		bottomLeft: "╰",
		bottomRight: "╯",
		horizontal: "─",
		vertical: "│",
	},
	fg: (_color, text) => text,
};

// Renders `parts` as: ╭──────────╮ / │ title      │ / │ body…      │ /
// │ footer     │ / ╰──────────╯. Body stays an interactive Component
// (SelectList / ScrollView) — the frame is chrome only, never nav.
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
