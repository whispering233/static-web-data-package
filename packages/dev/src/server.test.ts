import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineCollection, defineDataPackage } from "@whispering233/static-web-data/schema";
import { createDevApp } from "./server.js";

describe("dev server app", () => {
  it("exposes collection metadata and CRUD API", async () => {
    const dir = await mkdtemp(join(tmpdir(), "swd-server-"));
    try {
      const config = defineDataPackage({
        output: "public/static-web-data",
        collections: {
          posts: defineCollection({
            primaryKey: "id",
            storage: { type: "json", path: "posts.json" },
            schema: z.object({ id: z.string(), title: z.string().min(1) })
          })
        }
      });
      const app = createDevApp({ config, cwd: dir });

      const createResponse = await app.request("/api/collections/posts/records", {
        method: "POST",
        body: JSON.stringify({ id: "a", title: "Alpha" }),
        headers: { "content-type": "application/json" }
      });
      expect(createResponse.status).toBe(200);

      const recordsResponse = await app.request("/api/collections/posts/records");
      expect(await recordsResponse.json()).toEqual([{ id: "a", title: "Alpha" }]);

      const collectionsResponse = await app.request("/api/collections");
      const collections = await collectionsResponse.json();
      expect(collections[0]).toMatchObject({ name: "posts", primaryKey: "id" });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
