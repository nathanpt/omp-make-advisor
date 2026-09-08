-- Canonical and only schema (no migrations in this repo).
CREATE TABLE items (
	id TEXT PRIMARY KEY,
	title TEXT NOT NULL,
	updated_at INTEGER NOT NULL
);
