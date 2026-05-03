import { z } from "zod";

export type JsonStorageConfig = {
  type: "json";
  path: string;
};

export type CsvStorageConfig = {
  type: "csv";
  path: string;
};

export type SqliteStorageConfig = {
  type: "sqlite";
  path: string;
  table?: string;
};

export type StorageConfig = JsonStorageConfig | CsvStorageConfig | SqliteStorageConfig;

export type CollectionDefinition<TSchema extends z.ZodObject<Record<string, z.ZodType>> = z.ZodObject<Record<string, z.ZodType>>> = {
  primaryKey: string;
  storage: StorageConfig;
  schema: TSchema;
};

export type DataPackageDefinition<TCollections extends Record<string, CollectionDefinition> = Record<string, CollectionDefinition>> = {
  output: string;
  collections: TCollections;
};

export type FieldDescriptor = {
  name: string;
  metadata: Record<string, unknown>;
  jsonSchema: unknown;
};

export type CollectionDescriptor = {
  name: string;
  primaryKey: string;
  storage: StorageConfig;
  fields: FieldDescriptor[];
  jsonSchema: unknown;
};

export type InferCollection<TCollection extends CollectionDefinition> = z.infer<TCollection["schema"]>;

export function defineCollection<const TSchema extends z.ZodObject<Record<string, z.ZodType>>>(
  config: CollectionDefinition<TSchema>
): CollectionDefinition<TSchema> {
  return config;
}

export function defineDataPackage<const TCollections extends Record<string, CollectionDefinition>>(
  config: DataPackageDefinition<TCollections>
): DataPackageDefinition<TCollections> {
  return config;
}

export function describeCollection(name: string, collection: CollectionDefinition): CollectionDescriptor {
  const jsonSchema = z.toJSONSchema(collection.schema);
  const jsonSchemaProperties =
    typeof jsonSchema === "object" &&
    jsonSchema !== null &&
    "properties" in jsonSchema &&
    typeof jsonSchema.properties === "object" &&
    jsonSchema.properties !== null
      ? (jsonSchema.properties as Record<string, unknown>)
      : {};

  return {
    name,
    primaryKey: collection.primaryKey,
    storage: collection.storage,
    fields: Object.entries(collection.schema.shape).map(([fieldName, fieldSchema]) => ({
      name: fieldName,
      metadata: fieldSchema.meta() ?? {},
      jsonSchema: jsonSchemaProperties[fieldName] ?? {}
    })),
    jsonSchema
  };
}

export function describeDataPackage(dataPackage: DataPackageDefinition): CollectionDescriptor[] {
  return Object.entries(dataPackage.collections).map(([name, collection]) => describeCollection(name, collection));
}

export function validateCollectionRecords<TCollection extends CollectionDefinition>(
  collectionName: string,
  collection: TCollection,
  rawRecords: unknown[]
): Array<z.infer<TCollection["schema"]>> {
  const primaryKey = collection.primaryKey;
  const seenPrimaryKeys = new Set<string>();

  return rawRecords.map((rawRecord, index) => {
    if (!isRecord(rawRecord) || rawRecord[primaryKey] === undefined || rawRecord[primaryKey] === null || rawRecord[primaryKey] === "") {
      throw new Error(`Collection "${collectionName}" record at index ${index} is missing primary key "${primaryKey}".`);
    }

    const parsed = collection.schema.safeParse(rawRecord);
    if (!parsed.success) {
      const message = parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
        .join("; ");
      throw new Error(`Collection "${collectionName}" record at index ${index} failed schema validation: ${message}`);
    }

    const key = String(parsed.data[primaryKey]);
    if (seenPrimaryKeys.has(key)) {
      throw new Error(`Collection "${collectionName}" has Duplicate primary key "${key}" for field "${primaryKey}".`);
    }
    seenPrimaryKeys.add(key);

    return parsed.data as z.infer<TCollection["schema"]>;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
