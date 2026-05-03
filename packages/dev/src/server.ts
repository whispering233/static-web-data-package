import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { describeDataPackage, type DataPackageDefinition } from "@whispering233/static-web-data/schema";
import { exportStaticData, validateProjectData } from "./commands.js";
import { createStorageAdapter } from "./storage/index.js";

export type CreateDevAppOptions = {
  config: DataPackageDefinition;
  cwd: string;
};

export type StartDevServerOptions = CreateDevAppOptions & {
  port?: number;
};

export function createDevApp(options: CreateDevAppOptions): Hono {
  const app = new Hono();

  app.get("/", (context) => context.html(createMaintenanceHtml()));

  app.get("/api/collections", (context) => context.json(describeDataPackage(options.config)));

  app.get("/api/collections/:name/records", async (context) => {
    const { name, collection } = getCollection(options.config, context.req.param("name"));
    const records = await createStorageAdapter(name, collection, options.cwd).readAll();
    return context.json(records);
  });

  app.post("/api/collections/:name/records", async (context) => {
    const { name, collection } = getCollection(options.config, context.req.param("name"));
    const record = await context.req.json();
    const saved = await createStorageAdapter(name, collection, options.cwd).upsert(record);
    return context.json(saved);
  });

  app.delete("/api/collections/:name/records/:id", async (context) => {
    const { name, collection } = getCollection(options.config, context.req.param("name"));
    await createStorageAdapter(name, collection, options.cwd).delete(context.req.param("id"));
    return context.json({ ok: true });
  });

  app.post("/api/collections/:name/import", async (context) => {
    const { name, collection } = getCollection(options.config, context.req.param("name"));
    const body = (await context.req.json()) as { records?: unknown[]; mode?: "replace" | "upsert" };
    if (!Array.isArray(body.records)) {
      return context.json({ error: "Import body must include a records array." }, 400);
    }
    const adapter = createStorageAdapter(name, collection, options.cwd);
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
    const { name, collection } = getCollection(options.config, context.req.param("name"));
    return context.json(await createStorageAdapter(name, collection, options.cwd).readAll());
  });

  app.get("/api/validate", async (context) => context.json(await validateProjectData(options.config, options.cwd)));

  app.post("/api/export", async (context) => context.json(await exportStaticData(options.config, options.cwd)));

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

function getCollection(config: DataPackageDefinition, name: string) {
  const collection = config.collections[name];
  if (!collection) {
    throw new Error(`Unknown collection "${name}".`);
  }
  return { name, collection };
}

function createMaintenanceHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Static Web Data</title>
    <style>
      :root { color-scheme: light dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
      body { margin: 0; background: Canvas; color: CanvasText; }
      main { max-width: 1120px; margin: 0 auto; padding: 32px 20px; }
      header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 24px; }
      h1 { margin: 0; font-size: 24px; }
      select, button, textarea, input { font: inherit; }
      button, select { min-height: 36px; padding: 0 12px; border: 1px solid color-mix(in srgb, CanvasText 22%, transparent); border-radius: 6px; background: Canvas; color: CanvasText; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      th, td { text-align: left; border-bottom: 1px solid color-mix(in srgb, CanvasText 14%, transparent); padding: 10px 8px; vertical-align: top; }
      textarea { box-sizing: border-box; width: 100%; min-height: 160px; margin-top: 18px; padding: 12px; border-radius: 6px; border: 1px solid color-mix(in srgb, CanvasText 18%, transparent); }
      .toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
      .status { margin-top: 12px; min-height: 22px; color: color-mix(in srgb, CanvasText 72%, transparent); }
    </style>
  </head>
  <body>
    <main>
      <header>
        <h1>Static Web Data</h1>
        <div class="toolbar">
          <select id="collection"></select>
          <button id="refresh">Refresh</button>
          <button id="validate">Validate</button>
          <button id="export">Export static bundle</button>
        </div>
      </header>
      <div id="status" class="status"></div>
      <table id="records"></table>
      <textarea id="editor" spellcheck="false" placeholder='{"id":"new","title":"New record"}'></textarea>
      <div class="toolbar" style="margin-top: 10px;">
        <button id="save">Save JSON record</button>
      </div>
    </main>
    <script>
      const collectionSelect = document.querySelector("#collection");
      const statusEl = document.querySelector("#status");
      const table = document.querySelector("#records");
      const editor = document.querySelector("#editor");
      let collections = [];

      async function api(path, init) {
        const response = await fetch(path, init);
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || response.statusText);
        return body;
      }

      function setStatus(message) { statusEl.textContent = message; }

      async function loadCollections() {
        collections = await api("/api/collections");
        collectionSelect.innerHTML = collections.map((item) => '<option value="' + item.name + '">' + item.name + '</option>').join("");
        await loadRecords();
      }

      async function loadRecords() {
        const name = collectionSelect.value;
        if (!name) return;
        const records = await api("/api/collections/" + encodeURIComponent(name) + "/records");
        const columns = Array.from(records.reduce((set, record) => {
          Object.keys(record).forEach((key) => set.add(key));
          return set;
        }, new Set()));
        table.innerHTML = "<thead><tr>" + columns.map((column) => "<th>" + column + "</th>").join("") + "</tr></thead>" +
          "<tbody>" + records.map((record) => "<tr>" + columns.map((column) => "<td>" + JSON.stringify(record[column] ?? "") + "</td>").join("") + "</tr>").join("") + "</tbody>";
        setStatus(records.length + " records loaded.");
      }

      document.querySelector("#refresh").addEventListener("click", () => loadRecords().catch((error) => setStatus(error.message)));
      document.querySelector("#validate").addEventListener("click", () => api("/api/validate").then((result) => setStatus(JSON.stringify(result.collections))).catch((error) => setStatus(error.message)));
      document.querySelector("#export").addEventListener("click", () => api("/api/export", { method: "POST" }).then((result) => setStatus("Exported to " + result.outputDir)).catch((error) => setStatus(error.message)));
      document.querySelector("#save").addEventListener("click", () => {
        const name = collectionSelect.value;
        api("/api/collections/" + encodeURIComponent(name) + "/records", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: editor.value
        }).then(() => loadRecords()).catch((error) => setStatus(error.message));
      });
      collectionSelect.addEventListener("change", () => loadRecords().catch((error) => setStatus(error.message)));
      loadCollections().catch((error) => setStatus(error.message));
    </script>
  </body>
</html>`;
}
