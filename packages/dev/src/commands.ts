import { writeStaticBundle, type StaticBundleSummary } from "@whispering233/static-web-data/export";
import type { DataPackageDefinition } from "@whispering233/static-web-data/schema";
import { createStorageAdapter } from "./storage/index.js";

export type ValidationSummary = {
  collections: Record<string, number>;
};

export async function validateProjectData(
  dataPackage: DataPackageDefinition,
  cwd: string = process.cwd()
): Promise<ValidationSummary> {
  const collections: Record<string, number> = {};
  for (const [name, collection] of Object.entries(dataPackage.collections)) {
    const adapter = createStorageAdapter(name, collection, cwd);
    const records = await adapter.readAll();
    collections[name] = records.length;
  }
  return { collections };
}

export async function exportStaticData(
  dataPackage: DataPackageDefinition,
  cwd: string = process.cwd()
): Promise<StaticBundleSummary> {
  const recordsByCollection: Record<string, unknown[]> = {};
  for (const [name, collection] of Object.entries(dataPackage.collections)) {
    recordsByCollection[name] = await createStorageAdapter(name, collection, cwd).readAll();
  }
  return writeStaticBundle(dataPackage, recordsByCollection, { cwd });
}
