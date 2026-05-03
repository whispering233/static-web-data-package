# AGENTS.md

Guidance for coding agents working in this repository.

## Project Summary

This is a pnpm monorepo for Static Web Data, a TypeScript-first data framework for static websites.

Publishable packages:

- `packages/core`: `@whispering233/static-web-data`
- `packages/dev`: `@whispering233/static-web-data-dev`
- `packages/react`: `@whispering233/static-web-data-react`

Private integration app:

- `npm-test`: Vite React app used to verify packed tarballs. This directory must not be published in npm package tarballs.

## Architecture Rules

- Keep schema definition and schema ownership in code. Use Zod schemas plus `.meta(...)` for field metadata.
- Do not add a visual schema editor to the dev server unless explicitly requested.
- Maintenance-time code may read/write JSON, CSV, and SQLite source storage.
- Runtime browser code must read only exported static JSON bundles.
- Keep `better-sqlite3` isolated to `packages/dev`; do not introduce native SQLite dependencies into `packages/core` or `packages/react`.
- Keep UI styling decoupled from schema/storage logic. React components belong in `packages/react`.
- Treat `packages/core` as the dependency root. `packages/dev` and `packages/react` may depend on core; core must not depend on dev or React.

## Tooling

Required runtime:

- Node.js `>=20.19.0`
- pnpm `10.31.0`

Install dependencies:

```sh
pnpm install
```

Core commands:

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm docs:api
pnpm docs:api:check
pnpm pack:dry
pnpm pack:smoke
pnpm run ci
```

Use `pnpm run ci` before claiming implementation work is complete.

## Build Outputs

Do not hand-edit generated `dist` files. Package build scripts clean and regenerate `dist`.

If you need to debug CLI behavior from built output:

```sh
pnpm build
node packages/dev/dist/cli.js validate --cwd npm-test --config swd.config.ts
node packages/dev/dist/cli.js export --cwd npm-test --config swd.config.ts
```

VS Code debugging instructions live in `docs/vscode-debugging.md`.

## Testing Expectations

- Add or update Vitest tests for behavior changes in `packages/*/src`.
- Storage adapter changes should cover roundtrip behavior.
- Runtime client changes should cover `list`, `getById`, `query`, caching, and unknown collection errors when relevant.
- Export changes should verify manifest shape and collection JSON output.
- React changes should verify renderable output without consumer CSS.
- Packaging changes should run `pnpm build`, `pnpm pack:dry`, and `pnpm pack:smoke`.
- Public API surface changes should run `pnpm docs:api:check`.

## API Documentation

API docs use TypeDoc and are configured by `typedoc.json`.

Commands:

```sh
pnpm docs:api
pnpm docs:api:check
```

Generated docs are written to `.api-docs`, which must stay ignored. Do not commit generated TypeDoc HTML output.

GitHub Pages deployment is handled by `.github/workflows/api-docs.yml`. The repository Pages source should be set to GitHub Actions.

## Package Publishing Constraints

Each publishable package uses a `files` whitelist. Keep npm tarballs limited to package metadata, README/LICENSE, and generated `dist`.

Do not publish:

- `npm-test`
- `.github`
- `scripts`
- source test files
- local generated smoke directories such as `.pack` and `.tmp`

The publish workflow is `.github/workflows/publish.yml` and is intended for npm Trusted Publishing. Do not add long-lived npm tokens unless explicitly requested.

## Git Rules

- Do not revert user changes unless explicitly asked.
- Keep unrelated refactors out of feature commits.
- Before committing, check:

```sh
git status --short --branch
```

- Prefer focused commit messages, for example:
  - `feat: add storage adapter behavior`
  - `fix: correct runtime query pagination`
  - `docs: update package usage guide`

## Common Pitfalls

- `pnpm ci` is not a script invocation. Use `pnpm run ci`.
- Running `tsc --build` can emit unwanted artifacts if project settings change. Use the existing `pnpm typecheck` script.
- If `better-sqlite3` native bindings are missing, run:

```sh
pnpm --filter @whispering233/static-web-data-dev rebuild better-sqlite3
```

- If a package tarball includes unexpected files, rebuild first and run:

```sh
pnpm build
pnpm pack:dry
```
