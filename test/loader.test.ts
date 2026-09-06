import test from "node:test";
import assert from "node:assert/strict";
// Static namespace import: the assertion targets the module's export shape itself.
import * as extensionModule from "../index.ts";

test("extension module exports a factory function", () => {
	assert.equal(typeof extensionModule.default, "function");
});
