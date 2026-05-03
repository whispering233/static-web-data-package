import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  type CollectionDefinition,
  describeCollection,
  validateCollectionRecords
} from "@whispering233/static-web-data/schema";

export function resolveStoragePath(cwd: string, storagePath: string): string {
  return resolve(cwd, storagePath);
}

export async function ensureParentDir(filePath: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
}

export function validateRecords(
  collectionName: string,
  collection: CollectionDefinition,
  records: unknown[]
): Record<string, unknown>[] {
  return validateCollectionRecords(collectionName, collection, records) as Record<string, unknown>[];
}

export function getPrimaryKeyValue(collectionName: string, collection: CollectionDefinition, record: Record<string, unknown>): string {
  const value = record[collection.primaryKey];
  if (value === undefined || value === null || value === "") {
    throw new Error(`Collection "${collectionName}" record is missing primary key "${collection.primaryKey}".`);
  }
  return String(value);
}

export function upsertIntoRecords(
  collectionName: string,
  collection: CollectionDefinition,
  records: Record<string, unknown>[],
  rawRecord: unknown
): { records: Record<string, unknown>[]; record: Record<string, unknown> } {
  const [record] = validateRecords(collectionName, collection, [rawRecord]);
  if (!record) {
    throw new Error(`Collection "${collectionName}" record could not be parsed.`);
  }
  const key = getPrimaryKeyValue(collectionName, collection, record);
  const index = records.findIndex((item) => String(item[collection.primaryKey]) === key);
  const nextRecords = records.slice();
  if (index >= 0) {
    nextRecords[index] = record;
  } else {
    nextRecords.push(record);
  }
  return { records: nextRecords, record };
}

export function removeFromRecords(
  collection: CollectionDefinition,
  records: Record<string, unknown>[],
  id: string | number
): Record<string, unknown>[] {
  return records.filter((record) => !Object.is(String(record[collection.primaryKey]), String(id)));
}

export function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

export function getFieldNames(collection: CollectionDefinition): string[] {
  return describeCollection("collection", collection).fields.map((field) => field.name);
}
