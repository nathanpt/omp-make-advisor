import type { ExtensionAPI, ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import { STATIC_CANDIDATES } from "./src/traps.js";
import { TrapPicker, type PickerResult } from "./src/picker.js";

const commandOptions = {
	description: "Interview the project and emit its watchdogs (oma)",
	handler: async (_args: string, ctx: ExtensionCommandContext): Promise<void> => {
		if (!ctx.hasUI) return;
		const result = await ctx.ui.custom<PickerResult | undefined>(
			(_tui, _theme, keybindings, done) => new TrapPicker(STATIC_CANDIDATES, keybindings, done),
			{ overlay: true },
		);
		if (!result) {
			ctx.ui.notify("oma: cancelled - nothing recorded", "info");
			return;
		}
		ctx.ui.notify(`oma: kept ${result.kept.length}, dropped ${result.dropped.length} - brief write lands with f-003`, "info");
	},
};

export default function omaExtension(pi: ExtensionAPI): void {
	pi.setLabel("omp-make-advisor");
	pi.registerCommand("make-advisor", commandOptions);
	pi.registerCommand("oma", commandOptions);
}
