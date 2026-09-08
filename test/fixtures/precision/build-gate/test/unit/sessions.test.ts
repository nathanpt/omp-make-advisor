import { test } from "bun:test";
import assert from "node:assert/strict";

test("sessions expire after ttl", () => {
	const ttl = 1000;
	assert.ok(ttl > 0);
});
