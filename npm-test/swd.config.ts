import { defineCollection, defineDataPackage } from "@whispering233/static-web-data/schema";
import { z } from "zod";

export default defineDataPackage({
  output: "public/static-web-data",
  collections: {
    posts: defineCollection({
      primaryKey: "id",
      storage: { type: "json", path: "data/posts.json" },
      schema: z.object({
        id: z.string().meta({ title: "ID", editor: "text" }),
        title: z.string().min(1).meta({ title: "Title", editor: "text" }),
        published: z.boolean().default(false).meta({ title: "Published", editor: "checkbox" })
      })
    })
  }
});
