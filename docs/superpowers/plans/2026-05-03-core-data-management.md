# Core Data Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all source-data management into `packages/core`, expose it through a Node-only `@whispering233/static-web-data/storage` subpath, and turn `packages/dev` into a CLI/server plus embedded React data-management service that delegates to core.

**Architecture:** Core owns schema, validation, storage adapters, package-level repository services, and static export orchestration. The root core entry remains browser-safe; Node-only storage code is isolated behind `./storage`. Dev loads project config, serves a local React SPA, exposes HTTP routes, and calls the core repository for every data operation.

**Tech Stack:** TypeScript, pnpm 10.31.0, Vitest, tsup, Vite, React 19, Hono, `csv-parse`, `csv-stringify`, optional `better-sqlite3`.

---

## File Structure

Create:

- `packages/core/src/storage/types.ts` - shared storage adapter and context types.
- `packages/core/src/storage/utils.ts` - path resolution, validation, primary-key, CSV/SQLite helper utilities.
- `packages/core/src/storage/json.ts` - JSON file adapter.
- `packages/core/src/storage/csv.ts` - CSV file adapter.
- `packages/core/src/storage/sqlite.ts` - lazy-loaded `better-sqlite3` adapter.
- `packages/core/src/storage/factory.ts` - collection-level adapter factory.
- `packages/core/src/storage/repository.ts` - package-level repository, validate, and export service.
- `packages/core/src/storage/index.ts` - public Node-only storage entry.
- `packages/core/src/storage.test.ts` - core storage adapter and repository tests.
- `packages/dev/src/client/index.html` - Vite HTML entry for embedded dev UI.
- `packages/dev/src/client/main.tsx` - React bootstrap.
- `packages/dev/src/client/App.tsx` - management workspace shell.
- `packages/dev/src/client/api.ts` - browser API wrapper for `/api/*`.
- `packages/dev/src/client/styles.css` - private management UI CSS.
- `packages/dev/src/client/components/CollectionSidebar.tsx` - collection navigation.
- `packages/dev/src/client/components/RecordTable.tsx` - record table.
- `packages/dev/src/client/components/RecordEditor.tsx` - JSON upsert/import editor.
- `packages/dev/src/client/components/StatusBar.tsx` - status and error display.
- `packages/dev/src/client/client.test.tsx` - render-to-string and API wrapper tests.
- `packages/dev/vite.client.config.ts` - Vite build config for embedded client assets.

Modify:

- `packages/core/package.json` - add `./storage` export, storage dependencies, and build entry.
- `packages/dev/package.json` - remove storage/native dependencies, add React client build dependencies and build script.
- `tsconfig.base.json` - add storage subpath alias.
- `vitest.config.ts` - add storage alias before root core alias.
- `typedoc.json` - include storage entry point.
- `packages/dev/src/commands.ts` - delegate validate/export to core repository.
- `packages/dev/src/server.ts` - delegate API routes to core repository and serve React client assets.
- `packages/dev/src/index.ts` - remove dev-owned storage exports; optionally export only dev commands/server/config.
- `packages/dev/src/commands.test.ts` - keep command behavior tests with core-backed storage.
- `packages/dev/src/server.test.ts` - add client asset serving coverage and keep CRUD coverage.
- `README.md` - document core storage API and dev embedded management UI.
- `packages/core/README.md` - mention `./storage` Node-only API.
- `packages/dev/README.md` - describe CLI/server plus embedded React management UI.
- `pnpm-lock.yaml` - update after package dependency moves.

Delete:

- `packages/dev/src/storage/types.ts`
- `packages/dev/src/storage/utils.ts`
- `packages/dev/src/storage/json.ts`
- `packages/dev/src/storage/csv.ts`
- `packages/dev/src/storage/sqlite.ts`
- `packages/dev/src/storage/index.ts`
- `packages/dev/src/storage.test.ts`

---

### Task 1: Write Core Storage Tests

**Files:**
- Create: `packages/core/src/storage.test.ts`
- Delete later: `packages/dev/src/storage.test.ts`

- [ ] **Step 1: Create failing core storage adapter tests**

Create `packages/core/src/storage.test.ts` by moving the existing scenarios from `packages/dev/src/storage.test.ts` and changing the import to core storage:

