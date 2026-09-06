import type { ExtensionAPI, ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import type { CandidateTrap } from "./src/brief.js";
import { TrapPicker, type PickerResult } from "./src/picker.js";

// Interim static fixture; /oma scan replaces it as the candidate source (f-003 step 3).
const STATIC_CANDIDATES: readonly CandidateTrap[] = [
	{ id: "t1", title: "Any write to the shared ingest map must hold the ingest lock", evidence: "src/ingest/loop.ts:41-58" },
	{ id: "t2", title: "Never swallow or soften auth errors in session refresh paths", evidence: "src/auth/session.ts:88" },
	{ id: "t3", title: "Any migration must update db/schema.sql in the same change", evidence: "db/migrations/0042_add_flags.sql" },
];

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
