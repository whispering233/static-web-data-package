import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import type { CollectionDefinition } from "../schema.js";
import { describeCollection } from "../schema.js";
import type { StorageAdapter, StorageAdapterContext } from "./types.js";
import {
  ensureParentDir,
  quoteIdentifier,
  resolveStoragePath,
  upsertAllIntoRecords,
  validateRecords
} from "./utils.js";

type FieldKind = "string" | "number" | "boolean" | "json";

type SqliteStatement = {
  all(): unknown[];
  run(...params: unknown[]): unknown;
};

type SqliteDatabase = {
  prepare(sql: string): SqliteStatement;
  transaction<TArgs extends unknown[]>(fn: (...args: TArgs) => unknown): (...args: TArgs) => unknown;
  close(): void;
};

type SqliteDatabaseConstructor = new (filePath: string) => SqliteDatabase;

type FieldPlan = {
  name: string;
  kind: FieldKind;
  sqlType: string;
  required: boolean;
  nullable: boolean;
  presenceColumn: string | undefined;
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
        const rows = db.prepare(`SELECT ${createSelectColumns(fields)} FROM ${quoteIdentifier(table)} ORDER BY ${quoteIdentifier(context.collection.primaryKey)}`).all() as Record<string, unknown>[];
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
            insert.run(...serializeSqliteRecord(item, fields));
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
        insert.run(...serializeSqliteRecord(parsed, fields));
        return parsed;
      } finally {
        db.close();
      }
    },
    async upsertAll(records) {
      const current = await this.readAll();
      const nextRecords = upsertAllIntoRecords(context.collectionName, context.collection, current, records);
      return this.writeAll(nextRecords);
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

function openDatabase(filePath: string): SqliteDatabase {
  const Database = loadSqliteDatabase();
  return new Database(filePath);
}

function loadSqliteDatabase(): SqliteDatabaseConstructor {
  try {
    const require = createRequire(import.meta.url);
    return require("better-sqlite3") as SqliteDatabaseConstructor;
  } catch (error) {
    throw new Error(
      'SQLite storage requires optional dependency "better-sqlite3". Run pnpm --filter @whispering233/static-web-data rebuild better-sqlite3.',
      { cause: error }
    );
  }
}

function createFieldPlan(collection: CollectionDefinition): FieldPlan[] {
  const descriptor = describeCollection("collection", collection);
  const requiredFields = getRequiredFields(descriptor.jsonSchema);
  return descriptor.fields.map((field) => {
    const types = collectJsonSchemaTypes(field.jsonSchema);
    const kind = inferFieldKind(field.jsonSchema);
    return {
      name: field.name,
      kind,
      sqlType: kind === "number" ? "REAL" : kind === "boolean" ? "INTEGER" : "TEXT",
      required: requiredFields.has(field.name),
      nullable: types.includes("null"),
      presenceColumn: !requiredFields.has(field.name) && types.includes("null") && kind !== "json" ? createPresenceColumnName(field.name) : undefined
    };
  });
}

function inferFieldKind(jsonSchema: unknown): FieldKind {
  const types = collectJsonSchemaTypes(jsonSchema);
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

function getRequiredFields(jsonSchema: unknown): Set<string> {
  if (!jsonSchema || typeof jsonSchema !== "object") {
    return new Set();
  }
  const required = (jsonSchema as { required?: unknown }).required;
  return new Set(Array.isArray(required) ? required.filter((field): field is string => typeof field === "string") : []);
}

function ensureTable(db: SqliteDatabase, table: string, fields: FieldPlan[], primaryKey: string): void {
  const columns = fields.flatMap((field) => {
    const primary = field.name === primaryKey ? " PRIMARY KEY NOT NULL" : "";
    const fieldColumn = `${quoteIdentifier(field.name)} ${field.sqlType}${primary}`;
    return field.presenceColumn ? [fieldColumn, `${quoteIdentifier(field.presenceColumn)} INTEGER NOT NULL DEFAULT 1`] : [fieldColumn];
  });
  db.prepare(`CREATE TABLE IF NOT EXISTS ${quoteIdentifier(table)} (${columns.join(", ")})`).run();
  ensurePresenceColumns(db, table, fields);
}

function createInsertStatement(db: SqliteDatabase, table: string, fields: FieldPlan[]): SqliteStatement {
  const columns = createInsertColumns(fields).map((column) => quoteIdentifier(column)).join(", ");
  const placeholders = createInsertColumns(fields).map(() => "?").join(", ");
  return db.prepare(`INSERT OR REPLACE INTO ${quoteIdentifier(table)} (${columns}) VALUES (${placeholders})`);
}

function ensurePresenceColumns(db: SqliteDatabase, table: string, fields: FieldPlan[]): void {
  const columns = new Set(
    (db.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all() as Array<{ name?: unknown }>).flatMap((column) =>
      typeof column.name === "string" ? [column.name] : []
    )
  );
  for (const field of fields) {
    if (field.presenceColumn && !columns.has(field.presenceColumn)) {
      db.prepare(`ALTER TABLE ${quoteIdentifier(table)} ADD COLUMN ${quoteIdentifier(field.presenceColumn)} INTEGER NOT NULL DEFAULT 1`).run();
    }
  }
}

function createInsertColumns(fields: FieldPlan[]): string[] {
  return fields.flatMap((field) => (field.presenceColumn ? [field.name, field.presenceColumn] : [field.name]));
}

function createSelectColumns(fields: FieldPlan[]): string {
  return createInsertColumns(fields).map((column) => quoteIdentifier(column)).join(", ");
}

function createPresenceColumnName(fieldName: string): string {
  return `__swd_present_${[...fieldName].map((char) => char.charCodeAt(0).toString(16).padStart(4, "0")).join("_")}`;
}

function serializeSqliteRecord(record: Record<string, unknown>, fields: FieldPlan[]): unknown[] {
  return fields.flatMap((field) => {
    const value = record[field.name];
    const serialized = serializeSqliteValue(value, field.kind);
    return field.presenceColumn ? [serialized, value === undefined ? 0 : 1] : [serialized];
  });
}

function serializeSqliteValue(value: unknown, kind: FieldKind): unknown {
  if (value === undefined) {
    return null;
  }
  if (kind === "json") {
    return JSON.stringify(value ?? null);
  }
  if (kind === "boolean") {
    if (value === null) {
      return null;
    }
    return value ? 1 : 0;
  }
  return value;
}

function deserializeSqliteRow(row: Record<string, unknown>, fields: FieldPlan[]): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const field of fields) {
    const value = row[field.name];
    if (field.presenceColumn && row[field.presenceColumn] === 0) {
      continue;
    }
    if (value === null && !field.required && (!field.nullable || field.kind === "json")) {
      continue;
    }
    if (field.kind === "json" && typeof value === "string") {
      record[field.name] = JSON.parse(value);
    } else if (field.kind === "boolean") {
      record[field.name] = value === null ? null : Boolean(value);
    } else {
      record[field.name] = value;
    }
  }
  return record;
}
