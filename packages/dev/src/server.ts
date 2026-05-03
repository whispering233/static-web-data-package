import { readFile } from "node:fs/promises";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import type { DataPackageDefinition } from "@whispering233/static-web-data/schema";
import { createDataRepository } from "@whispering233/static-web-data/storage";

export type CreateDevAppOptions = {
  config: DataPackageDefinition;
  cwd: string;
  clientDistDir?: string;
};

export type StartDevServerOptions = CreateDevAppOptions & {
  port?: number;
};

export function createDevApp(options: CreateDevAppOptions): Hono {
  const app = new Hono();
  const repository = createDataRepository(options.config, { cwd: options.cwd });
  const clientDistDir = options.clientDistDir ?? join(dirname(fileURLToPath(import.meta.url)), "client");

  app.get("/", async (context) => {
    const html = await readFile(join(clientDistDir, "index.html"), "utf8");
    return context.html(html);
  });

  app.get("/favicon.ico", (context) => context.body(null, 204));

  app.get("/assets/*", async (context) => {
    const assetPath = resolveClientAssetPath(clientDistDir, new URL(context.req.url).pathname);
    if (!assetPath) {
      return context.text("Not found", 404);
    }
    try {
      const file = await readFile(assetPath);
      return new Response(file, {
        headers: { "content-type": contentTypeFor(assetPath) }
      });
    } catch {
      return context.text("Not found", 404);
    }
  });

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

  app.delete("/api/collections/:name/records/:id", async (context) => {
    await repository.collection(context.req.param("name")).delete(context.req.param("id"));
    return context.json({ ok: true });
  });

  app.post("/api/collections/:name/import", async (context) => {
    const body = (await context.req.json()) as { records?: unknown[]; mode?: "replace" | "upsert" };
    if (!Array.isArray(body.records)) {
      return context.json({ error: "Import body must include a records array." }, 400);
    }
    if (body.mode !== "replace" && body.mode !== "upsert") {
      return context.json({ error: 'Import body mode must be "replace" or "upsert".' }, 400);
    }
    const adapter = repository.collection(context.req.param("name"));
    if (body.mode === "upsert") {
      const saved = [];
      for (const record of body.records) {
        saved.push(await adapter.upsert(record));
      }
      return context.json(saved);
    }
    return context.json(await adapter.writeAll(body.records));
  });

  app.get("/api/collections/:name/export", async (context) => {
    return context.json(await repository.collection(context.req.param("name")).readAll());
  });

  app.get("/api/validate", async (context) => context.json(await repository.validate()));

  app.post("/api/export", async (context) => context.json(await repository.exportStaticBundle()));

  app.onError((error, context) => {
    const status = /Unknown collection/.test(error.message) ? 404 : 400;
    return context.json({ error: error.message }, status);
  });

  return app;
}

export async function startDevServer(options: StartDevServerOptions): Promise<{ port: number; close(): void }> {
  const port = options.port ?? 4321;
  const app = createDevApp(options);
  const server = serve({ fetch: app.fetch, port });
  return {
    port,
    close() {
      server.close();
    }
  };
}

function resolveClientAssetPath(clientDistDir: string, pathname: string): string | undefined {
  if (!pathname.startsWith("/assets/")) {
    return undefined;
  }
  let relativePath: string;
  try {
    relativePath = decodeURIComponent(pathname.slice("/assets/".length));
  } catch (error) {
    if (error instanceof URIError) {
      return undefined;
    }
    throw error;
  }
  const root = resolve(clientDistDir, "assets");
  const assetPath = resolve(root, relativePath);
  return assetPath.startsWith(`${root}${sep}`) ? assetPath : undefined;
}

function contentTypeFor(filePath: string): string {
  switch (extname(filePath)) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
    case ".mjs":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}
