# conc-map

Ingest dedup service. The shared `batchIndex` map is written by both the
main ingest loop and the HTTP retry path (`src/ingest/caller.ts`). A
single-writer lock exists in `src/ingest/lock.ts`, but the hot path in
`loop.ts` bypasses it to stay fast, so concurrent writers can interleave
check-then-act updates and lose batch counts.
