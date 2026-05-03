# @whispering233/static-web-data-dev

Development tooling for Static Web Data projects.

This package provides:

- the `swd` local CLI for validation, static export, and development server workflows
- a local Hono dev server for maintenance-time HTTP APIs
- an embedded React data management UI served by `swd dev`

Source-data reads and writes are delegated to the core storage APIs from `@whispering233/static-web-data/storage`. The dev package coordinates CLI/server/UI behavior around those APIs instead of implementing separate JSON, CSV, or SQLite storage logic.
