import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
    published: z.boolean().default(false),
    flagText: z.string(),
    numberText: z.string(),
    jsonText: z.string(),
    metadata: z.object({ featured: z.boolean(), rank: z.number() }),
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

      await adapter.writeAll([
        {
          id: "a",
          title: "Alpha",
          count: 1,
          published: true,
          flagText: "true",
          numberText: "123",
          jsonText: "{\"kind\":\"literal\"}",
          metadata: { featured: true, rank: 1 },
          tags: ["news"]
        }
      ]);
      await adapter.upsert({
        id: "b",
        title: "Beta",
        count: 2,
        published: false,
        flagText: "false",
        numberText: "456",
        jsonText: "[\"literal\"]",
        metadata: { featured: false, rank: 2 },
        tags: []
      });
      await adapter.delete("a");

      expect(await adapter.readAll()).toEqual([
        {
          id: "b",
          title: "Beta",
          count: 2,
          published: false,
          flagText: "false",
          numberText: "456",
          jsonText: "[\"literal\"]",
          metadata: { featured: false, rank: 2 },
          tags: []
        }
      ]);
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

      await adapter.writeAll([
        {
          id: "a",
          title: "Alpha",
          count: 1,
          published: true,
          flagText: "true",
          numberText: "123",
          jsonText: "{\"kind\":\"literal\"}",
          metadata: { featured: true, rank: 1 },
          tags: ["news", "docs"]
        }
      ]);

      const csv = await readFile(join(dir, "records.csv"), "utf8");
      expect(csv).toContain("id,title,count,published,flagText,numberText,jsonText,metadata,tags");
      expect(csv).toContain("\"{\"\"featured\"\":true,\"\"rank\"\":1}\"");
      expect(csv).toContain("\"[\"\"news\"\",\"\"docs\"\"]\"");
      expect(await adapter.readAll()).toEqual([
        {
          id: "a",
          title: "Alpha",
          count: 1,
          published: true,
          flagText: "true",
          numberText: "123",
          jsonText: "{\"kind\":\"literal\"}",
          metadata: { featured: true, rank: 1 },
          tags: ["news", "docs"]
        }
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("roundtrips CSV blank cells for optional default and nullable typed fields", async () => {
    const dir = await mkdtemp(join(tmpdir(), "swd-csv-blanks-"));
    try {
      const blankSchema = z.object({
        id: z.string(),
        emptyText: z.string(),
        optionalNumber: z.number().optional(),
        defaultNumber: z.number().default(7),
        nullableNumber: z.number().nullable(),
        optionalBoolean: z.boolean().optional(),
        defaultBoolean: z.boolean().default(true),
        nullableBoolean: z.boolean().nullable(),
        optionalObject: z.object({ enabled: z.boolean() }).optional(),
        defaultObject: z.object({ enabled: z.boolean() }).default({ enabled: true }),
        nullableObject: z.object({ enabled: z.boolean() }).nullable(),
        optionalArray: z.array(z.string()).optional(),
        defaultArray: z.array(z.string()).default(["default"]),
        nullableArray: z.array(z.string()).nullable()
      });
      const collection = defineCollection({
        primaryKey: "id",
        storage: { type: "csv", path: "records.csv" },
        schema: blankSchema
      });
      const adapter = createStorageAdapter("posts", collection, { cwd: dir });
      const columns = [
        "id",
        "emptyText",
        "optionalNumber",
        "defaultNumber",
        "nullableNumber",
        "optionalBoolean",
        "defaultBoolean",
        "nullableBoolean",
        "optionalObject",
        "defaultObject",
        "nullableObject",
        "optionalArray",
        "defaultArray",
        "nullableArray"
      ];

      await writeFile(join(dir, "records.csv"), `${columns.join(",")}\n${["a", ...Array(columns.length - 1).fill("")].join(",")}\n`, "utf8");
      expect(await adapter.readAll()).toEqual([
        {
          id: "a",
          emptyText: "",
          defaultNumber: 7,
          nullableNumber: null,
          defaultBoolean: true,
          nullableBoolean: null,
          defaultObject: { enabled: true },
          nullableObject: null,
          defaultArray: ["default"],
          nullableArray: null
        }
      ]);
      await adapter.upsert({
        id: "b",
        emptyText: "",
        optionalNumber: 3,
        defaultNumber: 4,
        nullableNumber: 5,
        optionalBoolean: false,
        defaultBoolean: false,
        nullableBoolean: true,
        optionalObject: { enabled: false },
        defaultObject: { enabled: false },
        nullableObject: { enabled: true },
        optionalArray: ["custom"],
        defaultArray: ["custom-default"],
        nullableArray: ["nullable"]
      });

      expect(await adapter.readAll()).toEqual([
        {
          id: "a",
          emptyText: "",
          defaultNumber: 7,
          nullableNumber: null,
          defaultBoolean: true,
          nullableBoolean: null,
          defaultObject: { enabled: true },
          nullableObject: null,
          defaultArray: ["default"],
          nullableArray: null
        },
        {
          id: "b",
          emptyText: "",
          optionalNumber: 3,
          defaultNumber: 4,
          nullableNumber: 5,
          optionalBoolean: false,
          defaultBoolean: false,
          nullableBoolean: true,
          optionalObject: { enabled: false },
          defaultObject: { enabled: false },
          nullableObject: { enabled: true },
          optionalArray: ["custom"],
          defaultArray: ["custom-default"],
          nullableArray: ["nullable"]
        }
      ]);
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

      await adapter.writeAll([
        {
          id: "a",
          title: "Alpha",
          count: 1,
          published: true,
          flagText: "true",
          numberText: "123",
          jsonText: "{\"kind\":\"literal\"}",
          metadata: { featured: true, rank: 1 },
          tags: ["news"]
        }
      ]);
      await adapter.upsert({
        id: "b",
        title: "Beta",
        count: 2,
        published: false,
        flagText: "false",
        numberText: "456",
        jsonText: "[\"literal\"]",
        metadata: { featured: false, rank: 2 },
        tags: []
      });

      expect(await adapter.readAll()).toEqual([
        {
          id: "a",
          title: "Alpha",
          count: 1,
          published: true,
          flagText: "true",
          numberText: "123",
          jsonText: "{\"kind\":\"literal\"}",
          metadata: { featured: true, rank: 1 },
          tags: ["news"]
        },
        {
          id: "b",
          title: "Beta",
          count: 2,
          published: false,
          flagText: "false",
          numberText: "456",
          jsonText: "[\"literal\"]",
          metadata: { featured: false, rank: 2 },
          tags: []
        }
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("data repository", () => {
  const posts = defineCollection({
    primaryKey: "id",
    storage: { type: "json", path: "data/posts.json" },
    schema: z.object({
      id: z.string(),
      title: z.string(),
      count: z.number()
    })
  });

  const dataPackage = defineDataPackage({
    output: "dist-data",
    collections: { posts }
  });

  it("lists collection descriptors", async () => {
    const repository = createDataRepository(dataPackage);

    expect(repository.listCollections()).toEqual([
      expect.objectContaining({
        name: "posts",
        primaryKey: "id",
        storage: { type: "json", path: "data/posts.json" }
      })
    ]);
  });

  it("writes, reads, and validates collection records", async () => {
    const dir = await mkdtemp(join(tmpdir(), "swd-repo-"));
    try {
      const repository = createDataRepository(dataPackage, { cwd: dir });
      const collection = repository.collection("posts");

      await collection.writeAll([{ id: "a", title: "Alpha", count: 1 }]);

      expect(await collection.readAll()).toEqual([{ id: "a", title: "Alpha", count: 1 }]);
      await expect(repository.validate()).resolves.toEqual({
        collections: {
          posts: 1
        }
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("exports static bundles from source storage", async () => {
    const dir = await mkdtemp(join(tmpdir(), "swd-export-"));
    try {
      const generatedAt = new Date("2026-05-03T00:00:00.000Z");
      const repository = createDataRepository(dataPackage, { cwd: dir });

      await repository.collection("posts").writeAll([
        { id: "a", title: "Alpha", count: 1 },
        { id: "b", title: "Beta", count: 2 }
      ]);

      await repository.exportStaticBundle({ generatedAt });

      const manifest = JSON.parse(await readFile(join(dir, "dist-data", "manifest.json"), "utf8"));
      const records = JSON.parse(await readFile(join(dir, "dist-data", "collections", "posts.json"), "utf8"));

      expect(manifest.generatedAt).toBe("2026-05-03T00:00:00.000Z");
      expect(manifest.collections.posts).toMatchObject({
        primaryKey: "id",
        path: "collections/posts.json",
        count: 2
      });
      expect(records).toEqual([
        { id: "a", title: "Alpha", count: 1 },
        { id: "b", title: "Beta", count: 2 }
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("throws for unknown collections", () => {
    const repository = createDataRepository(dataPackage);

    expect(() => repository.collection("missing")).toThrow('Unknown collection "missing"');
  });
});
