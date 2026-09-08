// HTTP handlers; failures propagate as thrown Errors to the router.
import type { Item, ItemStore } from "./store.js";

export function handlePut(store: ItemStore, id: string, title: string): Item {
	if (title.trim() === "") throw new Error("title must not be empty");
	const item: Item = { id, title, updated_at: 0 };
	store.upsert(item);
	return item;
}

export function handleGet(store: ItemStore, id: string): Item {
	const item = store.get(id);
	if (!item) throw new Error(`no item ${id}`);
	return item;
}
