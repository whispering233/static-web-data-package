# Static Web Data

TypeScript-first data package framework for static websites.

This repository contains a pnpm workspace that lets developers define data schemas in code, maintain local source data with a dev server, and export a read-only static JSON bundle for browser runtime use.

## Packages

| Package | Purpose |
| --- | --- |
| `@whispering233/static-web-data` | Core schema helpers, validation helpers, static bundle exporter, and read-only runtime client. |
| `@whispering233/static-web-data-dev` | Local CLI, maintenance dev server, and JSON/CSV/SQLite storage adapters. |
| `@whispering233/static-web-data-react` | Optional React hooks, base components, and CSS template styles. |

The workspace also includes `npm-test`, a private Vite React test app used to validate packed npm tarballs. It is not included in published packages.

## Design

Static Web Data separates two phases:

- Maintenance time: developers edit source data through local JSON, CSV, or SQLite storage. The dev package validates records against code-defined Zod schemas and can run a local maintenance server.
- Runtime: static websites read generated JSON files only. Browser runtime does not read CSV or SQLite directly.

Schema ownership stays in code. The dev server does not edit schemas; it reads Zod schema metadata to describe fields and validate records.

## Requirements

- Node.js `>=20.19.0`
- pnpm `10.31.0`

Install dependencies:

```sh
pnpm install
```

## Schema Example

Create `swd.config.ts` in a static site project:

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

Supported source storage:

```ts
{ type: "json", path: "data/posts.json" }
{ type: "csv", path: "data/posts.csv" }
{ type: "sqlite", path: "data/site.sqlite", table: "posts" }
```

## Maintenance CLI

Build packages first when running from this repository:

```sh
pnpm build
```

Validate the embedded test project:

```sh
node packages/dev/dist/cli.js validate --cwd npm-test --config swd.config.ts
```

Export runtime JSON:

```sh
node packages/dev/dist/cli.js export --cwd npm-test --config swd.config.ts
```

Start the maintenance server:

```sh
node packages/dev/dist/cli.js dev --cwd npm-test --config swd.config.ts --port 4321
```

In a consuming project after installing the dev package, use the package binary:

```sh
swd validate
swd export
swd dev
```

## Runtime Client

After export, static assets are written under the configured `output` directory:

```text
public/static-web-data/
  manifest.json
  collections/
    posts.json
```

Read records in the browser:

```ts
import { createStaticDataClient } from "@whispering233/static-web-data";

const client = createStaticDataClient({ baseUrl: "/static-web-data" });
const posts = client.collection<{ id: string; title: string; published: boolean }>("posts");

const allPosts = await posts.list();
const onePost = await posts.getById("welcome");
const publishedPosts = await posts.query({
  where: { published: true },
  sort: [{ field: "title", direction: "asc" }],
  page: 1,
  pageSize: 10
});
```

## React Template

The React package is optional and only provides presentation helpers. Schema and data management do not depend on it.

```tsx
import {
  CollectionTable,
  StaticDataProvider,
  useCollectionQuery
} from "@whispering233/static-web-data-react";
import "@whispering233/static-web-data-react/styles.css";
import { createStaticDataClient } from "@whispering233/static-web-data";

const client = createStaticDataClient({ baseUrl: "/static-web-data" });

function Posts() {
  const { data, loading, error } = useCollectionQuery("posts");

  if (loading) return <p>Loading...</p>;
  if (error) return <p>{error.message}</p>;

  return <CollectionTable records={data?.items ?? []} columns={["id", "title", "published"]} />;
}

export function App() {
  return (
    <StaticDataProvider client={client}>
      <Posts />
    </StaticDataProvider>
  );
}
```

## Development

Common commands:

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm pack:dry
pnpm pack:smoke
pnpm run ci
```

What each check covers:

- `pnpm typecheck`: TypeScript type checks for publishable packages.
- `pnpm test`: Vitest unit tests for core, dev, and React package behavior.
- `pnpm build`: Builds publishable package `dist` directories.
- `pnpm pack:dry`: Verifies npm tarball file contents and excludes `npm-test`, `.github`, scripts, and source tests.
- `pnpm pack:smoke`: Packs all three packages, installs tarballs into a temporary copy of `npm-test`, and builds that app.
- `pnpm run ci`: Runs the full local CI chain.

VS Code debugging instructions are available in [docs/vscode-debugging.md](docs/vscode-debugging.md).

## Publishing

This repository is configured for npm-only publishing through GitHub Actions Trusted Publishing.

Workflow:

- CI: `.github/workflows/ci.yml`
- Publish: `.github/workflows/publish.yml`

Before publishing, configure npm Trusted Publishing for each package on npmjs.com:

- `@whispering233/static-web-data`
- `@whispering233/static-web-data-dev`
- `@whispering233/static-web-data-react`

Use GitHub Actions as the trusted publisher and set the workflow filename to `publish.yml`.

Trigger publishing with a `v*` tag or a published GitHub Release after the repository has been pushed to GitHub.

## Repository Layout

```text
packages/
  core/    # schema helpers, runtime client, static export
  dev/     # CLI, dev server, storage adapters
  react/   # optional React hooks/components/styles
npm-test/  # private packed-package test app
scripts/   # packaging and publish helper scripts
docs/      # development and debugging docs
```

## License

MIT
