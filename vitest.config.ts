import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: [
      { find: "@whispering233/static-web-data/schema", replacement: resolve("packages/core/src/schema.ts") },
      { find: "@whispering233/static-web-data/export", replacement: resolve("packages/core/src/export.ts") },
      { find: "@whispering233/static-web-data/storage", replacement: resolve("packages/core/src/storage/index.ts") },
      { find: "@whispering233/static-web-data-dev", replacement: resolve("packages/dev/src/index.ts") },
      { find: "@whispering233/static-web-data-react", replacement: resolve("packages/react/src/index.tsx") },
      { find: "@whispering233/static-web-data", replacement: resolve("packages/core/src/index.ts") }
    ]
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "packages/*/src/**/*.test.ts", "packages/*/src/**/*.test.tsx"],
    environment: "node",
    globals: true,
    restoreMocks: true
  }
});
