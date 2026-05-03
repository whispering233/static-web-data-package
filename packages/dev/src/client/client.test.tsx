import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { listRecords, saveRecord, deleteRecord, importRecords } from "./api.js";
import {
  App,
  confirmDeleteRecord,
  confirmImportReplace,
  resolveSuccessMessage,
  selectedRecordId
} from "./App.js";
import { CollectionSidebar } from "./components/CollectionSidebar.js";
import { RecordEditor } from "./components/RecordEditor.js";
import { RecordTable } from "./components/RecordTable.js";
import { StatusBar } from "./components/StatusBar.js";

const collections = [
  {
    name: "blog posts",
    primaryKey: "slug",
    storage: { type: "json", path: "posts.json" },
    fields: [
      { name: "slug", metadata: {}, jsonSchema: {} },
      { name: "title", metadata: {}, jsonSchema: {} }
    ],
    jsonSchema: {}
  },
  {
    name: "authors",
    primaryKey: "id",
    storage: { type: "csv", path: "authors.csv" },
    fields: [{ name: "id", metadata: {}, jsonSchema: {} }],
    jsonSchema: {}
  }
] as const;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("dev client components", () => {
  it("renders the workbench shell and key components without consumer CSS", () => {
    const app = renderToString(<App />);
    const sidebar = renderToString(
      <CollectionSidebar collections={[...collections]} selectedName="blog posts" onSelect={() => undefined} />
    );
    const table = renderToString(
      <RecordTable
        collection={collections[0]}
        records={[{ slug: "intro", title: "Intro" }]}
        selectedRecord={{ slug: "intro", title: "Intro" }}
        onSelect={() => undefined}
      />
    );
    const editor = renderToString(
      <RecordEditor
        value={'{"slug":"intro"}'}
        onChange={() => undefined}
        onSave={() => undefined}
        onDelete={() => undefined}
        onImportReplace={() => undefined}
        onImportUpsert={() => undefined}
        canDelete={true}
        pending={false}
      />
    );
    const status = renderToString(<StatusBar message="Loaded" error="Nope" />);

    expect(app).toContain("swd-dev-app");
    expect(sidebar).toContain("blog posts");
    expect(sidebar).toContain("json");
    expect(sidebar).toContain("slug");
    expect(table.indexOf("slug")).toBeLessThan(table.indexOf("title"));
    expect(table).toContain("Intro");
    expect(editor).toContain("Import replace");
    expect(editor).toContain("Save/upsert");
    expect(editor).toContain("Delete");
    expect(status).toContain("Loaded");
    expect(status).toContain("Nope");
  });

  it("derives destructive confirmation text and detailed success status", () => {
    const messages: string[] = [];
    const confirm = (message: string) => {
      messages.push(message);
      return true;
    };

    expect(selectedRecordId(collections[0], { slug: "intro", title: "Intro" })).toBe("intro");
    expect(confirmDeleteRecord(confirm, "blog posts", "intro")).toBe(true);
    expect(confirmImportReplace(confirm, "blog posts", 2)).toBe(true);
    expect(resolveSuccessMessage("Generic", "Detailed validation result")).toBe("Detailed validation result");
    expect(messages[0]).toContain('Delete record "intro" from collection "blog posts"');
    expect(messages[1]).toContain('replace all records in collection "blog posts" with 2 records');
  });
});

describe("dev client API wrapper", () => {
  it("encodes collection names and record ids in API paths", async () => {
    const calls: Array<{ input: RequestInfo | URL; init: RequestInit | undefined }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ input, init });
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      })
    );

    await listRecords("blog posts");
    await saveRecord("blog posts", { slug: "hello world" });
    await deleteRecord("blog posts", "hello/world");
    await importRecords("blog posts", [{ slug: "a" }], "upsert");

    expect(calls.map((call) => String(call.input))).toEqual([
      "/api/collections/blog%20posts/records",
      "/api/collections/blog%20posts/records",
      "/api/collections/blog%20posts/records/hello%2Fworld",
      "/api/collections/blog%20posts/import"
    ]);
    expect(calls[1]?.init?.method).toBe("POST");
    expect(calls[2]?.init?.method).toBe("DELETE");
    expect(JSON.parse(String(calls[3]?.init?.body))).toEqual({ records: [{ slug: "a" }], mode: "upsert" });
  });

  it("throws response error bodies when API requests fail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: "Collection not found" }), {
          status: 404,
          headers: { "content-type": "application/json" }
        })
      )
    );

    await expect(listRecords("missing")).rejects.toThrow("Collection not found");
  });
});
