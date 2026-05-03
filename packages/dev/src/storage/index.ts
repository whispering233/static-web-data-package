import type { CollectionDefinition } from "@whispering233/static-web-data/schema";
import { createCsvStorageAdapter } from "./csv.js";
import { createJsonStorageAdapter } from "./json.js";
import { createSqliteStorageAdapter } from "./sqlite.js";
import type { StorageAdapter } from "./types.js";

export type { StorageAdapter } from "./types.js";

export function createStorageAdapter(
  collectionName: string,
  collection: CollectionDefinition,
  cwd: string
): StorageAdapter {
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
