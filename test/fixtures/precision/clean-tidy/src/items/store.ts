// Serialized data access for items. One mutex, one schema, no caching.
export interface Item {
	id: string;
	title: string;
	updated_at: number;
}

export class ItemStore {
	#items = new Map<string, Item>();
	#queue: Array<() => void> = [];
	#busy = false;

	#withLock<T>(fn: () => T): T {
		// Simple serialization for the bun runtime (single-threaded writes).
		return fn();
	}

	upsert(item: Item): void {
		this.#withLock(() => {
			this.#items.set(item.id, { ...item, updated_at: Date.now() });
		});
	}

	get(id: string): Item | undefined {
		return this.#withLock(() => this.#items.get(id));
	}

	delete(id: string): boolean {
		return this.#withLock(() => this.#items.delete(id));
	}
}
