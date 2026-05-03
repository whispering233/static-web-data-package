import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineCollection } from "@whispering233/static-web-data/schema";
import { createStorageAdapter } from "./storage/index.js";

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
      const adapter = createStorageAdapter("posts", collection, dir);

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
      const adapter = createStorageAdapter("posts", collection, dir);

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
      const adapter = createStorageAdapter("posts", collection, dir);

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
