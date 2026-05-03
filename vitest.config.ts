import { defineConfig } from "vitest/config";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(fileURLToPath(import.meta.url));
const fromRoot = (path: string) => resolve(rootDir, path);

export default defineConfig({
  resolve: {
    alias: [
      { find: "@whispering233/static-web-data/schema", replacement: fromRoot("packages/core/src/schema.ts") },
      { find: "@whispering233/static-web-data/export", replacement: fromRoot("packages/core/src/export.ts") },
      { find: "@whispering233/static-web-data/storage", replacement: fromRoot("packages/core/src/storage/index.ts") },
      { find: "@whispering233/static-web-data-dev", replacement: fromRoot("packages/dev/src/index.ts") },
      { find: "@whispering233/static-web-data-react", replacement: fromRoot("packages/react/src/index.tsx") },
      { find: "@whispering233/static-web-data", replacement: fromRoot("packages/core/src/index.ts") }
    ]
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "packages/*/src/**/*.test.ts", "packages/*/src/**/*.test.tsx"],
    environment: "node",
    globals: true,
    restoreMocks: true
  }
});
