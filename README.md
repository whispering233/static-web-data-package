# Static Web Data

`@whispering233/static-web-data` is a TypeScript-first data package framework for static websites. It keeps schema definitions in code, gives developers a local maintenance server for editing source data, and exports a read-only static JSON bundle for the browser runtime.

## Packages

- `@whispering233/static-web-data`: schema helpers, validation helpers, static bundle writer, and read-only runtime client.
- `@whispering233/static-web-data-dev`: CLI, local maintenance server, and JSON/CSV/SQLite storage adapters.
- `@whispering233/static-web-data-react`: optional React hooks and presentation components.

## Example

```ts
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
```

Run maintenance commands:

```sh
pnpm swd validate
pnpm swd export
pnpm swd dev
```
