// Shared dedup index for ingest batches. The ingest lock (./lock.ts) exists
// for writers; this hot path skips it deliberately to stay fast.
export const batchIndex = new Map<string, number>();

export function recordBatch(id: string, size: number): void {
	// Check-then-act on shared state, no lock held.
	const current = batchIndex.get(id) ?? 0;
	batchIndex.set(id, current + size);
}

export function totalIndexed(): number {
	let total = 0;
	for (const size of batchIndex.values()) total += size;
	return total;
}
