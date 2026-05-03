import { access } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import type { DataPackageDefinition } from "@whispering233/static-web-data/schema";

export type LoadProjectConfigOptions = {
  cwd?: string;
  configPath?: string;
};

export async function loadProjectConfig(options: LoadProjectConfigOptions = {}): Promise<DataPackageDefinition> {
  const cwd = options.cwd ?? process.cwd();
  const configFile = await resolveConfigFile(cwd, options.configPath);
  const loaded = await loadConfigModule(configFile);
  const config = getDefaultExport(loaded);
  assertDataPackageDefinition(config, configFile);
  return config;
}

async function resolveConfigFile(cwd: string, configPath?: string): Promise<string> {
  if (configPath) {
    const candidate = isAbsolute(configPath) ? configPath : resolve(cwd, configPath);
    await assertReadable(candidate);
    return candidate;
  }

  const candidates = ["swd.config.ts", "swd.config.mts", "swd.config.js", "swd.config.mjs", "swd.config.cjs"];
  for (const candidate of candidates) {
    const resolved = resolve(cwd, candidate);
    if (await isReadable(resolved)) {
      return resolved;
    }
  }
  throw new Error(`Could not find swd config in "${cwd}". Expected one of: ${candidates.join(", ")}`);
}

async function loadConfigModule(configFile: string): Promise<unknown> {
  const jiti = createJiti(import.meta.url, {
    interopDefault: true,
    alias: createConfigAliases()
  });
  return jiti.import(configFile);
}

function createConfigAliases(): Record<string, string> {
  return {
    "@whispering233/static-web-data/schema": resolveLocalOrPackage(
      "../../core/src/schema.ts",
      "@whispering233/static-web-data/schema"
    ),
    "@whispering233/static-web-data": resolveLocalOrPackage(
      "../../core/src/index.ts",
      "@whispering233/static-web-data"
    ),
    zod: createRequire(import.meta.url).resolve("zod")
  };
}

function resolveLocalOrPackage(localFromSourceDir: string, packageSpecifier: string): string {
  const localPath = resolve(dirname(fileURLToPath(import.meta.url)), localFromSourceDir);
  if (existsSync(localPath)) {
    return localPath;
  }
  return fileURLToPath(import.meta.resolve(packageSpecifier));
}

function getDefaultExport(loaded: unknown): unknown {
  if (loaded && typeof loaded === "object" && "default" in loaded) {
    return (loaded as { default: unknown }).default;
  }
  return loaded;
}

function assertDataPackageDefinition(value: unknown, configFile: string): asserts value is DataPackageDefinition {
  if (!value || typeof value !== "object") {
    throw new Error(`Config "${configFile}" must export a data package definition.`);
  }
  const candidate = value as Partial<DataPackageDefinition>;
  if (typeof candidate.output !== "string" || !candidate.collections || typeof candidate.collections !== "object") {
    throw new Error(`Config "${configFile}" must include "output" and "collections".`);
  }
}

async function assertReadable(filePath: string): Promise<void> {
  if (!(await isReadable(filePath))) {
    throw new Error(`Config file "${filePath}" does not exist or is not readable.`);
  }
}

async function isReadable(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
