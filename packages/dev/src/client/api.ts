export type StorageDescriptor = {
  type: string;
  path?: string;
  table?: string;
};

export type FieldDescriptor = {
  name: string;
  metadata: Record<string, unknown>;
  jsonSchema: unknown;
};

export type CollectionDescriptor = {
  name: string;
  primaryKey: string;
  storage: StorageDescriptor;
  fields: readonly FieldDescriptor[];
  jsonSchema: unknown;
};

export type DataRecord = Record<string, unknown>;

export type ImportMode = "replace" | "upsert";

export type ValidationSummary = {
  collections: Record<string, number>;
};

export type StaticBundleSummary = {
  outputDir: string;
  collections: Record<string, number>;
  manifestPath: string;
};

export async function listCollections(): Promise<CollectionDescriptor[]> {
  return requestJson("/api/collections");
}

export async function listRecords(collectionName: string): Promise<DataRecord[]> {
  return requestJson(`/api/collections/${encodeSegment(collectionName)}/records`);
}

export async function saveRecord(collectionName: string, record: DataRecord): Promise<DataRecord> {
  return requestJson(`/api/collections/${encodeSegment(collectionName)}/records`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(record)
  });
}

export async function deleteRecord(collectionName: string, id: string): Promise<{ ok: true }> {
  return requestJson(`/api/collections/${encodeSegment(collectionName)}/records/${encodeSegment(id)}`, {
    method: "DELETE"
  });
}

export async function importRecords(
  collectionName: string,
  records: DataRecord[],
  mode: ImportMode
): Promise<DataRecord[]> {
  return requestJson(`/api/collections/${encodeSegment(collectionName)}/import`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ records, mode })
  });
}

export async function validateData(): Promise<ValidationSummary> {
  return requestJson("/api/validate");
}

export async function exportStaticBundle(): Promise<StaticBundleSummary> {
  return requestJson("/api/export", { method: "POST" });
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const body = await response.json().catch(() => undefined) as unknown;
  if (!response.ok) {
    throw new Error(readErrorMessage(body) ?? response.statusText);
  }
  return body as T;
}

function readErrorMessage(body: unknown): string | undefined {
  return typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "string"
    ? body.error
    : undefined;
}

function encodeSegment(value: string): string {
  return encodeURIComponent(value);
}
