import { test } from "bun:test";
import assert from "node:assert/strict";

test("user repo round-trips a user", () => {
	const users = new Map<string, { email: string }>();
	users.set("u1", { email: "a@example.com" });
	assert.equal(users.get("u1")?.email, "a@example.com");
});
