# @whispering233/static-web-data

Static Web Data core package.

This package owns the framework's data model and data lifecycle primitives:

- schema helpers for defining code-owned collections with Zod metadata
- Node-only source data management APIs for reading, validating, upserting, deleting, importing, and exporting records
- JSON, CSV, and SQLite storage adapters used during local maintenance
- static export helpers that write browser-readable JSON bundles
- browser-safe read-only runtime client for final static websites

Use the root package entry for browser and React runtime code:

```ts
import { createStaticDataClient } from "@whispering233/static-web-data";
```

Use the storage entry only from Node.js maintenance code, CLIs, dev servers, or build scripts:

```ts
import { createDataRepository } from "@whispering233/static-web-data/storage";
```

`@whispering233/static-web-data/storage` is Node-only. Do not import it from browser runtime code or React components intended for final static pages.
