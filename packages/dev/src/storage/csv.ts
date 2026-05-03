import { readFile, writeFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import type { StorageAdapter, StorageAdapterContext } from "./types.js";
import {
  ensureParentDir,
  getFieldNames,
  removeFromRecords,
  resolveStoragePath,
  upsertIntoRecords,
  validateRecords
} from "./utils.js";

export function createCsvStorageAdapter(context: StorageAdapterContext): StorageAdapter {
  const filePath = resolveStoragePath(context.cwd, context.collection.storage.path);

  return {
    async readAll() {
      const rawRows = await readCsvRows(filePath);
      const records = rawRows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, parseCell(value)])));
      return validateRecords(context.collectionName, context.collection, records);
    },
    async writeAll(records) {
      const parsed = validateRecords(context.collectionName, context.collection, records);
      await writeCsvRows(filePath, context.collection, parsed);
      return parsed;
    },
    async upsert(record) {
      const current = await this.readAll();
      const result = upsertIntoRecords(context.collectionName, context.collection, current, record);
      await writeCsvRows(filePath, context.collection, result.records);
      return result.record;
    },
    async delete(id) {
      const current = await this.readAll();
      await writeCsvRows(filePath, context.collection, removeFromRecords(context.collection, current, id));
    }
  };
}

async function readCsvRows(filePath: string): Promise<Array<Record<string, string>>> {
  try {
    const content = await readFile(filePath, "utf8");
    if (!content.trim()) {
      return [];
    }
    return parse(content, {
      columns: true,
      skip_empty_lines: true
    }) as Array<Record<string, string>>;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function writeCsvRows(
  filePath: string,
  collection: StorageAdapterContext["collection"],
  records: Record<string, unknown>[]
): Promise<void> {
  const columns = getFieldNames(collection);
  const rows = records.map((record) => Object.fromEntries(columns.map((column) => [column, serializeCell(record[column])])));
  const content = stringify(rows, {
    header: true,
    columns
  });
  await ensureParentDir(filePath);
  await writeFile(filePath, content, "utf8");
}

function parseCell(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return JSON.parse(trimmed);
  }
  if (trimmed === "true") {
    return true;
  }
  if (trimmed === "false") {
    return false;
  }
  if (/^-?(0|[1-9]\d*)(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }
  return value;
}

function serializeCell(value: unknown): string | number | boolean {
  if (Array.isArray(value) || (value && typeof value === "object")) {
    return JSON.stringify(value);
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
