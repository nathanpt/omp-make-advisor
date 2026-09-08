import type { Keybinding } from "@oh-my-pi/pi-tui";

// Structural seam: the production mount passes omp's KeybindingsManager; the
// PTY hosts pass a stub so app.interrupt stays a production-only concern.
// Shared by every oma overlay — one seam, not one per component.
export interface KeybindingsLike {
	matches(data: string, action: Keybinding): boolean;
}
