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
  hostname?: string;
  port?: number;
  trustedHosts?: string[];
  trustedOrigins?: string[];
};

export type StartDevServerOptions = CreateDevAppOptions;

export function createDevApp(options: CreateDevAppOptions): Hono {
  const app = new Hono();
  const repository = createDataRepository(options.config, { cwd: options.cwd });
  const clientDistDir = options.clientDistDir ?? join(dirname(fileURLToPath(import.meta.url)), "client");
  const trustedAccess = createTrustedAccess(options);

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

  app.use("/api/*", async (context, next) => {
    if (!isMutatingRequest(context.req.raw)) {
      return next();
    }

    if (!isTrustedHost(context.req.header("host") ?? new URL(context.req.url).host, trustedAccess)) {
      return context.json({ error: "Mutating API requests must use a trusted Host." }, 403);
    }

    const origin = context.req.header("origin");
    if (origin && !trustedAccess.origins.has(origin)) {
      return context.json({ error: "Cross-origin mutating requests are not allowed." }, 403);
    }

    if (requiresJsonBody(context.req.raw) && !isJsonContentType(context.req.header("content-type"))) {
      return context.json({ error: "JSON mutation requests must use application/json." }, 415);
    }

    return next();
  });

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
      return context.json(await adapter.upsertAll(body.records));
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

export async function startDevServer(options: StartDevServerOptions): Promise<{ port: number; hostname: string; close(): void }> {
  const port = options.port ?? 4321;
  const hostname = options.hostname ?? "127.0.0.1";
  const app = createDevApp({ ...options, hostname, port });
  const server = serve({ fetch: app.fetch, hostname, port });
  return {
    hostname,
    port,
    close() {
      server.close();
    }
  };
}

function isMutatingRequest(request: Request): boolean {
  const pathname = new URL(request.url).pathname;
  return pathname.startsWith("/api/") && (request.method === "POST" || request.method === "DELETE");
}

function requiresJsonBody(request: Request): boolean {
  const pathname = new URL(request.url).pathname;
  return request.method === "POST" && /^\/api\/collections\/[^/]+\/(?:records|import)$/.test(pathname);
}

function isJsonContentType(contentType: string | undefined): boolean {
  return contentType?.split(";")[0]?.trim().toLowerCase() === "application/json";
}

type TrustedAccess = {
  hostnames: Set<string>;
  origins: Set<string>;
  port: string;
};

function createTrustedAccess(options: CreateDevAppOptions): TrustedAccess {
  const port = String(options.port ?? 4321);
  const configuredHostname = normalizeHostname(options.hostname ?? "127.0.0.1");
  const hostnames = new Set([configuredHostname, ...normalizeHostnames(options.trustedHosts ?? [])]);
  if (isLoopbackHostname(configuredHostname) || configuredHostname === "0.0.0.0" || configuredHostname === "::") {
    for (const alias of ["127.0.0.1", "localhost", "::1"]) {
      hostnames.add(alias);
    }
  }
  const origins = new Set([
    ...Array.from(hostnames, (hostname) => `http://${formatHostnameForOrigin(hostname)}:${port}`),
    ...(options.trustedOrigins ?? [])
  ]);
  return { hostnames, origins, port };
}

function normalizeHostnames(hosts: string[]): string[] {
  return hosts.map((host) => parseHost(host).hostname).filter((host) => host.length > 0);
}

function isTrustedHost(host: string, trustedAccess: TrustedAccess): boolean {
  const parsed = parseHost(host);
  return trustedAccess.hostnames.has(parsed.hostname) && (!parsed.port || parsed.port === trustedAccess.port);
}

function parseHost(host: string): { hostname: string; port?: string } {
  const value = host.trim().toLowerCase();
  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    if (end >= 0) {
      const hostname = normalizeHostname(value.slice(1, end));
      const rest = value.slice(end + 1);
      if (rest.startsWith(":")) {
        return { hostname, port: rest.slice(1) };
      }
      return { hostname };
    }
  }
  const parts = value.split(":");
  if (parts.length === 2) {
    const hostname = normalizeHostname(parts[0] ?? "");
    const port = parts[1];
    return port ? { hostname, port } : { hostname };
  }
  return { hostname: normalizeHostname(value) };
}

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^\[(.*)\]$/, "$1");
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function formatHostnameForOrigin(hostname: string): string {
  return hostname.includes(":") ? `[${hostname}]` : hostname;
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
