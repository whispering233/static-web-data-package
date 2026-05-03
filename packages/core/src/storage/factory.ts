import type { CollectionDefinition } from "../schema.js";
import { createCsvStorageAdapter } from "./csv.js";
import { createJsonStorageAdapter } from "./json.js";
import { createSqliteStorageAdapter } from "./sqlite.js";
import type { StorageAdapter, StorageAdapterOptions } from "./types.js";

export function createStorageAdapter(
  collectionName: string,
  collection: CollectionDefinition,
  options: StorageAdapterOptions = {}
): StorageAdapter {
  const cwd = options.cwd ?? process.cwd();

  switch (collection.storage.type) {
    case "json":
      return createJsonStorageAdapter({ collectionName, collection, cwd });
    case "csv":
      return createCsvStorageAdapter({ collectionName, collection, cwd });
    case "sqlite":
      return createSqliteStorageAdapter({ collectionName, collection, cwd });
    default:
      throw new Error(`Unsupported storage type "${(collection.storage as { type: string }).type}".`);
  }
}
