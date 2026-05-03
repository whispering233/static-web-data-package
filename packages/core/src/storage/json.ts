import { readFile, writeFile } from "node:fs/promises";
import { type StorageAdapter } from "./types.js";
import {
  ensureParentDir,
  getPrimaryKeyValue,
  removeFromRecords,
  resolveStoragePath,
  upsertAllIntoRecords,
  upsertIntoRecords,
  validateRecords
} from "./utils.js";
import type { StorageAdapterContext } from "./types.js";

export function createJsonStorageAdapter(context: StorageAdapterContext): StorageAdapter {
  const filePath = resolveStoragePath(context.cwd, context.collection.storage.path);

  return {
    async readAll() {
      const records = await readJsonArray(filePath);
      return validateRecords(context.collectionName, context.collection, records);
    },
    async writeAll(records) {
      const parsed = validateRecords(context.collectionName, context.collection, records);
      await writeJsonArray(filePath, parsed);
      return parsed;
    },
    async upsert(record) {
      const current = await this.readAll();
      const result = upsertIntoRecords(context.collectionName, context.collection, current, record);
      getPrimaryKeyValue(context.collectionName, context.collection, result.record);
      await writeJsonArray(filePath, result.records);
      return result.record;
    },
    async upsertAll(records) {
      const current = await this.readAll();
      const nextRecords = upsertAllIntoRecords(context.collectionName, context.collection, current, records);
      await writeJsonArray(filePath, nextRecords);
      return nextRecords;
    },
    async delete(id) {
      const current = await this.readAll();
      await writeJsonArray(filePath, removeFromRecords(context.collection, current, id));
    }
  };
}

async function readJsonArray(filePath: string): Promise<unknown[]> {
  try {
    const content = await readFile(filePath, "utf8");
    if (!content.trim()) {
      return [];
    }
    const parsed = JSON.parse(content) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error(`JSON storage file "${filePath}" must contain an array.`);
    }
    return parsed;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function writeJsonArray(filePath: string, records: Record<string, unknown>[]): Promise<void> {
  await ensureParentDir(filePath);
  await writeFile(filePath, `${JSON.stringify(records, null, 2)}\n`, "utf8");
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
