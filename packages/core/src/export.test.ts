import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineCollection, defineDataPackage } from "./schema.js";
import { writeStaticBundle } from "./export.js";

describe("static bundle export", () => {
  it("writes manifest and collection JSON files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "swd-core-"));
    try {
      const posts = defineCollection({
        primaryKey: "id",
        storage: { type: "json", path: "data/posts.json" },
        schema: z.object({ id: z.string(), title: z.string() })
      });
      const dataPackage = defineDataPackage({
        output: dir,
        collections: { posts }
      });

      await writeStaticBundle(dataPackage, {
        posts: [
          { id: "a", title: "Alpha" },
          { id: "b", title: "Beta" }
        ]
      });

      const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"));
      const records = JSON.parse(await readFile(join(dir, "collections", "posts.json"), "utf8"));

      expect(manifest.collections.posts).toMatchObject({
        primaryKey: "id",
        path: "collections/posts.json",
        count: 2
      });
      expect(manifest.collections.posts.schemaHash).toHaveLength(64);
      expect(records).toEqual([
        { id: "a", title: "Alpha" },
        { id: "b", title: "Beta" }
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
