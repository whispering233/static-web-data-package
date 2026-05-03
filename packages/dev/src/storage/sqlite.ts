import { existsSync } from "node:fs";
import Database from "better-sqlite3";
import type { CollectionDefinition } from "@whispering233/static-web-data/schema";
import { describeCollection } from "@whispering233/static-web-data/schema";
import type { StorageAdapter, StorageAdapterContext } from "./types.js";
import {
  ensureParentDir,
  quoteIdentifier,
  resolveStoragePath,
  validateRecords
} from "./utils.js";

type FieldKind = "string" | "number" | "boolean" | "json";

type FieldPlan = {
  name: string;
  kind: FieldKind;
  sqlType: string;
};

export function createSqliteStorageAdapter(context: StorageAdapterContext): StorageAdapter {
  if (context.collection.storage.type !== "sqlite") {
    throw new Error("SQLite adapter requires sqlite storage config.");
  }

  const filePath = resolveStoragePath(context.cwd, context.collection.storage.path);
  const table = context.collection.storage.table ?? context.collectionName;
  const fields = createFieldPlan(context.collection);

  return {
    async readAll() {
      if (!existsSync(filePath)) {
        return [];
      }
      const db = openDatabase(filePath);
      try {
        ensureTable(db, table, fields, context.collection.primaryKey);
        const rows = db.prepare(`SELECT ${fields.map((field) => quoteIdentifier(field.name)).join(", ")} FROM ${quoteIdentifier(table)} ORDER BY ${quoteIdentifier(context.collection.primaryKey)}`).all() as Record<string, unknown>[];
        const records = rows.map((row) => deserializeSqliteRow(row, fields));
        return validateRecords(context.collectionName, context.collection, records);
      } finally {
        db.close();
      }
    },
    async writeAll(records) {
      const parsed = validateRecords(context.collectionName, context.collection, records);
      await ensureParentDir(filePath);
      const db = openDatabase(filePath);
      try {
        ensureTable(db, table, fields, context.collection.primaryKey);
        const insert = createInsertStatement(db, table, fields);
        const transaction = db.transaction((items: Record<string, unknown>[]) => {
          db.prepare(`DELETE FROM ${quoteIdentifier(table)}`).run();
          for (const item of items) {
            insert.run(...fields.map((field) => serializeSqliteValue(item[field.name], field.kind)));
          }
        });
        transaction(parsed);
        return parsed;
      } finally {
        db.close();
      }
    },
    async upsert(record) {
      const [parsed] = validateRecords(context.collectionName, context.collection, [record]);
      if (!parsed) {
        throw new Error(`Collection "${context.collectionName}" record could not be parsed.`);
      }
      await ensureParentDir(filePath);
      const db = openDatabase(filePath);
      try {
        ensureTable(db, table, fields, context.collection.primaryKey);
        const insert = createInsertStatement(db, table, fields);
        insert.run(...fields.map((field) => serializeSqliteValue(parsed[field.name], field.kind)));
        return parsed;
      } finally {
        db.close();
      }
    },
    async delete(id) {
      if (!existsSync(filePath)) {
        return;
      }
      const db = openDatabase(filePath);
      try {
        ensureTable(db, table, fields, context.collection.primaryKey);
        db.prepare(`DELETE FROM ${quoteIdentifier(table)} WHERE ${quoteIdentifier(context.collection.primaryKey)} = ?`).run(String(id));
      } finally {
        db.close();
      }
    }
  };
}

function openDatabase(filePath: string) {
  return new Database(filePath);
}

function createFieldPlan(collection: CollectionDefinition): FieldPlan[] {
  return describeCollection("collection", collection).fields.map((field) => {
    const kind = inferFieldKind(field.jsonSchema);
    return {
      name: field.name,
      kind,
      sqlType: kind === "number" ? "REAL" : kind === "boolean" ? "INTEGER" : "TEXT"
    };
  });
}

function inferFieldKind(jsonSchema: unknown): FieldKind {
  if (!jsonSchema || typeof jsonSchema !== "object") {
    return "string";
  }
  const type = (jsonSchema as { type?: unknown }).type;
  const types = Array.isArray(type) ? type : [type];
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

function ensureTable(db: Database.Database, table: string, fields: FieldPlan[], primaryKey: string): void {
  const columns = fields.map((field) => {
    const primary = field.name === primaryKey ? " PRIMARY KEY NOT NULL" : "";
    return `${quoteIdentifier(field.name)} ${field.sqlType}${primary}`;
  });
  db.prepare(`CREATE TABLE IF NOT EXISTS ${quoteIdentifier(table)} (${columns.join(", ")})`).run();
}

function createInsertStatement(db: Database.Database, table: string, fields: FieldPlan[]) {
  const columns = fields.map((field) => quoteIdentifier(field.name)).join(", ");
  const placeholders = fields.map(() => "?").join(", ");
  return db.prepare(`INSERT OR REPLACE INTO ${quoteIdentifier(table)} (${columns}) VALUES (${placeholders})`);
}

function serializeSqliteValue(value: unknown, kind: FieldKind): unknown {
  if (kind === "json") {
    return JSON.stringify(value ?? null);
  }
  if (kind === "boolean") {
    return value ? 1 : 0;
  }
  return value;
}

function deserializeSqliteRow(row: Record<string, unknown>, fields: FieldPlan[]): Record<string, unknown> {
  return Object.fromEntries(
    fields.map((field) => {
      const value = row[field.name];
      if (field.kind === "json" && typeof value === "string") {
        return [field.name, JSON.parse(value)];
      }
      if (field.kind === "boolean") {
        return [field.name, Boolean(value)];
      }
      return [field.name, value];
    })
  );
}
