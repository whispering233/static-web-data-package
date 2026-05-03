import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(repoRoot, "packages/react/src/styles.css");
const target = resolve(repoRoot, "packages/react/dist/styles.css");

await mkdir(dirname(target), { recursive: true });
await copyFile(source, target);
