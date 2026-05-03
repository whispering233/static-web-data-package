import { rm } from "node:fs/promises";
import { basename, resolve } from "node:path";

const target = resolve(process.cwd(), "dist");
const cwd = resolve(process.cwd());

if (!target.startsWith(`${cwd}\\`) && !target.startsWith(`${cwd}/`)) {
  throw new Error(`Refusing to clean outside package directory: ${target}`);
}
if (basename(target) !== "dist") {
  throw new Error(`Refusing to clean non-dist path: ${target}`);
}

await rm(target, { recursive: true, force: true });
await rm(resolve(process.cwd(), "tsconfig.tsbuildinfo"), { force: true });
await rm(resolve(process.cwd(), "tsconfig.build.tsbuildinfo"), { force: true });
