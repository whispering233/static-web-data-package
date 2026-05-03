import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  defineCollection,
  defineDataPackage,
  describeCollection,
  validateCollectionRecords
} from "./schema.js";

describe("schema helpers", () => {
  const posts = defineCollection({
    primaryKey: "id",
    storage: { type: "json", path: "data/posts.json" },
    schema: z.object({
      id: z.string().meta({ title: "ID", editor: "text" }),
      title: z.string().min(1).meta({ title: "Title", editor: "text" }),
      published: z.boolean().default(false).meta({ title: "Published", editor: "checkbox" })
    })
  });

  it("keeps Zod as the source of truth and exposes field metadata", () => {
    const descriptor = describeCollection("posts", posts);

    expect(descriptor.primaryKey).toBe("id");
    expect(descriptor.storage.type).toBe("json");
    expect(descriptor.fields.map((field) => field.name)).toEqual(["id", "title", "published"]);
    expect(descriptor.fields.find((field) => field.name === "title")?.metadata).toMatchObject({
      title: "Title",
      editor: "text"
    });
    expect(descriptor.jsonSchema).toMatchObject({
      type: "object",
      properties: {
        title: { type: "string", title: "Title" }
      }
    });
  });

  it("validates primary key presence and duplicate values", () => {
    expect(() =>
      validateCollectionRecords("posts", posts, [
        { id: "a", title: "First", published: true },
        { id: "a", title: "Duplicate", published: false }
      ])
    ).toThrow(/Duplicate primary key "a"/);

    expect(() =>
      validateCollectionRecords("posts", posts, [{ title: "Missing id", published: true }])
    ).toThrow(/primary key "id"/);
  });

  it("defines a package with stable collection names", () => {
    const dataPackage = defineDataPackage({
      output: "public/static-web-data",
      collections: { posts }
    });

    expect(Object.keys(dataPackage.collections)).toEqual(["posts"]);
    expect(dataPackage.output).toBe("public/static-web-data");
  });
});
