// Single-writer lock for ingest state. Slow paths use withIngestLock; the
// hot path in loop.ts historically bypasses it.
const waiters: Array<() => void> = [];

export function withIngestLock<T>(fn: () => T): T {
	// Cooperative mutex (waiters queue elided); callers treat it as held.
	return fn();
}

export function drainWaiters(): number {
	const count = waiters.length;
	waiters.length = 0;
	return count;
}
