import { test } from "bun:test";
import assert from "node:assert/strict";
import { spawnHost, type Event, type SpawnedHost } from "./spawn.js";

interface FrameEvent extends Event {
	lines: string[];
}

interface Decision {
	id: string;
	title: string;
	status: "keep" | "drop";
}

interface Result {
	decisions: Decision[];
	added: unknown[];
}

// Frames carry theme ANSI (progress-bar accent, list cursor); strip SGR so
// assertions read the text the user sees.
const plain = (line: string): string => line.replace(/\x1b\[[0-9;]*m/g, "");

const framesOf = (events: readonly unknown[]): FrameEvent[] =>
	events.filter((e) => (e as Event).type === "frame") as FrameEvent[];

function frameWith(events: readonly unknown[], substring: string): FrameEvent {
	const frame = framesOf(events).find((f) => f.lines.some((line) => plain(line).includes(substring)));
	assert.ok(
		frame,
		`no frame contains "${substring}"\n${framesOf(events).map((f) => f.lines.map(plain).join("\n")).join("\n---\n")}`,
	);
	return frame;
}

// The host's symbol preset renders the cursor as ASCII "> "; the cursor row
// is the choice row starting with that glyph.
const cursorOn = (frame: FrameEvent, word: string): boolean =>
	frame.lines.some((line) => plain(line).startsWith("> ") && new RegExp(`\\b${word}\\b`).test(plain(line)));

/** Wait for a decision screen rendered strictly after frame index `after`. */
const decisionScreenAfter = (events: readonly unknown[], after: number): FrameEvent | undefined =>
	framesOf(events)
		.slice(after + 1)
		.find((f) => f.lines.some((line) => /^Consideration \d+\/\d+ /.test(plain(line))));

/** Index of the first frame strictly after `after` matching, or -1. */
const frameIndexAfter = (
	events: readonly unknown[],
	after: number,
	match: (f: FrameEvent) => boolean,
): number => {
	const offset = framesOf(events)
		.slice(after + 1)
		.findIndex(match);
	return offset === -1 ? -1 : after + 1 + offset;
};

// Menu revisits (after a custom add or an esc abort) put the cursor on rows
// whose cursor-frames already exist earlier in the stream; post-revisit
// navigation must anchor its waits strictly after the revisit frame.
const stepDown = async (host: SpawnedHost, base: number, word: string): Promise<number> => {
	host.write("\x1b[B");
	const events = await host.waitUntil((es) => frameIndexAfter(es, base, (f) => cursorOn(f, word)) !== -1);
	return frameIndexAfter(events, base, (f) => cursorOn(f, word));
};

/** Open the host (first frame = the menu) and Enter the preselected "walk each" row. */
const startWalk = async (host: SpawnedHost): Promise<readonly unknown[]> => {
	const events = await host.waitUntil((es) => es.some((e) => (e as Event).type === "frame"));
	host.write("\r");
	return host.waitUntil((es) =>
		framesOf(es).some((f) => f.lines.some((line) => /^Consideration 1\/3 /.test(plain(line)))),
	);
};

test("menu opens first, walkthrough reaches one consideration per screen", async () => {
	const host = spawnHost("interview-host.ts");
	try {
		const events = await host.waitUntil((es) => es.some((e) => (e as Event).type === "frame"));
		const size = events.find((e) => e.type === "size");
		assert.equal(size?.cols, 60, `expected 60 columns, got ${JSON.stringify(size)}`);

		// First frame is the menu: header counts from the brief statuses,
		// cursor preselected on row 0.
		const menu = frameWith(events, "Considerations · kept 2 · dropped 1 · esc cancel");
		assert.ok(
			menu.lines.some((line) => plain(line).startsWith("> walk each")),
			`menu must open with the cursor on walk each\n${menu.lines.map(plain).join("\n")}`,
		);

		host.write("\r");
		const first = await host.waitUntil((es) =>
			framesOf(es).some((f) => f.lines.some((line) => /^Consideration 1\/3 /.test(plain(line)))),
		);
		for (const expected of [
			"Consideration 1/3 ▮▯▯ · enter select · esc cancel",
			"Any write to the shared ingest map must hold the ingest lock",
			"why: unlocked writers have corrupted the map twice",
			"Evidence: src/ingest/loop.ts:41-58",
			"41 │ const m = new Map()",
			"42 │ if (!held) m.set(k, v)",
			"… +14 more lines",
		]) {
			assert.ok(
				framesOf(first).some((f) => f.lines.some((line) => plain(line).trimEnd() === expected)),
				`first screen missing line "${expected}"\n${framesOf(first).map((f) => f.lines.map(plain).join("\n"))}`,
			);
		}
		const firstFrame = frameWith(first, "Consideration 1/3");
		assert.ok(cursorOn(firstFrame, "keep"), `cursor must rest on keep\n${firstFrame.lines.map(plain).join("\n")}`);

		// Pace each keystroke on observable frame progression: batching all
		// inputs at once lets the host coalesce renders past dispose.
		host.write("\r");
		let current = await host.waitUntil((es) =>
			framesOf(es).some((f) => f.lines.some((line) => plain(line).includes("Consideration 2/3"))),
		);
		frameWith(current, "2/3 ▮▮▯");
		frameWith(current, "Never swallow or soften auth errors");

		host.write("\r");
		current = await host.waitUntil((es) =>
			framesOf(es).some((f) => f.lines.some((line) => plain(line).includes("Consideration 3/3"))),
		);
		const dirScreen = frameWith(current, "Evidence: db/migrations/");
		assert.ok(
			!dirScreen.lines.some((line) => plain(line).includes(" │ ")),
			`directory evidence must not render source lines\n${dirScreen.lines.map(plain).join("\n")}`,
		);
		// t3's brief status is drop: the cursor preselects the drop row.
		assert.ok(cursorOn(dirScreen, "drop"), `drop status must preselect the drop row\n${dirScreen.lines.map(plain).join("\n")}`);

		host.write("\r");
		await host.waitUntil((es) => es.some((e) => (e as Event).type === "done"));
		assert.equal(await host.exited, 0);
		const finalEvents = host.readAll() as Event[];
		const done = finalEvents.find((e) => e.type === "done") as { result: Result | null };
		assert.deepEqual(done.result?.decisions, [
			{ id: "t1", title: "Any write to the shared ingest map must hold the ingest lock", status: "keep" },
			{ id: "t2", title: "Never swallow or soften auth errors in session refresh paths", status: "keep" },
			{ id: "t3", title: "Any migration must update db/schema.sql in the same change", status: "drop" },
		]);
		assert.deepEqual(done.result?.added, []);
		assert.equal(finalEvents.filter((e) => e.type === "done").length, 1, "done must fire exactly once");
		const disposedAt = finalEvents.findIndex((e) => e.type === "disposed");
		assert.ok(disposedAt >= 0, "disposed event missing");
		assert.equal(finalEvents.filter((e) => e.type === "disposed").length, 1, "disposed must fire exactly once");
		assert.ok(
			!finalEvents.slice(disposedAt + 1).some((e) => e.type === "frame"),
			"no frame may be emitted after disposed",
		);
	} finally {
		host.cleanup();
	}
});

test("drop choice records a dropped decision", async () => {
	const host = spawnHost("interview-host.ts");
	try {
		await startWalk(host);
		host.write("\x1b[B"); // keep → edit
		await host.waitUntil((es) => framesOf(es).some((f) => cursorOn(f, "edit")));
		host.write("\x1b[B"); // edit → drop
		await host.waitUntil((es) => framesOf(es).some((f) => cursorOn(f, "drop")));
		host.write("\r");
		for (const marker of ["Consideration 2/3", "Consideration 3/3"]) {
			await host.waitUntil((es) =>
				framesOf(es).some((f) => f.lines.some((line) => plain(line).includes(marker))),
			);
			host.write("\r");
		}
		await host.waitUntil((es) => es.some((e) => (e as Event).type === "done"));
		assert.equal(await host.exited, 0);
		const done = host.readAll().find((e) => e.type === "done") as { result: Result | null };
		assert.equal(done.result?.decisions[0].status, "drop");
		assert.equal(done.result?.decisions.filter((d) => d.status === "keep").length, 1);
	} finally {
		host.cleanup();
	}
});

test("cancel flow", async () => {
	const host = spawnHost("interview-host.ts");
	try {
		await host.waitUntil((es) => es.some((e) => (e as Event).type === "frame"));
		host.write("\x1b");
		await host.waitUntil((es) => es.some((e) => (e as Event).type === "done"));
		assert.equal(await host.exited, 0);
		const finalEvents = host.readAll() as Event[];
		const done = finalEvents.find((e) => e.type === "done") as { result: unknown };
		assert.equal(done.result, null);
		assert.equal(finalEvents.filter((e) => e.type === "done").length, 1, "done must fire exactly once");
		assert.equal(finalEvents.filter((e) => e.type === "disposed").length, 1, "disposed must fire exactly once");
	} finally {
		host.cleanup();
	}
});

test("preload: drop status preselects the drop row", async () => {
	const host = spawnHost("interview-host.ts", [JSON.stringify({ dropIds: ["t1"] })]);
	try {
		await startWalk(host);
		const events = host.readAll();
		const first = frameWith(events, "Consideration 1/3");
		assert.ok(cursorOn(first, "drop"), `preloaded drop must rest the cursor on drop\n${first.lines.map(plain).join("\n")}`);
		// Enter confirms the preselected row; finish the walk trap by trap.
		for (const marker of ["Consideration 2/3", "Consideration 3/3"]) {
			host.write("\r");
			await host.waitUntil((es) =>
				framesOf(es).some((f) => f.lines.some((line) => plain(line).includes(marker))),
			);
		}
		host.write("\r");
		await host.waitUntil((es) => es.some((e) => (e as Event).type === "done"));
		const done = host.readAll().find((e) => e.type === "done") as { result: Result | null };
		assert.equal(done.result?.decisions[0].status, "drop");
	} finally {
		host.cleanup();
	}
});

test("edit flow: rewording round-trips into the decision", async () => {
	const host = spawnHost("interview-host.ts");
	try {
		await startWalk(host);
		host.write("\x1b[B"); // keep → edit
		await host.waitUntil((es) => framesOf(es).some((f) => cursorOn(f, "edit")));
		host.write("\r");
		await host.waitUntil((es) =>
			framesOf(es).some((f) =>
				f.lines.some((line) => plain(line).includes("Edit consideration 1/3 · enter save · esc revert")),
			),
		);
		// The input is seeded with the current rule text (it scrolls, one line).
		await host.waitUntil((es) =>
			framesOf(es).some((f) => f.lines.some((line) => plain(line).includes("must hold the ingest lock"))),
		);
		host.write(" v2");
		// The input line scrolls horizontally; the appended text stays on it.
		const typed = await host.waitUntil((es) =>
			framesOf(es).some((f) => f.lines.some((line) => plain(line).includes("lock v2"))),
		);
		const typedIdx = framesOf(typed).findIndex((f) => f.lines.some((line) => plain(line).includes("lock v2")));
		host.write("\r"); // save
		// Back on the decision screen; the 60-col render wraps "v2" onto its
		// own line under the reworded title.
		await host.waitUntil((es) => {
			const screen = decisionScreenAfter(es, typedIdx);
			return (
				screen !== undefined &&
				screen.lines.some((line) => plain(line).trimEnd() === "v2")
			);
		});
		for (const marker of ["Consideration 2/3", "Consideration 3/3"]) {
			host.write("\r");
			await host.waitUntil((es) =>
				framesOf(es).some((f) => f.lines.some((line) => plain(line).includes(marker))),
			);
		}
		host.write("\r");
		await host.waitUntil((es) => es.some((e) => (e as Event).type === "done"));
		const done = host.readAll().find((e) => e.type === "done") as { result: Result | null };
		assert.equal(done.result?.decisions[0].title, "Any write to the shared ingest map must hold the ingest lock v2");
		assert.equal(done.result?.decisions[0].status, "keep");
	} finally {
		host.cleanup();
	}
});

test("edit esc reverts the rewording", async () => {
	const host = spawnHost("interview-host.ts");
	try {
		await startWalk(host);
		host.write("\x1b[B");
		await host.waitUntil((es) => framesOf(es).some((f) => cursorOn(f, "edit")));
		host.write("\r");
		await host.waitUntil((es) =>
			framesOf(es).some((f) => f.lines.some((line) => plain(line).includes("Edit consideration 1/3"))),
		);
		host.write(" XXX");
		// The input line is one scrolling row; the typed suffix stays on it.
		const typed = await host.waitUntil((es) =>
			framesOf(es).some((f) => f.lines.some((line) => plain(line).includes("XXX"))),
		);
		const typedIdx = framesOf(typed).findIndex((f) => f.lines.some((line) => plain(line).includes("XXX")));
		host.write("\x1b"); // revert
		await host.waitUntil((es) => {
			const screen = decisionScreenAfter(es, typedIdx);
			return screen !== undefined && !screen.lines.some((line) => plain(line).includes("XXX"));
		});
		for (const marker of ["Consideration 2/3", "Consideration 3/3"]) {
			host.write("\r");
			await host.waitUntil((es) =>
				framesOf(es).some((f) => f.lines.some((line) => plain(line).includes(marker))),
			);
		}
		host.write("\r");
		await host.waitUntil((es) => es.some((e) => (e as Event).type === "done"));
		const done = host.readAll().find((e) => e.type === "done") as { result: Result | null };
		assert.equal(done.result?.decisions[0].title, "Any write to the shared ingest map must hold the ingest lock");
	} finally {
		host.cleanup();
	}
});

test("edit: empty submit is ignored, edit stays live", async () => {
	const host = spawnHost("interview-host.ts");
	try {
		await startWalk(host);
		host.write("\x1b[B");
		await host.waitUntil((es) => framesOf(es).some((f) => cursorOn(f, "edit")));
		host.write("\r");
		await host.waitUntil((es) =>
			framesOf(es).some((f) => f.lines.some((line) => plain(line).includes("Edit consideration 1/3"))),
		);
		// Ctrl+U clears the seeded title in one keystroke, then try to save nothing.
		host.write("\x15");
		host.write("\r");
		// If the empty submit were honored (or exited the screen), a later
		// keystroke would land on the SelectList instead of the live input.
		host.write("Z");
		const probed = await host.waitUntil((es) =>
			framesOf(es).some((f) => f.lines.some((line) => plain(line).includes("> Z"))),
		);
		const probeIdx = framesOf(probed).findIndex((f) => f.lines.some((line) => plain(line).includes("> Z")));
		host.write("\x1b"); // revert; the recorded title is still the original
		await host.waitUntil((es) => decisionScreenAfter(es, probeIdx) !== undefined);
		for (const marker of ["Consideration 2/3", "Consideration 3/3"]) {
			host.write("\r");
			await host.waitUntil((es) =>
				framesOf(es).some((f) => f.lines.some((line) => plain(line).includes(marker))),
			);
		}
		host.write("\r");
		await host.waitUntil((es) => es.some((e) => (e as Event).type === "done"));
		const done = host.readAll().find((e) => e.type === "done") as { result: Result | null };
		assert.equal(done.result?.decisions[0].title, "Any write to the shared ingest map must hold the ingest lock");
	} finally {
		host.cleanup();
	}
});

test("keep all: bulk verdict lands in every decision via save & exit", async () => {
	const host = spawnHost("interview-host.ts");
	try {
		await host.waitUntil((es) => es.some((e) => (e as Event).type === "frame"));
		host.write("\x1b[B"); // walk each → keep all
		await host.waitUntil((es) => framesOf(es).some((f) => cursorOn(f, "keep all")));
		host.write("\r");
		// The header re-reads the effective state: every original now kept.
		await host.waitUntil((es) =>
			framesOf(es).some((f) =>
				f.lines.some((line) => plain(line).includes("Considerations · kept 3 · dropped 0 · esc cancel")),
			),
		);
		// Down the menu to save & exit and commit — no walk happened, so the
		// cursor frames below are first occurrences (unambiguous anchors).
		host.write("\x1b[B");
		await host.waitUntil((es) => framesOf(es).some((f) => cursorOn(f, "drop all")));
		host.write("\x1b[B");
		await host.waitUntil((es) => framesOf(es).some((f) => cursorOn(f, "add custom")));
		host.write("\x1b[B");
		await host.waitUntil((es) => framesOf(es).some((f) => cursorOn(f, "save & exit")));
		host.write("\r");
		await host.waitUntil((es) => es.some((e) => (e as Event).type === "done"));
		assert.equal(await host.exited, 0);
		const finalEvents = host.readAll() as Event[];
		const done = finalEvents.find((e) => e.type === "done") as { result: Result | null };
		assert.deepEqual(
			done.result?.decisions.map((d) => [d.id, d.status]),
			[
				["t1", "keep"],
				["t2", "keep"],
				["t3", "keep"],
			],
		);
		assert.deepEqual(done.result?.added, []);
		assert.equal(finalEvents.filter((e) => e.type === "done").length, 1, "done must fire exactly once");
		assert.equal(finalEvents.filter((e) => e.type === "disposed").length, 1, "disposed must fire exactly once");
	} finally {
		host.cleanup();
	}
});

test("drop all: bulk verdict lands in every decision via save & exit", async () => {
	const host = spawnHost("interview-host.ts");
	try {
		await host.waitUntil((es) => es.some((e) => (e as Event).type === "frame"));
		host.write("\x1b[B");
		await host.waitUntil((es) => framesOf(es).some((f) => cursorOn(f, "keep all")));
		host.write("\x1b[B");
		await host.waitUntil((es) => framesOf(es).some((f) => cursorOn(f, "drop all")));
		host.write("\r");
		await host.waitUntil((es) =>
			framesOf(es).some((f) =>
				f.lines.some((line) => plain(line).includes("Considerations · kept 0 · dropped 3 · esc cancel")),
			),
		);
		host.write("\x1b[B");
		await host.waitUntil((es) => framesOf(es).some((f) => cursorOn(f, "add custom")));
		host.write("\x1b[B");
		await host.waitUntil((es) => framesOf(es).some((f) => cursorOn(f, "save & exit")));
		host.write("\r");
		await host.waitUntil((es) => es.some((e) => (e as Event).type === "done"));
		assert.equal(await host.exited, 0);
		const done = host.readAll().find((e) => e.type === "done") as { result: Result | null };
		assert.deepEqual(
			done.result?.decisions.map((d) => [d.id, d.status]),
			[
				["t1", "drop"],
				["t2", "drop"],
				["t3", "drop"],
			],
		);
		assert.deepEqual(done.result?.added, []);
	} finally {
		host.cleanup();
	}
});

test("add custom: title plus skipped optional screens append a kept custom", async () => {
	const host = spawnHost("interview-host.ts");
	try {
		await host.waitUntil((es) => es.some((e) => (e as Event).type === "frame"));
		host.write("\x1b[B");
		await host.waitUntil((es) => framesOf(es).some((f) => cursorOn(f, "keep all")));
		host.write("\x1b[B");
		await host.waitUntil((es) => framesOf(es).some((f) => cursorOn(f, "drop all")));
		host.write("\x1b[B");
		await host.waitUntil((es) => framesOf(es).some((f) => cursorOn(f, "add custom")));
		host.write("\r");
		await host.waitUntil((es) =>
			framesOf(es).some((f) =>
				f.lines.some((line) => plain(line).includes("Custom consideration · title (required)")),
			),
		);
		// Field semantics render as helper text under the header.
		assert.ok(
			framesOf(host.readAll()).some((f) => f.lines.some((line) => plain(line).includes("The complete rule"))),
			"the title screen must explain that the field carries the whole rule",
		);
		host.write("Keep functions under 30 lines");
		await host.waitUntil((es) =>
			framesOf(es).some((f) => f.lines.some((line) => plain(line).includes("Keep functions under 30 lines"))),
		);
		host.write("\r"); // title saves; evidence screen opens
		await host.waitUntil((es) =>
			framesOf(es).some((f) => f.lines.some((line) => plain(line).includes("evidence path (optional)"))),
		);
		assert.ok(
			framesOf(host.readAll()).some((f) => f.lines.some((line) => plain(line).includes("Optional source anchor"))),
			"the evidence screen must explain the anchor forms",
		);
		host.write("\r"); // empty evidence saves ""; rationale screen opens
		await host.waitUntil((es) =>
			framesOf(es).some((f) => f.lines.some((line) => plain(line).includes("rationale (optional)"))),
		);
		assert.ok(
			framesOf(host.readAll()).some((f) => f.lines.some((line) => plain(line).includes("Optional why it matters"))),
			"the rationale screen must explain what the why field is for",
		);
		host.write("\r"); // empty rationale commits; back to the menu
		// "(1 added)" first appears only on the restored menu — anchor for the
		// post-revisit navigation (cursor frames for the rows already exist).
		const restored = await host.waitUntil((es) =>
			framesOf(es).some((f) => f.lines.some((line) => plain(line).includes("add custom (1 added)"))),
		);
		const base = framesOf(restored).findIndex((f) =>
			f.lines.some((line) => plain(line).includes("add custom (1 added)")),
		);
		assert.ok(
			framesOf(restored)[base].lines.some((line) => plain(line).includes("Considerations · kept 2 · dropped 1")),
			"the restored menu must re-render the header counts",
		);
		assert.ok(
			framesOf(restored)[base].lines.some((line) => plain(line).includes("remove custom")),
			"the first added custom must surface the remove row",
		);
		let at = await stepDown(host, base, "keep all");
		at = await stepDown(host, at, "drop all");
		at = await stepDown(host, at, "add custom");
		at = await stepDown(host, at, "remove custom");
		at = await stepDown(host, at, "save & exit");
		host.write("\r");
		await host.waitUntil((es) => es.some((e) => (e as Event).type === "done"));
		assert.equal(await host.exited, 0);
		const done = host.readAll().find((e) => e.type === "done") as { result: Result | null };
		assert.deepEqual(done.result?.added, [
			{ id: "custom-1", title: "Keep functions under 30 lines", evidence: "", rationale: "", status: "keep" },
		]);
		// No bulk, no walk: the identity fallback preserves the brief statuses.
		assert.deepEqual(done.result?.decisions, [
			{ id: "t1", title: "Any write to the shared ingest map must hold the ingest lock", status: "keep" },
			{ id: "t2", title: "Never swallow or soften auth errors in session refresh paths", status: "keep" },
			{ id: "t3", title: "Any migration must update db/schema.sql in the same change", status: "drop" },
		]);
	} finally {
		host.cleanup();
	}
});

test("custom esc aborts the add: menu restores, nothing added", async () => {
	const host = spawnHost("interview-host.ts");
	try {
		await host.waitUntil((es) => es.some((e) => (e as Event).type === "frame"));
		host.write("\x1b[B");
		await host.waitUntil((es) => framesOf(es).some((f) => cursorOn(f, "keep all")));
		host.write("\x1b[B");
		await host.waitUntil((es) => framesOf(es).some((f) => cursorOn(f, "drop all")));
		host.write("\x1b[B");
		await host.waitUntil((es) => framesOf(es).some((f) => cursorOn(f, "add custom")));
		host.write("\r");
		const form = await host.waitUntil((es) =>
			framesOf(es).some((f) =>
				f.lines.some((line) => plain(line).includes("Custom consideration · title (required)")),
			),
		);
		const formIdx = framesOf(form).findIndex((f) =>
			f.lines.some((line) => plain(line).includes("Custom consideration · title (required)")),
		);
		host.write("keep it simple");
		const typed = await host.waitUntil((es) =>
			frameIndexAfter(es, formIdx, (f) => f.lines.some((line) => plain(line).includes("keep it simple"))) !== -1,
		);
		const typedIdx = frameIndexAfter(typed, formIdx, (f) =>
			f.lines.some((line) => plain(line).includes("keep it simple")),
		);
		host.write("\x1b"); // abort the add
		// The menu re-renders with row 0 preselected and no "(N added)" suffix.
		const restored = await host.waitUntil((es) =>
			frameIndexAfter(es, typedIdx, (f) => cursorOn(f, "walk each")) !== -1,
		);
		const base = frameIndexAfter(restored, typedIdx, (f) => cursorOn(f, "walk each"));
		let at = await stepDown(host, base, "keep all");
		at = await stepDown(host, at, "drop all");
		at = await stepDown(host, at, "add custom");
		at = await stepDown(host, at, "save & exit");
		host.write("\r");
		await host.waitUntil((es) => es.some((e) => (e as Event).type === "done"));
		assert.equal(await host.exited, 0);
		const done = host.readAll().find((e) => e.type === "done") as { result: Result | null };
		assert.deepEqual(done.result?.added, []);
		// The partial title never reached the brief: identity fallback.
		assert.deepEqual(done.result?.decisions, [
			{ id: "t1", title: "Any write to the shared ingest map must hold the ingest lock", status: "keep" },
			{ id: "t2", title: "Never swallow or soften auth errors in session refresh paths", status: "keep" },
			{ id: "t3", title: "Any migration must update db/schema.sql in the same change", status: "drop" },
		]);
	} finally {
		host.cleanup();
	}
});

test("remove custom: manage screen deletes; esc backs out without deleting", async () => {
	const host = spawnHost("interview-host.ts");
	try {
		await host.waitUntil((es) => es.some((e) => (e as Event).type === "frame"));
		// Add one custom first: menu → add custom → title → skip optionals.
		host.write("\x1b[B");
		await host.waitUntil((es) => framesOf(es).some((f) => cursorOn(f, "keep all")));
		host.write("\x1b[B");
		await host.waitUntil((es) => framesOf(es).some((f) => cursorOn(f, "drop all")));
		host.write("\x1b[B");
		await host.waitUntil((es) => framesOf(es).some((f) => cursorOn(f, "add custom")));
		host.write("\r");
		await host.waitUntil((es) =>
			framesOf(es).some((f) =>
				f.lines.some((line) => plain(line).includes("Custom consideration · title (required)")),
			),
		);
		host.write("Keep functions under 30 lines");
		await host.waitUntil((es) =>
			framesOf(es).some((f) => f.lines.some((line) => plain(line).includes("Keep functions under 30 lines"))),
		);
		host.write("\r"); // title → evidence
		await host.waitUntil((es) =>
			framesOf(es).some((f) => f.lines.some((line) => plain(line).includes("evidence path (optional)"))),
		);
		host.write("\r"); // evidence → rationale
		await host.waitUntil((es) =>
			framesOf(es).some((f) => f.lines.some((line) => plain(line).includes("rationale (optional)"))),
		);
		host.write("\r"); // commit → restored menu
		const restored = await host.waitUntil((es) =>
			framesOf(es).some((f) => f.lines.some((line) => plain(line).includes("add custom (1 added)"))),
		);
		let base = framesOf(restored).findIndex((f) =>
			f.lines.some((line) => plain(line).includes("add custom (1 added)")),
		);

		// Down to the remove row and open the manage screen.
		base = await stepDown(host, base, "keep all");
		base = await stepDown(host, base, "drop all");
		base = await stepDown(host, base, "add custom");
		base = await stepDown(host, base, "remove custom");
		host.write("\r");
		const manage = await host.waitUntil((es) =>
			frameIndexAfter(es, base, (f) =>
				f.lines.some((line) => plain(line).includes("Remove added consideration")),
			) !== -1,
		);
		const manageIdx = frameIndexAfter(manage, base, (f) =>
			f.lines.some((line) => plain(line).includes("Remove added consideration")),
		);
		// The pick list shows the added custom by its rule text.
		assert.ok(
			framesOf(manage)[manageIdx].lines.some((line) => plain(line).includes("Keep functions under 30 lines")),
			"the manage screen must list the added custom by title",
		);

		// Esc backs out without deleting: cursor stays on the remove row.
		host.write("\x1b");
		const backed = await host.waitUntil((es) =>
			frameIndexAfter(es, manageIdx, (f) => cursorOn(f, "remove custom")) !== -1,
		);
		const backedIdx = frameIndexAfter(backed, manageIdx, (f) => cursorOn(f, "remove custom"));

		// Re-enter and delete the only row; the menu loses the suffix.
		host.write("\r");
		const manage2 = await host.waitUntil((es) =>
			frameIndexAfter(es, backedIdx, (f) =>
				f.lines.some((line) => plain(line).includes("Remove added consideration")),
			),
		);
		const manage2Idx = frameIndexAfter(manage2, backedIdx, (f) =>
			f.lines.some((line) => plain(line).includes("Remove added consideration")),
		);
		host.write("\r");
		const rebuilt = await host.waitUntil((es) =>
			frameIndexAfter(es, manage2Idx, (f) => cursorOn(f, "walk each")) !== -1,
		);
		const menuIdx = frameIndexAfter(rebuilt, manage2Idx, (f) => cursorOn(f, "walk each"));
		assert.ok(
			!framesOf(rebuilt)[menuIdx].lines.some((line) => plain(line).includes("(1 added)")),
			"the menu must drop the suffix once the custom is removed",
		);

		// Save with nothing added: identity fallback, no customs on the wire.
		let at = await stepDown(host, menuIdx, "keep all");
		at = await stepDown(host, at, "drop all");
		at = await stepDown(host, at, "add custom");
		at = await stepDown(host, at, "save & exit");
		host.write("\r");
		await host.waitUntil((es) => es.some((e) => (e as Event).type === "done"));
		assert.equal(await host.exited, 0);
		const done = host.readAll().find((e) => e.type === "done") as { result: Result | null };
		assert.deepEqual(done.result?.added, []);
		assert.deepEqual(done.result?.decisions, [
			{ id: "t1", title: "Any write to the shared ingest map must hold the ingest lock", status: "keep" },
			{ id: "t2", title: "Never swallow or soften auth errors in session refresh paths", status: "keep" },
			{ id: "t3", title: "Any migration must update db/schema.sql in the same change", status: "drop" },
		]);
	} finally {
		host.cleanup();
	}
});
