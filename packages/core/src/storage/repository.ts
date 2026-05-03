import { writeStaticBundle, type StaticBundleSummary } from "../export.js";
import {
  type CollectionDescriptor,
  type CollectionDefinition,
  type DataPackageDefinition,
  describeDataPackage
} from "../schema.js";
import { createStorageAdapter } from "./factory.js";
import type { StorageAdapter } from "./types.js";

export type ValidationSummary = {
  collections: Record<string, number>;
};

export type DataRepository = {
  collection(name: string): StorageAdapter;
  listCollections(): CollectionDescriptor[];
  validate(): Promise<ValidationSummary>;
  exportStaticBundle(options?: { generatedAt?: Date }): Promise<StaticBundleSummary>;
};

export function createDataRepository(
  dataPackage: DataPackageDefinition,
  options: { cwd?: string } = {}
): DataRepository {
  const cwd = options.cwd ?? process.cwd();

  function getCollectionDefinition(name: string): CollectionDefinition {
    const collection = dataPackage.collections[name];
    if (!collection) {
      throw new Error(`Unknown collection "${name}"`);
    }
    return collection;
  }

  function createCollectionRepository(name: string): StorageAdapter {
    const collection = getCollectionDefinition(name);
    return createStorageAdapter(name, collection, { cwd });
  }

  return {
    collection(name) {
      return createCollectionRepository(name);
    },
    listCollections() {
      return describeDataPackage(dataPackage);
    },
    async validate() {
      const entries = await Promise.all(
        Object.keys(dataPackage.collections).map(async (name) => {
          const records = await createCollectionRepository(name).readAll();
          return [name, records.length] as const;
        })
      );

      return {
        collections: Object.fromEntries(entries)
      };
    },
    async exportStaticBundle(exportOptions = {}) {
      const recordsByCollection: Record<string, Record<string, unknown>[]> = {};

      for (const name of Object.keys(dataPackage.collections)) {
        recordsByCollection[name] = await createCollectionRepository(name).readAll();
      }

      return writeStaticBundle(
        dataPackage,
        recordsByCollection,
        exportOptions.generatedAt ? { cwd, generatedAt: exportOptions.generatedAt } : { cwd }
      );
    }
  };
}
