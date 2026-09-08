// HTTP retry entry point: runs on a different async task than the main
// ingest loop, mutating the same shared index.
import { batchIndex, recordBatch } from "./loop.js";

export function replayPending(pending: Array<[string, number]>): void {
	for (const [id, size] of pending) {
		recordBatch(id, size);
	}
}

export function indexSnapshot(): ReadonlyMap<string, number> {
	return batchIndex;
}
