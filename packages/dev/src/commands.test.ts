import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadProjectConfig } from "./config.js";
import { exportStaticData, validateProjectData } from "./commands.js";

describe("dev commands", () => {
  it("validates records and reports primary key problems", async () => {
    const dir = await mkdtemp(join(tmpdir(), "swd-commands-"));
    try {
      await mkdir(join(dir, "data"));
      await writeFile(
        join(dir, "swd.config.js"),
        `
          import { defineCollection, defineDataPackage } from "@whispering233/static-web-data/schema";
          import { z } from "zod";
          export default defineDataPackage({
            output: "public/static-web-data",
            collections: {
              posts: defineCollection({
                primaryKey: "id",
                storage: { type: "json", path: "data/posts.json" },
                schema: z.object({ id: z.string(), title: z.string().min(1) })
              })
            }
          });
        `
      );
      await writeFile(
        join(dir, "data", "posts.json"),
        JSON.stringify([
          { id: "a", title: "Alpha" },
          { id: "a", title: "Duplicate" }
        ])
      );

      const config = await loadProjectConfig({ cwd: dir, configPath: "swd.config.js" });

      await expect(validateProjectData(config, dir)).rejects.toThrow(/Duplicate primary key "a"/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("exports a runtime static bundle", async () => {
    const dir = await mkdtemp(join(tmpdir(), "swd-export-"));
    try {
      await mkdir(join(dir, "data"));
      await writeFile(
        join(dir, "swd.config.js"),
        `
          import { defineCollection, defineDataPackage } from "@whispering233/static-web-data/schema";
          import { z } from "zod";
          export default defineDataPackage({
            output: "public/static-web-data",
            collections: {
              posts: defineCollection({
                primaryKey: "id",
                storage: { type: "json", path: "data/posts.json" },
                schema: z.object({ id: z.string(), title: z.string() })
              })
            }
          });
        `
      );
      await writeFile(join(dir, "data", "posts.json"), JSON.stringify([{ id: "a", title: "Alpha" }]));
      const config = await loadProjectConfig({ cwd: dir, configPath: "swd.config.js" });

      const summary = await exportStaticData(config, dir);
      const manifest = JSON.parse(await readFile(join(dir, "public", "static-web-data", "manifest.json"), "utf8"));

      expect(summary.collections).toEqual({ posts: 1 });
      expect(manifest.collections.posts).toMatchObject({ primaryKey: "id", count: 1 });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
