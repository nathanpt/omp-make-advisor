import type { ExtensionAPI, ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";

const commandOptions = {
	description: "Interview the project and emit its watchdogs (skeleton)",
	handler: async (_args: string, ctx: ExtensionCommandContext): Promise<void> => {
		if (!ctx.hasUI) return;
		ctx.ui.notify("omp-make-advisor: skeleton loaded — trap picker lands in slice 2 (f-002)", "info");
	},
};

export default function omaExtension(pi: ExtensionAPI): void {
	pi.setLabel("omp-make-advisor");
	pi.registerCommand("make-advisor", commandOptions);
	pi.registerCommand("oma", commandOptions);
}
