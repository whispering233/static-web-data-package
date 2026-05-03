import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineCollection, defineDataPackage } from "@whispering233/static-web-data/schema";
import { createDevApp, startDevServer } from "./server.js";

vi.mock("@hono/node-server", () => ({
  serve: vi.fn(() => ({ close: vi.fn() }))
}));

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

  it("binds the dev server to loopback by default", async () => {
    const config = defineDataPackage({
      output: "public/static-web-data",
      collections: {}
    });

    await startDevServer({ config, cwd: process.cwd(), port: 8765 });

    expect(serve).toHaveBeenCalledWith(expect.objectContaining({ hostname: "127.0.0.1", port: 8765 }));
  });

  it("rejects cross-origin mutating API requests", async () => {
    const dir = await mkdtemp(join(tmpdir(), "swd-server-origin-"));
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

      const postResponse = await app.request("http://127.0.0.1:4321/api/collections/posts/records", {
        method: "POST",
        body: JSON.stringify({ id: "a", title: "Alpha" }),
        headers: { "content-type": "application/json", origin: "http://example.test" }
      });
      const deleteResponse = await app.request("http://127.0.0.1:4321/api/collections/posts/records/a", {
        method: "DELETE",
        headers: { origin: "http://example.test" }
      });

      expect(postResponse.status).toBe(403);
      expect(await postResponse.json()).toEqual({ error: "Cross-origin mutating requests are not allowed." });
      expect(deleteResponse.status).toBe(403);
      expect(await deleteResponse.json()).toEqual({ error: "Cross-origin mutating requests are not allowed." });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects cross-origin export requests", async () => {
    const dir = await mkdtemp(join(tmpdir(), "swd-server-export-origin-"));
    try {
      const config = defineDataPackage({
        output: "public/static-web-data",
        collections: {}
      });
      const app = createDevApp({ config, cwd: dir });

      const response = await app.request("http://127.0.0.1:4321/api/export", {
        method: "POST",
        headers: { origin: "http://example.test" }
      });

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "Cross-origin mutating requests are not allowed." });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("allows same-origin mutating API requests", async () => {
    const dir = await mkdtemp(join(tmpdir(), "swd-server-same-origin-"));
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

      const response = await app.request("http://127.0.0.1:4321/api/collections/posts/records", {
        method: "POST",
        body: JSON.stringify({ id: "a", title: "Alpha" }),
        headers: { "content-type": "application/json", origin: "http://127.0.0.1:4321" }
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ id: "a", title: "Alpha" });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("allows same-origin export requests without a JSON content type", async () => {
    const dir = await mkdtemp(join(tmpdir(), "swd-server-export-same-origin-"));
    try {
      const config = defineDataPackage({
        output: "public/static-web-data",
        collections: {}
      });
      const app = createDevApp({ config, cwd: dir });

      const response = await app.request("http://127.0.0.1:4321/api/export", {
        method: "POST",
        headers: { origin: "http://127.0.0.1:4321" }
      });

      expect(response.status).toBe(200);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects non-json POST bodies for JSON mutation routes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "swd-server-content-type-"));
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

      const response = await app.request("/api/collections/posts/records", {
        method: "POST",
        body: JSON.stringify({ id: "a", title: "Alpha" }),
        headers: { "content-type": "text/plain" }
      });

      expect(response.status).toBe(415);
      expect(await response.json()).toEqual({ error: "JSON mutation requests must use application/json." });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects non-json import requests", async () => {
    const dir = await mkdtemp(join(tmpdir(), "swd-server-import-content-type-"));
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

      const response = await app.request("/api/collections/posts/import", {
        method: "POST",
        body: JSON.stringify({ mode: "replace", records: [] }),
        headers: { "content-type": "text/plain" }
      });

      expect(response.status).toBe(415);
      expect(await response.json()).toEqual({ error: "JSON mutation requests must use application/json." });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects untrusted Host on mutating API requests", async () => {
    const dir = await mkdtemp(join(tmpdir(), "swd-server-host-"));
    try {
      const config = defineDataPackage({
        output: "public/static-web-data",
        collections: {}
      });
      const app = createDevApp({ config, cwd: dir });

      const response = await app.request("http://evil.test/api/export", {
        method: "POST"
      });

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "Mutating API requests must use a trusted Host." });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does not partially write upsert imports when a later record is invalid", async () => {
    const dir = await mkdtemp(join(tmpdir(), "swd-server-import-atomic-"));
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

      const importResponse = await app.request("/api/collections/posts/import", {
        method: "POST",
        body: JSON.stringify({
          mode: "upsert",
          records: [
            { id: "b", title: "Beta" },
            { id: "c", title: "" }
          ]
        }),
        headers: { "content-type": "application/json" }
      });
      const recordsResponse = await app.request("/api/collections/posts/records");

      expect(importResponse.status).toBe(400);
      expect(await recordsResponse.json()).toEqual([{ id: "a", title: "Alpha" }]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