```ts
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineCollection, defineDataPackage } from "./schema.js";
import { createDataRepository, createStorageAdapter } from "./storage/index.js";

describe("storage adapters", () => {
  const schema = z.object({
    id: z.string(),
    title: z.string(),
    count: z.number(),
    tags: z.array(z.string()).default([])
  });

  it("roundtrips JSON records", async () => {
    const dir = await mkdtemp(join(tmpdir(), "swd-json-"));
    try {
      const collection = defineCollection({
        primaryKey: "id",
        storage: { type: "json", path: "records.json" },
        schema
      });
      const adapter = createStorageAdapter("posts", collection, { cwd: dir });

      await adapter.writeAll([{ id: "a", title: "Alpha", count: 1, tags: ["news"] }]);
      await adapter.upsert({ id: "b", title: "Beta", count: 2, tags: [] });
      await adapter.delete("a");

      expect(await adapter.readAll()).toEqual([{ id: "b", title: "Beta", count: 2, tags: [] }]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("roundtrips CSV records with JSON encoded complex cells", async () => {
    const dir = await mkdtemp(join(tmpdir(), "swd-csv-"));
    try {
      const collection = defineCollection({
        primaryKey: "id",
        storage: { type: "csv", path: "records.csv" },
        schema
      });
      const adapter = createStorageAdapter("posts", collection, { cwd: dir });

      await adapter.writeAll([{ id: "a", title: "Alpha", count: 1, tags: ["news", "docs"] }]);

      const csv = await readFile(join(dir, "records.csv"), "utf8");
      expect(csv).toContain("\"[\"\"news\"\",\"\"docs\"\"]\"");
      expect(await adapter.readAll()).toEqual([{ id: "a", title: "Alpha", count: 1, tags: ["news", "docs"] }]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("roundtrips SQLite records", async () => {
    const dir = await mkdtemp(join(tmpdir(), "swd-sqlite-"));
    try {
      const collection = defineCollection({
        primaryKey: "id",
        storage: { type: "sqlite", path: "records.sqlite", table: "posts" },
        schema
      });
      const adapter = createStorageAdapter("posts", collection, { cwd: dir });

      await adapter.writeAll([{ id: "a", title: "Alpha", count: 1, tags: ["news"] }]);
      await adapter.upsert({ id: "b", title: "Beta", count: 2, tags: [] });

      expect(await adapter.readAll()).toEqual([
        { id: "a", title: "Alpha", count: 1, tags: ["news"] },
        { id: "b", title: "Beta", count: 2, tags: [] }
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Add failing package-level repository tests**

Append to `packages/core/src/storage.test.ts`:

```ts
describe("data repository", () => {
  it("lists descriptors, validates collections, and exports static data from source storage", async () => {
    const dir = await mkdtemp(join(tmpdir(), "swd-repository-"));
    try {
      const dataPackage = defineDataPackage({
        output: "public/static-web-data",
        collections: {
          posts: defineCollection({
            primaryKey: "id",
            storage: { type: "json", path: "data/posts.json" },
            schema: z.object({ id: z.string(), title: z.string() })
          })
        }
      });
      const repository = createDataRepository(dataPackage, { cwd: dir });

      expect(repository.listCollections()[0]).toMatchObject({
        name: "posts",
        primaryKey: "id",
        storage: { type: "json", path: "data/posts.json" }
      });

      await repository.collection("posts").writeAll([{ id: "a", title: "Alpha" }]);

      await expect(repository.validate()).resolves.toEqual({ collections: { posts: 1 } });

      const summary = await repository.exportStaticBundle({
        generatedAt: new Date("2026-05-03T00:00:00.000Z")
      });
      expect(summary.collections).toEqual({ posts: 1 });

      const manifest = JSON.parse(
        await readFile(join(dir, "public", "static-web-data", "manifest.json"), "utf8")
      );
      expect(manifest.collections.posts).toMatchObject({
        primaryKey: "id",
        path: "collections/posts.json",
        count: 1
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("throws a clear error for unknown repository collections", async () => {
    const dataPackage = defineDataPackage({
      output: "public/static-web-data",
      collections: {}
    });
    const repository = createDataRepository(dataPackage);

    expect(() => repository.collection("missing")).toThrow(/Unknown collection "missing"/);
  });
});
```

- [ ] **Step 3: Run the core storage tests and verify they fail**

Run:

```sh
pnpm --filter @whispering233/static-web-data test -- src/storage.test.ts
```

Expected: FAIL because `./storage/index.js` does not exist.

- [ ] **Step 4: Commit the failing tests if using task-level commits**

Run:

```sh
git add packages/core/src/storage.test.ts
git commit -m "test: specify core storage repository behavior"
```

Expected: commit succeeds if this task is being committed separately. Skip the commit only when the execution mode intentionally batches commits.

---

### Task 2: Move Storage Implementation Into Core

**Files:**
- Create: `packages/core/src/storage/types.ts`
- Create: `packages/core/src/storage/utils.ts`
- Create: `packages/core/src/storage/json.ts`
- Create: `packages/core/src/storage/csv.ts`
- Create: `packages/core/src/storage/sqlite.ts`
- Create: `packages/core/src/storage/factory.ts`
- Create: `packages/core/src/storage/repository.ts`
- Create: `packages/core/src/storage/index.ts`
- Delete: `packages/dev/src/storage/*`

- [ ] **Step 1: Move existing adapter files into core**

Use non-interactive file moves:

```sh
git mv packages/dev/src/storage packages/core/src/storage
```

Expected: the files now live under `packages/core/src/storage/`.

- [ ] **Step 2: Update `packages/core/src/storage/types.ts`**

Replace imports and support `cwd` as an option object:

```ts
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
```

- [ ] **Step 3: Update `packages/core/src/storage/utils.ts` imports**

Use relative core imports:

```ts
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  type CollectionDefinition,
  describeCollection,
  validateCollectionRecords
} from "../schema.js";
```

Keep the existing helper bodies for `resolveStoragePath`, `ensureParentDir`, `validateRecords`, `getPrimaryKeyValue`, `upsertIntoRecords`, `removeFromRecords`, `quoteIdentifier`, and `getFieldNames`.

- [ ] **Step 4: Add `packages/core/src/storage/factory.ts`**

Create:

```ts
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
```

- [ ] **Step 5: Update `packages/core/src/storage/index.ts`**

Replace the file with:

```ts
export { createStorageAdapter } from "./factory.js";
export { createDataRepository } from "./repository.js";
export type { DataRepository, ValidationSummary } from "./repository.js";
export type { StorageAdapter, StorageAdapterOptions } from "./types.js";
```

- [ ] **Step 6: Update JSON and CSV adapter imports**

In `packages/core/src/storage/json.ts` and `packages/core/src/storage/csv.ts`, keep behavior from the moved files and ensure imports are local:

```ts
import type { StorageAdapter, StorageAdapterContext } from "./types.js";
```

Expected: no imports from `@whispering233/static-web-data/schema` remain inside core storage files.

- [ ] **Step 7: Update SQLite adapter to lazy-load `better-sqlite3`**

In `packages/core/src/storage/sqlite.ts`, remove the top-level default import of `better-sqlite3` and use `createRequire`:

```ts
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import type { CollectionDefinition } from "../schema.js";
import { describeCollection } from "../schema.js";
import type { StorageAdapter, StorageAdapterContext } from "./types.js";
import {
  ensureParentDir,
  quoteIdentifier,
  resolveStoragePath,
  validateRecords
} from "./utils.js";

type DatabaseConstructor = typeof import("better-sqlite3").default;
type SqliteDatabase = import("better-sqlite3").Database;

const require = createRequire(import.meta.url);

function loadDatabaseConstructor(): DatabaseConstructor {
  try {
    return require("better-sqlite3") as DatabaseConstructor;
  } catch (error) {
    throw new Error(
      'SQLite storage requires optional dependency "better-sqlite3". Rebuild it with: pnpm --filter @whispering233/static-web-data rebuild better-sqlite3',
      { cause: error }
    );
  }
}
```

Update the database creation and helper signatures:

```ts
export function createSqliteStorageAdapter(context: StorageAdapterContext): StorageAdapter {
  if (context.collection.storage.type !== "sqlite") {
    throw new Error("SQLite adapter requires sqlite storage config.");
  }

  const Database = loadDatabaseConstructor();
  const filePath = resolveStoragePath(context.cwd, context.collection.storage.path);
  const table = context.collection.storage.table ?? context.collectionName;
  const fields = createFieldPlan(context.collection);

  function openDatabase(filePath: string) {
    return new Database(filePath);
  }

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
    }
  };
}
```

Keep the existing `writeAll`, `upsert`, `delete`, `createFieldPlan`, `inferFieldKind`, `ensureTable`, `createInsertStatement`, `serializeSqliteValue`, and `deserializeSqliteRow` behavior, but change `Database.Database` annotations to `SqliteDatabase`.

- [ ] **Step 8: Add `packages/core/src/storage/repository.ts`**

Create:

```ts
import { writeStaticBundle, type StaticBundleSummary } from "../export.js";
import {
  describeDataPackage,
  type CollectionDescriptor,
  type DataPackageDefinition
} from "../schema.js";
import { createStorageAdapter } from "./factory.js";
import type { StorageAdapter, StorageAdapterOptions } from "./types.js";

export type ValidationSummary = {
  collections: Record<string, number>;
};

export type DataRepository = {
  collection(name: string): StorageAdapter;
  listCollections(): CollectionDescriptor[];
  validate(): Promise<ValidationSummary>;
  exportStaticBundle(options?: { generatedAt?: Date }): Promise<StaticBundleSummary>;
};

export function createDataRepository(
  dataPackage: DataPackageDefinition,
  options: StorageAdapterOptions = {}
): DataRepository {
  const cwd = options.cwd ?? process.cwd();

  return {
    collection(name) {
      const collection = dataPackage.collections[name];
      if (!collection) {
        throw new Error(`Unknown collection "${name}".`);
      }
      return createStorageAdapter(name, collection, { cwd });
    },
    listCollections() {
      return describeDataPackage(dataPackage);
    },
    async validate() {
      const collections: Record<string, number> = {};
      for (const [name] of Object.entries(dataPackage.collections)) {
        const records = await this.collection(name).readAll();
        collections[name] = records.length;
      }
      return { collections };
    },
    async exportStaticBundle(exportOptions = {}) {
      const recordsByCollection: Record<string, unknown[]> = {};
      for (const [name] of Object.entries(dataPackage.collections)) {
        recordsByCollection[name] = await this.collection(name).readAll();
      }
      return writeStaticBundle(dataPackage, recordsByCollection, {
        cwd,
        generatedAt: exportOptions.generatedAt
      });
    }
  };
}
```

- [ ] **Step 9: Run tests and fix TypeScript issues in moved files**

Run:

```sh
pnpm --filter @whispering233/static-web-data test -- src/storage.test.ts
```

Expected: PASS for JSON, CSV, SQLite, and repository tests. If SQLite fails because the native binding is missing, run:

```sh
pnpm --filter @whispering233/static-web-data rebuild better-sqlite3
```

- [ ] **Step 10: Commit core storage implementation if using task-level commits**

Run:

```sh
git add packages/core/src/storage packages/core/src/storage.test.ts packages/dev/src/storage
git commit -m "feat: move storage management into core"
```

Expected: commit succeeds if this task is being committed separately.

---

### Task 3: Update Core Package Exports and Workspace Configuration

**Files:**
- Modify: `packages/core/package.json`
- Modify: `tsconfig.base.json`
- Modify: `vitest.config.ts`
- Modify: `typedoc.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Update `packages/core/package.json` exports and build script**

Change the core package metadata to include the storage subpath:

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./schema": {
      "types": "./dist/schema.d.ts",
      "import": "./dist/schema.js"
    },
    "./export": {
      "types": "./dist/export.d.ts",
      "import": "./dist/export.js"
    },
    "./storage": {
      "types": "./dist/storage/index.d.ts",
      "import": "./dist/storage/index.js"
    }
  },
  "scripts": {
    "build": "node ../../scripts/clean-dist.mjs && tsup src/index.ts src/schema.ts src/export.ts src/storage/index.ts --format esm --sourcemap && tsc -p tsconfig.build.json --emitDeclarationOnly"
  },
  "dependencies": {
    "csv-parse": "^6.1.0",
    "csv-stringify": "^6.6.0",
    "zod": "^4.4.2"
  },
  "optionalDependencies": {
    "better-sqlite3": "^12.9.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.13",
    "tsup": "^8.5.1",
    "typescript": "^6.0.3",
    "vitest": "^4.1.5"
  }
}
```

Preserve existing fields not shown here, including `name`, `version`, `description`, `license`, `files`, `engines`, `publishConfig`, and `repository`.

- [ ] **Step 2: Remove storage dependencies from `packages/dev/package.json`**

Remove from `dependencies`:

```json
"better-sqlite3": "^12.9.0",
"csv-parse": "^6.1.0",
"csv-stringify": "^6.6.0",
```

Remove from `devDependencies`:

```json
"@types/better-sqlite3": "^7.6.13"
```

- [ ] **Step 3: Update TypeScript path aliases**

In `tsconfig.base.json`, insert the storage alias before the root core alias:

```json
"@whispering233/static-web-data/storage": [
  "packages/core/src/storage/index.ts"
],
```

- [ ] **Step 4: Update Vitest aliases**

In `vitest.config.ts`, add the storage alias before the root core alias:

```ts
{ find: "@whispering233/static-web-data/storage", replacement: resolve("packages/core/src/storage/index.ts") },
```

- [ ] **Step 5: Update TypeDoc entry points**

In `typedoc.json`, add:

```json
"packages/core/src/storage/index.ts"
```

Place it after `packages/core/src/export.ts`.

- [ ] **Step 6: Update lockfile**

Run:

```sh
pnpm install
```

Expected: `pnpm-lock.yaml` updates so `better-sqlite3` belongs to core as optional and CSV packages are dependencies of core.

- [ ] **Step 7: Run package-level checks**

Run:

```sh
pnpm typecheck
pnpm docs:api:check
```

Expected: both commands pass.

- [ ] **Step 8: Commit package configuration changes if using task-level commits**

Run:

```sh
git add packages/core/package.json packages/dev/package.json tsconfig.base.json vitest.config.ts typedoc.json pnpm-lock.yaml
git commit -m "chore: expose core storage entrypoint"
```

Expected: commit succeeds if this task is being committed separately.

---

### Task 4: Refactor Dev Commands and Server to Use Core Repository

**Files:**
- Modify: `packages/dev/src/commands.ts`
- Modify: `packages/dev/src/server.ts`
- Modify: `packages/dev/src/index.ts`
- Modify: `packages/dev/src/commands.test.ts`
- Modify: `packages/dev/src/server.test.ts`

- [ ] **Step 1: Update `packages/dev/src/commands.ts`**

Replace adapter usage with core repository:

```ts
import { createDataRepository, type ValidationSummary } from "@whispering233/static-web-data/storage";
import type { StaticBundleSummary } from "@whispering233/static-web-data/export";
import type { DataPackageDefinition } from "@whispering233/static-web-data/schema";

export type { ValidationSummary };

export async function validateProjectData(
  dataPackage: DataPackageDefinition,
  cwd: string = process.cwd()
): Promise<ValidationSummary> {
  return createDataRepository(dataPackage, { cwd }).validate();
}

export async function exportStaticData(
  dataPackage: DataPackageDefinition,
  cwd: string = process.cwd()
): Promise<StaticBundleSummary> {
  return createDataRepository(dataPackage, { cwd }).exportStaticBundle();
}
```

- [ ] **Step 2: Update `packages/dev/src/server.ts` API routes**

Import the repository:

```ts
import { readFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { createDataRepository } from "@whispering233/static-web-data/storage";
import type { DataPackageDefinition } from "@whispering233/static-web-data/schema";
```

Extend options:

```ts
export type CreateDevAppOptions = {
  config: DataPackageDefinition;
  cwd: string;
  clientDistDir?: string;
};
```

Inside `createDevApp`, create one repository and replace every `createStorageAdapter` call:

```ts
const repository = createDataRepository(options.config, { cwd: options.cwd });

app.get("/api/collections", (context) => context.json(repository.listCollections()));

app.get("/api/collections/:name/records", async (context) => {
  const records = await repository.collection(context.req.param("name")).readAll();
  return context.json(records);
});

app.post("/api/collections/:name/records", async (context) => {
  const record = await context.req.json();
  const saved = await repository.collection(context.req.param("name")).upsert(record);
  return context.json(saved);
});
```

Apply the same pattern to delete, import, collection export, validate, and static export routes.

- [ ] **Step 3: Add client asset serving helpers to `server.ts`**

Add after API routes:

```ts
const clientDistDir = options.clientDistDir ?? resolve(dirname(fileURLToPath(import.meta.url)), "client");

app.get("/assets/*", async (context) => serveClientFile(context.req.path, clientDistDir));
app.get("/", async () => serveClientFile("/index.html", clientDistDir));
```

Add helpers:

```ts
async function serveClientFile(requestPath: string, clientDistDir: string): Promise<Response> {
  const relativePath = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
  const filePath = resolve(clientDistDir, relativePath);
  if (!isInside(clientDistDir, filePath)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const content = await readFile(filePath);
    return new Response(content, {
      headers: { "content-type": getContentType(filePath) }
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
      return new Response("Not found", { status: 404 });
    }
    throw error;
  }
}

function isInside(root: string, filePath: string): boolean {
  const path = relative(resolve(root), filePath);
  return path === "" || (!path.startsWith("..") && !path.startsWith("/") && !/^[A-Za-z]:/.test(path));
}

function getContentType(filePath: string): string {
  switch (extname(filePath)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}
```

- [ ] **Step 4: Remove dev storage exports**

In `packages/dev/src/index.ts`, remove:

```ts
export { createStorageAdapter } from "./storage/index.js";
export type { StorageAdapter } from "./storage/index.js";
```

Keep:

```ts
export { exportStaticData, validateProjectData } from "./commands.js";
export { loadProjectConfig } from "./config.js";
export { createDevApp, startDevServer } from "./server.js";
```

- [ ] **Step 5: Update dev server tests for client asset serving**

In `packages/dev/src/server.test.ts`, create a temp client dist directory before `createDevApp`:

```ts
await mkdir(join(dir, "client", "assets"), { recursive: true });
await writeFile(join(dir, "client", "index.html"), "<!doctype html><div id=\"root\"></div>", "utf8");
await writeFile(join(dir, "client", "assets", "app.js"), "console.log('ok');", "utf8");
const app = createDevApp({ config, cwd: dir, clientDistDir: join(dir, "client") });
```

Add assertions:

```ts
const htmlResponse = await app.request("/");
expect(htmlResponse.status).toBe(200);
expect(await htmlResponse.text()).toContain("root");

const assetResponse = await app.request("/assets/app.js");
expect(assetResponse.status).toBe(200);
expect(assetResponse.headers.get("content-type")).toContain("text/javascript");
```

- [ ] **Step 6: Delete dev storage test**

Remove `packages/dev/src/storage.test.ts` because adapter behavior now belongs to core:

```sh
git rm packages/dev/src/storage.test.ts
```

- [ ] **Step 7: Run dev tests**

Run:

```sh
pnpm --filter @whispering233/static-web-data-dev test
```

Expected: PASS for commands and server tests.

- [ ] **Step 8: Commit dev repository refactor if using task-level commits**

Run:

```sh
git add packages/dev/src packages/dev/package.json
git commit -m "refactor: delegate dev data operations to core"
```

Expected: commit succeeds if this task is being committed separately.

---

### Task 5: Add Embedded Dev React Client

**Files:**
- Create: `packages/dev/src/client/index.html`
- Create: `packages/dev/src/client/main.tsx`
- Create: `packages/dev/src/client/App.tsx`
- Create: `packages/dev/src/client/api.ts`
- Create: `packages/dev/src/client/styles.css`
- Create: `packages/dev/src/client/components/CollectionSidebar.tsx`
- Create: `packages/dev/src/client/components/RecordTable.tsx`
- Create: `packages/dev/src/client/components/RecordEditor.tsx`
- Create: `packages/dev/src/client/components/StatusBar.tsx`
- Create: `packages/dev/src/client/client.test.tsx`

- [ ] **Step 1: Add client API types and wrapper**

Create `packages/dev/src/client/api.ts`:

```ts
export type FieldDescriptor = {
  name: string;
  metadata: Record<string, unknown>;
  jsonSchema: unknown;
};

export type CollectionDescriptor = {
  name: string;
  primaryKey: string;
  storage: { type: string; path: string; table?: string };
  fields: FieldDescriptor[];
  jsonSchema: unknown;
};

export type ValidationSummary = {
  collections: Record<string, number>;
};

export type StaticBundleSummary = {
  outputDir: string;
  collections: Record<string, number>;
};

export type ImportMode = "replace" | "upsert";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const body = (await response.json()) as unknown;
  if (!response.ok) {
    const error = body && typeof body === "object" && "error" in body ? String((body as { error: unknown }).error) : response.statusText;
    throw new Error(error);
  }
  return body as T;
}

export function listCollections(): Promise<CollectionDescriptor[]> {
  return api<CollectionDescriptor[]>("/api/collections");
}

export function listRecords(collectionName: string): Promise<Record<string, unknown>[]> {
  return api<Record<string, unknown>[]>(`/api/collections/${encodeURIComponent(collectionName)}/records`);
}

export function saveRecord(collectionName: string, record: unknown): Promise<Record<string, unknown>> {
  return api<Record<string, unknown>>(`/api/collections/${encodeURIComponent(collectionName)}/records`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(record)
  });
}

export function deleteRecord(collectionName: string, id: string | number): Promise<{ ok: true }> {
  return api<{ ok: true }>(
    `/api/collections/${encodeURIComponent(collectionName)}/records/${encodeURIComponent(String(id))}`,
    { method: "DELETE" }
  );
}

export function importRecords(collectionName: string, records: unknown[], mode: ImportMode): Promise<Record<string, unknown>[]> {
  return api<Record<string, unknown>[]>(`/api/collections/${encodeURIComponent(collectionName)}/import`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ records, mode })
  });
}

export function validateData(): Promise<ValidationSummary> {
  return api<ValidationSummary>("/api/validate");
}

export function exportStaticBundle(): Promise<StaticBundleSummary> {
  return api<StaticBundleSummary>("/api/export", { method: "POST" });
}
```

- [ ] **Step 2: Add presentational components**

Create `packages/dev/src/client/components/CollectionSidebar.tsx`:

```tsx
import type { CollectionDescriptor } from "../api.js";

export type CollectionSidebarProps = {
  collections: CollectionDescriptor[];
  selectedName: string | undefined;
  onSelect(name: string): void;
};

export function CollectionSidebar({ collections, selectedName, onSelect }: CollectionSidebarProps) {
  return (
    <aside className="swd-dev-sidebar" aria-label="Collections">
      <div className="swd-dev-sidebar-header">
        <strong>Collections</strong>
        <span>{collections.length}</span>
      </div>
      <nav className="swd-dev-collections">
        {collections.map((collection) => (
          <button
            className={collection.name === selectedName ? "is-active" : ""}
            key={collection.name}
            type="button"
            onClick={() => onSelect(collection.name)}
          >
            <span>{collection.name}</span>
            <small>{collection.storage.type} · {collection.primaryKey}</small>
          </button>
        ))}
      </nav>
    </aside>
  );
}
```

Create `packages/dev/src/client/components/RecordTable.tsx`:

```tsx
import type { CollectionDescriptor } from "../api.js";

export type RecordTableProps = {
  collection: CollectionDescriptor | undefined;
  records: Record<string, unknown>[];
  onEdit(record: Record<string, unknown>): void;
  onDelete(id: string | number): void;
};

export function RecordTable({ collection, records, onEdit, onDelete }: RecordTableProps) {
  if (!collection) {
    return <div className="swd-dev-empty">No collection selected</div>;
  }

  const columns = collection.fields.map((field) => field.name);

  if (records.length === 0) {
    return <div className="swd-dev-empty">No records</div>;
  }

  return (
    <table className="swd-dev-table">
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column}>{column}</th>
          ))}
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {records.map((record, index) => {
          const id = record[collection.primaryKey];
          return (
            <tr key={String(id ?? index)}>
              {columns.map((column) => (
                <td key={column}>{formatValue(record[column])}</td>
              ))}
              <td>
                <button type="button" onClick={() => onEdit(record)}>Edit</button>
                <button
                  type="button"
                  disabled={id === undefined || id === null}
                  onClick={() => onDelete(id as string | number)}
                >
                  Delete
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}
```

Create `packages/dev/src/client/components/RecordEditor.tsx`:

```tsx
export type RecordEditorProps = {
  value: string;
  onChange(value: string): void;
  onSave(): void;
  onImportReplace(): void;
  onImportUpsert(): void;
};

export function RecordEditor({
  value,
  onChange,
  onSave,
  onImportReplace,
  onImportUpsert
}: RecordEditorProps) {
  return (
    <section className="swd-dev-editor" aria-label="Record editor">
      <textarea
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      <div className="swd-dev-editor-actions">
        <button type="button" onClick={onSave}>Save</button>
        <button type="button" onClick={onImportReplace}>Import replace</button>
        <button type="button" onClick={onImportUpsert}>Import upsert</button>
      </div>
    </section>
  );
}
```

Create `packages/dev/src/client/components/StatusBar.tsx`:

```tsx
export type StatusBarProps = {
  status: string;
  error?: string;
};

export function StatusBar({ status, error }: StatusBarProps) {
  return (
    <div className={error ? "swd-dev-status is-error" : "swd-dev-status"} role="status">
      {error ?? status}
    </div>
  );
}
```

- [ ] **Step 3: Add workspace app**

Create `packages/dev/src/client/App.tsx`:

```tsx
import { useEffect, useMemo, useState } from "react";
import {
  deleteRecord,
  exportStaticBundle,
  importRecords,
  listCollections,
  listRecords,
  saveRecord,
  validateData,
  type CollectionDescriptor
} from "./api.js";
import { CollectionSidebar } from "./components/CollectionSidebar.js";
import { RecordEditor } from "./components/RecordEditor.js";
import { RecordTable } from "./components/RecordTable.js";
import { StatusBar } from "./components/StatusBar.js";

export function App() {
  const [collections, setCollections] = useState<CollectionDescriptor[]>([]);
  const [selectedName, setSelectedName] = useState<string>();
  const [records, setRecords] = useState<Record<string, unknown>[]>([]);
  const [draft, setDraft] = useState("{\n  \"id\": \"new\"\n}");
  const [status, setStatus] = useState("Loading collections");
  const [error, setError] = useState<string>();

  const selectedCollection = useMemo(
    () => collections.find((collection) => collection.name === selectedName),
    [collections, selectedName]
  );

  useEffect(() => {
    listCollections()
      .then((items) => {
        setCollections(items);
        setSelectedName(items[0]?.name);
        setStatus(`${items.length} collections loaded`);
      })
      .catch(handleError);
  }, []);

  useEffect(() => {
    if (!selectedName) return;
    refreshRecords(selectedName);
  }, [selectedName]);

  function handleError(cause: unknown) {
    setError(cause instanceof Error ? cause.message : String(cause));
  }

  async function refreshRecords(name = selectedName) {
    if (!name) return;
    try {
      setError(undefined);
      const items = await listRecords(name);
      setRecords(items);
      setStatus(`${items.length} records loaded`);
    } catch (cause) {
      handleError(cause);
    }
  }

  async function saveDraft() {
    if (!selectedName) return;
    try {
      setError(undefined);
      await saveRecord(selectedName, JSON.parse(draft));
      await refreshRecords(selectedName);
      setStatus("Record saved");
    } catch (cause) {
      handleError(cause);
    }
  }

  async function importDraft(mode: "replace" | "upsert") {
    if (!selectedName) return;
    try {
      setError(undefined);
      const parsed = JSON.parse(draft) as unknown;
      const recordsToImport = Array.isArray(parsed) ? parsed : [parsed];
      await importRecords(selectedName, recordsToImport, mode);
      await refreshRecords(selectedName);
      setStatus(`Import ${mode} complete`);
    } catch (cause) {
      handleError(cause);
    }
  }

  async function validateAndReport() {
    try {
      setError(undefined);
      const result = await validateData();
      setStatus(`Validated ${Object.keys(result.collections).length} collections`);
    } catch (cause) {
      handleError(cause);
    }
  }

  async function exportAndReport() {
    try {
      setError(undefined);
      const result = await exportStaticBundle();
      setStatus(`Exported to ${result.outputDir}`);
    } catch (cause) {
      handleError(cause);
    }
  }

  async function removeRecord(id: string | number) {
    if (!selectedName) return;
    try {
      setError(undefined);
      await deleteRecord(selectedName, id);
      await refreshRecords(selectedName);
      setStatus("Record deleted");
    } catch (cause) {
      handleError(cause);
    }
  }

  return (
    <main className="swd-dev-shell">
      <CollectionSidebar collections={collections} selectedName={selectedName} onSelect={setSelectedName} />
      <section className="swd-dev-workspace">
        <header className="swd-dev-toolbar">
          <div>
            <h1>{selectedCollection?.name ?? "Static Web Data"}</h1>
            <p>{selectedCollection ? `${selectedCollection.storage.type} · ${selectedCollection.primaryKey}` : "No collection selected"}</p>
          </div>
          <div className="swd-dev-actions">
            <button type="button" onClick={() => refreshRecords()}>Refresh</button>
            <button type="button" onClick={validateAndReport}>Validate</button>
            <button type="button" onClick={exportAndReport}>Export</button>
          </div>
        </header>
        <RecordTable
          collection={selectedCollection}
          records={records}
          onEdit={(record) => setDraft(JSON.stringify(record, null, 2))}
          onDelete={removeRecord}
        />
        <RecordEditor
          value={draft}
          onChange={setDraft}
          onSave={saveDraft}
          onImportReplace={() => importDraft("replace")}
          onImportUpsert={() => importDraft("upsert")}
        />
        <StatusBar status={status} error={error} />
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Add Vite entry files**

Create `packages/dev/src/client/main.tsx`:

```tsx
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./styles.css";

const root = document.querySelector("#root");
if (!root) {
  throw new Error("Missing root element.");
}

createRoot(root).render(<App />);
```

Create `packages/dev/src/client/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Static Web Data</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Add private client CSS**

Create `packages/dev/src/client/styles.css` with a restrained workbench layout:

```css
:root {
  color-scheme: light dark;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

body {
  margin: 0;
  background: Canvas;
  color: CanvasText;
}

button,
textarea {
  font: inherit;
}

.swd-dev-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(220px, 280px) 1fr;
}

.swd-dev-sidebar {
  border-right: 1px solid color-mix(in srgb, CanvasText 14%, transparent);
  padding: 20px;
}

.swd-dev-workspace {
  min-width: 0;
  padding: 24px;
}

.swd-dev-toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.swd-dev-toolbar h1 {
  margin: 0;
  font-size: 24px;
}

.swd-dev-toolbar p {
  margin: 4px 0 0;
  color: color-mix(in srgb, CanvasText 64%, transparent);
}

.swd-dev-actions,
.swd-dev-editor-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.swd-dev-collections {
  display: grid;
  gap: 6px;
  margin-top: 16px;
}

.swd-dev-collections button,
.swd-dev-actions button,
.swd-dev-editor-actions button {
  min-height: 36px;
  border: 1px solid color-mix(in srgb, CanvasText 18%, transparent);
  border-radius: 6px;
  background: Canvas;
  color: CanvasText;
  cursor: pointer;
}

.swd-dev-collections button {
  display: grid;
  text-align: left;
  padding: 10px;
}

.swd-dev-collections .is-active {
  border-color: color-mix(in srgb, Highlight 70%, CanvasText 18%);
  background: color-mix(in srgb, Highlight 12%, Canvas);
}

.swd-dev-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.swd-dev-table th,
.swd-dev-table td {
  padding: 9px 8px;
  border-bottom: 1px solid color-mix(in srgb, CanvasText 12%, transparent);
  text-align: left;
  vertical-align: top;
  overflow-wrap: anywhere;
}

.swd-dev-editor textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 180px;
  margin: 18px 0 10px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, CanvasText 18%, transparent);
  border-radius: 6px;
  background: Canvas;
  color: CanvasText;
}

.swd-dev-status {
  min-height: 22px;
  margin-top: 12px;
  color: color-mix(in srgb, CanvasText 70%, transparent);
}

.swd-dev-status.is-error {
  color: #b42318;
}

.swd-dev-empty {
  padding: 18px 0;
  color: color-mix(in srgb, CanvasText 64%, transparent);
}

@media (max-width: 760px) {
  .swd-dev-shell {
    grid-template-columns: 1fr;
  }

  .swd-dev-sidebar {
    border-right: 0;
    border-bottom: 1px solid color-mix(in srgb, CanvasText 14%, transparent);
  }

  .swd-dev-toolbar {
    display: grid;
  }
}
```

- [ ] **Step 6: Add render-to-string client tests**

Create `packages/dev/src/client/client.test.tsx`:

```tsx
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CollectionSidebar } from "./components/CollectionSidebar.js";
import { RecordEditor } from "./components/RecordEditor.js";
import { RecordTable } from "./components/RecordTable.js";
import { StatusBar } from "./components/StatusBar.js";
import { listRecords } from "./api.js";

describe("dev client", () => {
  it("renders collection navigation, records, editor, and status without consumer CSS", () => {
    const collection = {
      name: "posts",
      primaryKey: "id",
      storage: { type: "json", path: "data/posts.json" },
      fields: [
        { name: "id", metadata: {}, jsonSchema: {} },
        { name: "title", metadata: {}, jsonSchema: {} }
      ],
      jsonSchema: {}
    };

    expect(renderToString(<CollectionSidebar collections={[collection]} selectedName="posts" onSelect={() => undefined} />)).toContain("posts");
    expect(renderToString(<RecordTable collection={collection} records={[{ id: "a", title: "Alpha" }]} onEdit={() => undefined} onDelete={() => undefined} />)).toContain("Alpha");
    expect(renderToString(<RecordEditor value="{}" onChange={() => undefined} onSave={() => undefined} onImportReplace={() => undefined} onImportUpsert={() => undefined} />)).toContain("Save");
    expect(renderToString(<StatusBar status="Ready" />)).toContain("Ready");
  });

  it("builds encoded API paths", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([])));
    vi.stubGlobal("fetch", fetchMock);

    await listRecords("post drafts");

    expect(fetchMock).toHaveBeenCalledWith("/api/collections/post%20drafts/records", undefined);
  });
});
```

- [ ] **Step 7: Run dev client tests**

Run:

```sh
pnpm --filter @whispering233/static-web-data-dev test -- src/client/client.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit client source if using task-level commits**

Run:

```sh
git add packages/dev/src/client
git commit -m "feat: add embedded dev management client"
```

Expected: commit succeeds if this task is being committed separately.

---

### Task 6: Add Dev Client Build Pipeline

**Files:**
- Create: `packages/dev/vite.client.config.ts`
- Modify: `packages/dev/package.json`
- Modify: `packages/dev/tsconfig.json`
- Modify: `packages/dev/tsconfig.build.json`
- Modify: `tsconfig.typecheck.json`

- [ ] **Step 1: Add Vite client build config**

Create `packages/dev/vite.client.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  root: resolve(import.meta.dirname, "src/client"),
  plugins: [react()],
  build: {
    outDir: resolve(import.meta.dirname, "dist/client"),
    emptyOutDir: true
  }
});
```

- [ ] **Step 2: Update dev package scripts and dependencies**

In `packages/dev/package.json`, change `description`:

```json
"description": "Local CLI, dev server, and embedded data management UI for static web data."
```

Add runtime dependencies needed by the server only:

```json
"dependencies": {
  "@hono/node-server": "^1.19.6",
  "@whispering233/static-web-data": "^0.1.0",
  "commander": "^14.0.2",
  "hono": "^4.10.7",
  "jiti": "^2.6.1",
  "zod": "^4.4.2"
}
```

Add dev client build dependencies:

```json
"devDependencies": {
  "@types/react": "^19.2.7",
  "@types/react-dom": "^19.2.3",
  "@vitejs/plugin-react": "^6.0.1",
  "react": "^19.2.5",
  "react-dom": "^19.2.5",
  "tsup": "^8.5.1",
  "typescript": "^6.0.3",
  "vite": "^8.0.10",
  "vitest": "^4.1.5"
}
```

Change build script:

```json
"build": "node ../../scripts/clean-dist.mjs && tsup src/index.ts src/cli.ts --format esm --sourcemap && tsc -p tsconfig.build.json --emitDeclarationOnly && vite build --config vite.client.config.ts"
```

- [ ] **Step 3: Update dev TypeScript config**

In `packages/dev/tsconfig.json`, add JSX support:

```json
"jsx": "react-jsx"
```

Keep `composite`, `rootDir`, `outDir`, and `references`.

In `packages/dev/tsconfig.build.json`, exclude client tests:

```json
"exclude": ["src/**/*.test.ts", "src/**/*.test.tsx"]
```

- [ ] **Step 4: Update root typecheck config if needed**

If `tsconfig.typecheck.json` does not already accept TSX in dev, keep:

```json
"jsx": "react-jsx"
```

It is already present in the current repository; verify it remains.

- [ ] **Step 5: Install dependency changes**

Run:

```sh
pnpm install
```

Expected: `pnpm-lock.yaml` includes dev client build dependencies under `packages/dev`.

- [ ] **Step 6: Build dev package**

Run:

```sh
pnpm --filter @whispering233/static-web-data-dev build
```

Expected: `packages/dev/dist/client/index.html` and `packages/dev/dist/client/assets/*` exist.

- [ ] **Step 7: Verify dev server can serve built client**

Run:

```sh
pnpm --filter @whispering233/static-web-data-dev test -- src/server.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit build pipeline if using task-level commits**

Run:

```sh
git add packages/dev/package.json packages/dev/tsconfig.json packages/dev/tsconfig.build.json packages/dev/vite.client.config.ts pnpm-lock.yaml
git commit -m "build: bundle dev management client"
```

Expected: commit succeeds if this task is being committed separately.

---

### Task 7: Update Docs and Package READMEs

**Files:**
- Modify: `README.md`
- Modify: `packages/core/README.md`
- Modify: `packages/dev/README.md`

- [ ] **Step 1: Update root README package table**

Change the package descriptions:

```md
| `@whispering233/static-web-data` | 核心 schema helper、源数据管理 API、JSON/CSV/SQLite 存储适配器、静态数据包导出器、只读运行时 client。 |
| `@whispering233/static-web-data-dev` | 本地 CLI、dev server、内嵌 React 数据管理界面。 |
| `@whispering233/static-web-data-react` | 最终静态网站可选 React hooks、基础组件和 CSS 模板样式。 |
```

- [ ] **Step 2: Add core storage usage example to root README**

Add after schema example:

````md
## Core 数据管理 API

维护期 Node.js 脚本可以只依赖 core 包，通过 `@whispering233/static-web-data/storage` 读写源数据：

```ts
import config from "./swd.config";
import { createDataRepository } from "@whispering233/static-web-data/storage";

const data = createDataRepository(config, { cwd: process.cwd() });

await data.collection("posts").upsert({
  id: "welcome",
  title: "Welcome",
  published: true
});

await data.exportStaticBundle();
```

`@whispering233/static-web-data/storage` 是 Node-only 入口。浏览器和 React 静态页面仍然只使用 `@whispering233/static-web-data` 的 runtime client 读取导出的静态 JSON。
````

- [ ] **Step 3: Update dev server README text**

In `packages/dev/README.md`, replace the one-line description with:

```md
# @whispering233/static-web-data-dev

CLI, local Hono dev server, and embedded React data management UI for Static Web Data projects.

The dev package loads `swd.config.*`, serves a local maintenance UI, and delegates all source-data reads and writes to `@whispering233/static-web-data/storage`.
```

- [ ] **Step 4: Update core README text**

In `packages/core/README.md`, replace the one-line description with:

```md
# @whispering233/static-web-data

Core schema helpers, Node-only source-data management APIs, static export helpers, and a browser-safe read-only runtime client.

Use `@whispering233/static-web-data/storage` only from Node maintenance scripts or local dev services. Browser code should import from `@whispering233/static-web-data`.
```

- [ ] **Step 5: Run docs API check**

Run:

```sh
pnpm docs:api:check
```

Expected: PASS.

- [ ] **Step 6: Commit docs if using task-level commits**

Run:

```sh
git add README.md packages/core/README.md packages/dev/README.md
git commit -m "docs: document core storage and dev ui"
```

Expected: commit succeeds if this task is being committed separately.

---

### Task 8: Remove Dev Storage API Surface and Verify Pack Contents

**Files:**
- Modify: `packages/dev/src/index.ts`
- Delete: `packages/dev/src/storage/*`
- Modify: `scripts/check-packages.mjs` only if pack validation reveals a real issue with `dist/client`

- [ ] **Step 1: Search for dev storage references**

Run:

```sh
rg "createStorageAdapter|StorageAdapter|./storage|src/storage" packages README.md npm-test
```

Expected: references remain only in core storage files/tests and docs pointing users to `@whispering233/static-web-data/storage`.

- [ ] **Step 2: Verify package build output**

Run:

```sh
pnpm build
```

Expected:

- core builds `dist/storage/index.js` and declarations.
- dev builds `dist/client/index.html`.
- react still builds unchanged.

- [ ] **Step 3: Verify dry pack contents**

Run:

```sh
pnpm pack:dry
```

Expected: PASS. The dev tarball may include `dist/client/**`; it must not include `src/**`, `.github/**`, `scripts/**`, or `npm-test/**`.

- [ ] **Step 4: Run smoke pack**

Run:

```sh
pnpm pack:smoke
```

Expected: PASS. The `npm-test` build must not import `@whispering233/static-web-data/storage` from browser code.

- [ ] **Step 5: Commit cleanup if using task-level commits**

Run:

```sh
git add packages/core packages/dev README.md packages/core/README.md packages/dev/README.md tsconfig.base.json vitest.config.ts typedoc.json pnpm-lock.yaml
git commit -m "chore: remove dev storage surface"
```

Expected: commit succeeds if this task is being committed separately. Remove unchanged paths from the `git add` command before running it.

---

### Task 9: Final Verification

**Files:**
- No new source files.

- [ ] **Step 1: Run typecheck**

Run:

```sh
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 2: Run tests**

Run:

```sh
pnpm test
```

Expected: PASS.

- [ ] **Step 3: Run build**

Run:

```sh
pnpm build
```

Expected: PASS and no manual edits to `dist`.

- [ ] **Step 4: Run API docs check**

Run:

```sh
pnpm docs:api:check
```

Expected: PASS.

- [ ] **Step 5: Run package dry check**

Run:

```sh
pnpm pack:dry
```

Expected: PASS.

- [ ] **Step 6: Run package smoke test**

Run:

```sh
pnpm pack:smoke
```

Expected: PASS.

- [ ] **Step 7: Run complete CI**

Run:

```sh
pnpm run ci
```

Expected: PASS. This is required before claiming implementation complete.

- [ ] **Step 8: Check git status**

Run:

```sh
git status --short --branch
```

Expected: output shows only intentional source/docs/package/lockfile changes, or a clean worktree if task-level commits were used.
