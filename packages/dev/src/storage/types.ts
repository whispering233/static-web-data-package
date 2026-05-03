import type { CollectionDefinition } from "@whispering233/static-web-data/schema";

export type StorageAdapter = {
  readAll(): Promise<Record<string, unknown>[]>;
  writeAll(records: unknown[]): Promise<Record<string, unknown>[]>;
  upsert(record: unknown): Promise<Record<string, unknown>>;
  delete(id: string | number): Promise<void>;
};

export type StorageAdapterContext = {
  collectionName: string;
  collection: CollectionDefinition;
  cwd: string;
};
