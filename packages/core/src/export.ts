import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import {
  type DataPackageDefinition,
  describeCollection,
  validateCollectionRecords
} from "./schema.js";
import type { StaticDataManifest } from "./index.js";

export type StaticBundleInput = Record<string, unknown[]>;

export type StaticBundleSummary = {
  outputDir: string;
  collections: Record<string, number>;
};

export async function writeStaticBundle(
  dataPackage: DataPackageDefinition,
  recordsByCollection: StaticBundleInput,
  options: { cwd?: string; generatedAt?: Date } = {}
): Promise<StaticBundleSummary> {
  const outputDir = isAbsolute(dataPackage.output)
    ? dataPackage.output
    : resolve(options.cwd ?? process.cwd(), dataPackage.output);
  const collectionsDir = join(outputDir, "collections");
  await mkdir(collectionsDir, { recursive: true });

  const manifest: StaticDataManifest = {
    version: 1,
    generatedAt: (options.generatedAt ?? new Date()).toISOString(),
    collections: {}
  };
  const summary: StaticBundleSummary = {
    outputDir,
    collections: {}
  };

  for (const [name, collection] of Object.entries(dataPackage.collections)) {
    const records = recordsByCollection[name] ?? [];
    const parsedRecords = validateCollectionRecords(name, collection, records);
    const descriptor = describeCollection(name, collection);
    const collectionPath = `collections/${name}.json`;

    await writeFile(join(outputDir, collectionPath), `${JSON.stringify(parsedRecords, null, 2)}\n`, "utf8");

    manifest.collections[name] = {
      primaryKey: collection.primaryKey,
      path: collectionPath,
      schemaHash: createSchemaHash(descriptor.jsonSchema),
      count: parsedRecords.length
    };
    summary.collections[name] = parsedRecords.length;
  }

  await writeFile(join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return summary;
}

export function createSchemaHash(jsonSchema: unknown): string {
  return createHash("sha256").update(stableStringify(jsonSchema)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right)
    );
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
