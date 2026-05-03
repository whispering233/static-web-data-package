import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineCollection, defineDataPackage } from "@whispering233/static-web-data/schema";
import { createDevApp } from "./server.js";

describe("dev server app", () => {
  it("serves built client HTML and assets", async () => {
    const dir = await mkdtemp(join(tmpdir(), "swd-server-client-"));
    try {
      const clientDistDir = join(dir, "client");
      await mkdir(join(clientDistDir, "assets"), { recursive: true });
      await writeFile(join(clientDistDir, "index.html"), "<!doctype html><div id=\"root\"></div>", "utf8");
      await writeFile(join(clientDistDir, "assets", "app.js"), "console.log('client');", "utf8");
      const config = defineDataPackage({
        output: "public/static-web-data",
        collections: {}
      });
      const app = createDevApp({ config, cwd: dir, clientDistDir });

      const htmlResponse = await app.request("/");
      const assetResponse = await app.request("/assets/app.js");
      const escapedAssetResponse = await app.request("/assets/%2e%2e/index.html");
      const malformedAssetResponse = await app.request("/assets/%");
      const faviconResponse = await app.request("/favicon.ico");

      expect(htmlResponse.status).toBe(200);
      expect(htmlResponse.headers.get("content-type")).toContain("text/html");
      expect(await htmlResponse.text()).toContain("root");
      expect(assetResponse.status).toBe(200);
      expect(assetResponse.headers.get("content-type")).toContain("javascript");
      expect(await assetResponse.text()).toContain("client");
      expect(escapedAssetResponse.status).toBe(404);
      expect(malformedAssetResponse.status).toBe(404);
      expect(faviconResponse.status).not.toBe(404);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

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

  it("rejects import requests with missing or unknown mode before writing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "swd-server-import-"));
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

      await app.request("/api/collections/posts/records", {
        method: "POST",
        body: JSON.stringify({ id: "a", title: "Alpha" }),
        headers: { "content-type": "application/json" }
      });

      const missingModeResponse = await app.request("/api/collections/posts/import", {
        method: "POST",
        body: JSON.stringify({ records: [{ id: "b", title: "Beta" }] }),
        headers: { "content-type": "application/json" }
      });
      const unknownModeResponse = await app.request("/api/collections/posts/import", {
        method: "POST",
        body: JSON.stringify({ records: [{ id: "c", title: "Gamma" }], mode: "merge" }),
        headers: { "content-type": "application/json" }
      });
      const recordsResponse = await app.request("/api/collections/posts/records");

      expect(missingModeResponse.status).toBe(400);
      expect(await missingModeResponse.json()).toEqual({ error: 'Import body mode must be "replace" or "upsert".' });
      expect(unknownModeResponse.status).toBe(400);
      expect(await unknownModeResponse.json()).toEqual({ error: 'Import body mode must be "replace" or "upsert".' });
      expect(await recordsResponse.json()).toEqual([{ id: "a", title: "Alpha" }]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
