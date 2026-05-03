import { describe, expect, it } from "vitest";
import { createStaticDataClient } from "./index.js";

describe("static runtime client", () => {
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/manifest.json")) {
      return new Response(
        JSON.stringify({
          version: 1,
          generatedAt: "2026-05-03T00:00:00.000Z",
          collections: {
            posts: {
              primaryKey: "id",
              path: "collections/posts.json",
              schemaHash: "hash",
              count: 3
            }
          }
        })
      );
    }
    if (url.endsWith("/collections/posts.json")) {
      return new Response(
        JSON.stringify([
          { id: "b", title: "Beta", score: 2, published: true },
          { id: "a", title: "Alpha", score: 3, published: false },
          { id: "c", title: "Gamma", score: 1, published: true }
        ])
      );
    }
    return new Response("not found", { status: 404 });
  };

  it("lists records and resolves records by primary key", async () => {
    const client = createStaticDataClient({ baseUrl: "/static-web-data", fetch: fetchImpl });
    const posts = client.collection<{ id: string; title: string; score: number }>("posts");

    await expect(posts.list()).resolves.toHaveLength(3);
    await expect(posts.getById("a")).resolves.toMatchObject({ title: "Alpha" });
    await expect(posts.getById("missing")).resolves.toBeUndefined();
  });

  it("filters, sorts, paginates, and caches collection reads", async () => {
    let collectionFetches = 0;
    const countingFetch: typeof fetch = async (input, init) => {
      if (String(input).endsWith("/collections/posts.json")) {
        collectionFetches += 1;
      }
      return fetchImpl(input, init);
    };
    const client = createStaticDataClient({ baseUrl: "/static-web-data/", fetch: countingFetch });
    const posts = client.collection<{ id: string; title: string; score: number; published: boolean }>("posts");

    const result = await posts.query({
      where: { published: true },
      sort: [{ field: "score", direction: "desc" }],
      page: 1,
      pageSize: 1
    });

    expect(result).toEqual({
      items: [{ id: "b", title: "Beta", score: 2, published: true }],
      total: 2,
      page: 1,
      pageSize: 1
    });
    await posts.list();
    expect(collectionFetches).toBe(1);
  });

  it("throws a clear error for unknown collections", async () => {
    const client = createStaticDataClient({ baseUrl: "/static-web-data", fetch: fetchImpl });

    await expect(client.collection("missing").list()).rejects.toThrow(/Unknown collection "missing"/);
  });
});
