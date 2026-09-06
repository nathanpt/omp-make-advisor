export interface CandidateTrap {
	id: string;
	title: string;
	evidence: string;
}

export const STATIC_CANDIDATES: readonly CandidateTrap[] = [
	{ id: "t1", title: "Concurrent map writes in ingest loop", evidence: "src/ingest/loop.ts:41-58" },
	{ id: "t2", title: "Silent catch swallows auth failures", evidence: "src/auth/session.ts:88" },
	{ id: "t3", title: "Fixture drift between schema and migrations", evidence: "db/migrations/0042_add_flags.sql" },
];
