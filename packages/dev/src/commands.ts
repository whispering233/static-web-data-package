import type { StaticBundleSummary } from "@whispering233/static-web-data/export";
import type { DataPackageDefinition } from "@whispering233/static-web-data/schema";
import { createDataRepository, type ValidationSummary } from "@whispering233/static-web-data/storage";

export async function validateProjectData(
  dataPackage: DataPackageDefinition,
  cwd: string = process.cwd()
): Promise<ValidationSummary> {
  return createDataRepository(dataPackage, { cwd }).validate();
}

export async function exportStaticData(
  dataPackage: DataPackageDefinition,
  cwd: string = process.cwd()
): Promise<StaticBundleSummary> {
  return createDataRepository(dataPackage, { cwd }).exportStaticBundle();
}
