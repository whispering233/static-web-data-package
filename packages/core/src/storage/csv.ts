import { readFile, writeFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { describeCollection } from "../schema.js";
import type { StorageAdapter, StorageAdapterContext } from "./types.js";
import {
  ensureParentDir,
  getFieldNames,
  removeFromRecords,
  resolveStoragePath,
  upsertAllIntoRecords,
  upsertIntoRecords,
  validateRecords
} from "./utils.js";

type CsvFieldKind = "string" | "number" | "boolean" | "json";

type CsvFieldPlan = {
  kind: CsvFieldKind;
  blankValue: unknown;
};

export function createCsvStorageAdapter(context: StorageAdapterContext): StorageAdapter {
  const filePath = resolveStoragePath(context.cwd, context.collection.storage.path);
  const fieldPlanByName = createFieldPlanMap(context.collection);

  return {
    async readAll() {
      const rawRows = await readCsvRows(filePath);
      const records = rawRows.map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([key, value]) => [
            key,
            parseCell(value, fieldPlanByName[key] ?? { kind: "string", blankValue: "" })
          ])
        )
      );
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
    async upsertAll(records) {
      const current = await this.readAll();
      const nextRecords = upsertAllIntoRecords(context.collectionName, context.collection, current, records);
      await writeCsvRows(filePath, context.collection, nextRecords);
      return nextRecords;
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

function createFieldPlanMap(collection: StorageAdapterContext["collection"]): Record<string, CsvFieldPlan> {
  return Object.fromEntries(
    describeCollection("collection", collection).fields.map((field) => [field.name, createCsvFieldPlan(field.jsonSchema)])
  );
}

function createCsvFieldPlan(jsonSchema: unknown): CsvFieldPlan {
  const types = collectJsonSchemaTypes(jsonSchema);
  const kind = inferCsvFieldKind(types);
  return {
    kind,
    blankValue: kind === "string" ? "" : types.includes("null") ? null : undefined
  };
}

function inferCsvFieldKind(types: unknown[]): CsvFieldKind {
  if (types.includes("number") || types.includes("integer")) {
    return "number";
  }
  if (types.includes("boolean")) {
    return "boolean";
  }
  if (types.includes("array") || types.includes("object")) {
    return "json";
  }
  return "string";
}

function collectJsonSchemaTypes(jsonSchema: unknown): unknown[] {
  if (!jsonSchema || typeof jsonSchema !== "object") {
    return [];
  }
  const schema = jsonSchema as {
    type?: unknown;
    anyOf?: unknown;
    oneOf?: unknown;
    allOf?: unknown;
  };
  const type = Array.isArray(schema.type) ? schema.type : [schema.type];
  const branches = [
    ...(Array.isArray(schema.anyOf) ? schema.anyOf : []),
    ...(Array.isArray(schema.oneOf) ? schema.oneOf : []),
    ...(Array.isArray(schema.allOf) ? schema.allOf : [])
  ];
  return [...type, ...branches.flatMap((branch) => collectJsonSchemaTypes(branch))];
}

function parseCell(value: string, plan: CsvFieldPlan): unknown {
  if (value === "") {
    return plan.blankValue;
  }
  const trimmed = value.trim();
  if (plan.kind === "json") {
    return JSON.parse(trimmed);
  }
  if (plan.kind === "boolean") {
    if (trimmed === "true") {
      return true;
    }
    if (trimmed === "false") {
      return false;
    }
    return value;
  }
  if (plan.kind === "number") {
    return Number(trimmed);
  }
  return value;
}

function serializeCell(value: unknown): string | number | boolean {
  if (Array.isArray(value) || (value && typeof value === "object")) {
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "string" || typeof value === "number") {
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
