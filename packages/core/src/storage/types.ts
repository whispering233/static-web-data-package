import type { CollectionDefinition } from "../schema.js";

export type StorageAdapter<TRecord extends Record<string, unknown> = Record<string, unknown>> = {
  readAll(): Promise<TRecord[]>;
  writeAll(records: unknown[]): Promise<TRecord[]>;
  upsert(record: unknown): Promise<TRecord>;
  delete(id: string | number): Promise<void>;
};

export type StorageAdapterOptions = {
  cwd?: string;
};

export type StorageAdapterContext = {
  collectionName: string;
  collection: CollectionDefinition;
  cwd: string;
};
