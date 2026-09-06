import { test } from "bun:test";
import assert from "node:assert/strict";
// Static namespace import: the assertion targets the module's export shape itself.
// Runs under bun (in `npm test`) because the extension graph imports @oh-my-pi/pi-tui,
// whose sources use bun: protocols that node's loader rejects.
import * as extensionModule from "../index.ts";

test("extension module exports a factory function", () => {
	assert.equal(typeof extensionModule.default, "function");
});
