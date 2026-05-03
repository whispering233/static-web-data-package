export type StaticDataManifest = {
  version: 1;
  generatedAt: string;
  collections: Record<
    string,
    {
      primaryKey: string;
      path: string;
      schemaHash: string;
      count: number;
    }
  >;
};

export type QuerySort<TRecord> = {
  field: keyof TRecord & string;
  direction?: "asc" | "desc";
};

export type QueryOptions<TRecord> = {
  where?: Partial<Record<keyof TRecord & string, unknown | unknown[]>>;
  sort?: Array<QuerySort<TRecord>>;
  page?: number;
  pageSize?: number;
};

export type QueryResult<TRecord> = {
  items: TRecord[];
  total: number;
  page: number;
  pageSize: number;
};

export type StaticDataClientOptions = {
  baseUrl: string;
  fetch?: typeof fetch;
};

export type CollectionReader<TRecord> = {
  list(): Promise<TRecord[]>;
  getById(id: string | number): Promise<TRecord | undefined>;
  query(options?: QueryOptions<TRecord>): Promise<QueryResult<TRecord>>;
};

export type StaticDataClient = {
  collection<TRecord extends Record<string, unknown> = Record<string, unknown>>(name: string): CollectionReader<TRecord>;
};

export function createStaticDataClient(options: StaticDataClientOptions): StaticDataClient {
  const fetchJson = createJsonFetcher(options.fetch ?? globalThis.fetch);
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  let manifestPromise: Promise<StaticDataManifest> | undefined;
  const collectionCache = new Map<string, Promise<Record<string, unknown>[]>>();

  async function getManifest() {
    manifestPromise ??= fetchJson<StaticDataManifest>(joinUrl(baseUrl, "manifest.json"));
    return manifestPromise;
  }

  async function loadCollection(name: string) {
    if (!collectionCache.has(name)) {
      collectionCache.set(
        name,
        (async () => {
          const manifest = await getManifest();
          const collection = manifest.collections[name];
          if (!collection) {
            throw new Error(`Unknown collection "${name}".`);
          }
          const records = await fetchJson<unknown>(joinUrl(baseUrl, collection.path));
          if (!Array.isArray(records)) {
            throw new Error(`Collection "${name}" did not resolve to an array.`);
          }
          return records as Record<string, unknown>[];
        })()
      );
    }
    return collectionCache.get(name)!;
  }

  return {
    collection<TRecord extends Record<string, unknown> = Record<string, unknown>>(name: string): CollectionReader<TRecord> {
      return {
        async list() {
          const records = await loadCollection(name);
          return records.slice() as TRecord[];
        },
        async getById(id) {
          const manifest = await getManifest();
          const collection = manifest.collections[name];
          if (!collection) {
            throw new Error(`Unknown collection "${name}".`);
          }
          const records = await loadCollection(name);
          return records.find((record) => Object.is(record[collection.primaryKey], id)) as TRecord | undefined;
        },
        async query(options = {}) {
          const records = (await loadCollection(name)) as TRecord[];
          const filtered = applyWhere(records, options.where);
          const sorted = applySort(filtered, options.sort);
          const page = Math.max(1, options.page ?? 1);
          const pageSize = Math.max(1, options.pageSize ?? (sorted.length || 1));
          const start = (page - 1) * pageSize;

          return {
            items: sorted.slice(start, start + pageSize),
            total: sorted.length,
            page,
            pageSize
          };
        }
      };
    }
  };
}

function applyWhere<TRecord extends Record<string, unknown>>(
  records: TRecord[],
  where: QueryOptions<TRecord>["where"]
): TRecord[] {
  if (!where) {
    return records.slice();
  }

  return records.filter((record) =>
    Object.entries(where).every(([field, expected]) => {
      const expectedValues = Array.isArray(expected) ? expected : [expected];
      return expectedValues.some((value) => Object.is(record[field], value));
    })
  );
}

function applySort<TRecord extends Record<string, unknown>>(
  records: TRecord[],
  sort: QueryOptions<TRecord>["sort"]
): TRecord[] {
  if (!sort?.length) {
    return records.slice();
  }

  return records.slice().sort((left, right) => {
    for (const sorter of sort) {
      const leftValue = left[sorter.field];
      const rightValue = right[sorter.field];
      const comparison = compareValues(leftValue, rightValue);
      if (comparison !== 0) {
        return sorter.direction === "desc" ? -comparison : comparison;
      }
    }
    return 0;
  });
}

function compareValues(left: unknown, right: unknown): number {
  if (left === right) {
    return 0;
  }
  if (left === undefined || left === null) {
    return -1;
  }
  if (right === undefined || right === null) {
    return 1;
  }
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  return String(left).localeCompare(String(right));
}

function createJsonFetcher(fetchImpl: typeof fetch | undefined) {
  if (!fetchImpl) {
    throw new Error("A fetch implementation is required to create a static data client.");
  }

  return async function fetchJson<T>(url: string): Promise<T> {
    const response = await fetchImpl(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch static data from ${url}: ${response.status} ${response.statusText}`);
    }
    return (await response.json()) as T;
  };
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl}/${path.replace(/^\/+/, "")}`;
}
