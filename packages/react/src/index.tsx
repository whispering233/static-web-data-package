import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import {
  createStaticDataClient,
  type QueryOptions,
  type QueryResult,
  type StaticDataClient
} from "@whispering233/static-web-data";

export type StaticDataProviderProps = {
  client?: StaticDataClient;
  baseUrl?: string;
  children: ReactNode;
};

export type CollectionQueryState<TRecord extends Record<string, unknown>> = {
  data: QueryResult<TRecord> | undefined;
  loading: boolean;
  error: Error | undefined;
  refetch(): void;
};

const StaticDataContext = createContext<StaticDataClient | undefined>(undefined);

export function StaticDataProvider({ client, baseUrl, children }: StaticDataProviderProps) {
  const resolvedClient = useMemo(() => {
    if (client) {
      return client;
    }
    if (!baseUrl) {
      throw new Error("StaticDataProvider requires either a client or baseUrl.");
    }
    return createStaticDataClient({ baseUrl });
  }, [baseUrl, client]);

  return createElement(StaticDataContext.Provider, { value: resolvedClient }, children);
}

export function useStaticDataClient(): StaticDataClient {
  const client = useContext(StaticDataContext);
  if (!client) {
    throw new Error("useStaticDataClient must be used inside StaticDataProvider.");
  }
  return client;
}

export function useCollectionQuery<TRecord extends Record<string, unknown>>(
  collectionName: string,
  options: QueryOptions<TRecord> = {}
): CollectionQueryState<TRecord> {
  const client = useStaticDataClient();
  const [data, setData] = useState<QueryResult<TRecord>>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();
  const [version, setVersion] = useState(0);
  const optionsKey = JSON.stringify(options);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(undefined);

    client
      .collection<TRecord>(collectionName)
      .query(options)
      .then((result) => {
        if (active) {
          setData(result);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause : new Error(String(cause)));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [client, collectionName, optionsKey, version]);

  return {
    data,
    loading,
    error,
    refetch() {
      setVersion((current) => current + 1);
    }
  };
}

export type ColumnDefinition<TRecord extends Record<string, unknown>> =
  | (keyof TRecord & string)
  | {
      key: keyof TRecord & string;
      label?: ReactNode;
      render?(value: unknown, record: TRecord): ReactNode;
    };

export type CollectionTableProps<TRecord extends Record<string, unknown>> = {
  records: TRecord[];
  columns?: Array<ColumnDefinition<TRecord>>;
  emptyLabel?: ReactNode;
  className?: string;
};

export function CollectionTable<TRecord extends Record<string, unknown>>({
  records,
  columns,
  emptyLabel = "No records",
  className
}: CollectionTableProps<TRecord>) {
  const resolvedColumns = resolveColumns(records, columns);
  const tableClass = ["swd-table", className].filter(Boolean).join(" ");

  if (records.length === 0) {
    return createElement("div", { className: "swd-empty" }, emptyLabel);
  }

  return (
    <table className={tableClass}>
      <thead>
        <tr>
          {resolvedColumns.map((column) => (
            <th key={column.key}>{column.label ?? column.key}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {records.map((record, index) => (
          <tr key={String(record.id ?? index)}>
            {resolvedColumns.map((column) => (
              <td key={column.key}>{column.render ? column.render(record[column.key], record) : formatValue(record[column.key])}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export type CollectionListProps<TRecord extends Record<string, unknown>> = {
  records: TRecord[];
  titleField?: keyof TRecord & string;
  subtitleField?: keyof TRecord & string;
  renderItem?(record: TRecord): ReactNode;
  emptyLabel?: ReactNode;
  className?: string;
};

export function CollectionList<TRecord extends Record<string, unknown>>({
  records,
  titleField,
  subtitleField,
  renderItem,
  emptyLabel = "No records",
  className
}: CollectionListProps<TRecord>) {
  const listClass = ["swd-list", className].filter(Boolean).join(" ");
  if (records.length === 0) {
    return createElement("div", { className: "swd-empty" }, emptyLabel);
  }

  return (
    <ul className={listClass}>
      {records.map((record, index) => (
        <li key={String(record.id ?? index)} className="swd-list-item">
          {renderItem ? (
            renderItem(record)
          ) : (
            <>
              <strong>{formatValue(titleField ? record[titleField] : record.id ?? index + 1)}</strong>
              {subtitleField ? <span>{formatValue(record[subtitleField])}</span> : null}
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

export type RecordDetailsProps<TRecord extends Record<string, unknown>> = {
  record: TRecord | undefined;
  fields?: Array<keyof TRecord & string>;
  emptyLabel?: ReactNode;
  className?: string;
};

export function RecordDetails<TRecord extends Record<string, unknown>>({
  record,
  fields,
  emptyLabel = "No record selected",
  className
}: RecordDetailsProps<TRecord>) {
  if (!record) {
    return createElement("div", { className: "swd-empty" }, emptyLabel);
  }
  const resolvedFields = fields ?? (Object.keys(record) as Array<keyof TRecord & string>);
  const detailsClass = ["swd-details", className].filter(Boolean).join(" ");

  return (
    <dl className={detailsClass}>
      {resolvedFields.map((field) => (
        <div key={field} className="swd-details-row">
          <dt>{field}</dt>
          <dd>{formatValue(record[field])}</dd>
        </div>
      ))}
    </dl>
  );
}

function resolveColumns<TRecord extends Record<string, unknown>>(
  records: TRecord[],
  columns: Array<ColumnDefinition<TRecord>> | undefined
): Array<{ key: keyof TRecord & string; label?: ReactNode; render?: (value: unknown, record: TRecord) => ReactNode }> {
  if (columns?.length) {
    return columns.map((column) => (typeof column === "string" ? { key: column } : column));
  }
  const first = records[0];
  if (!first) {
    return [];
  }
  return Object.keys(first).map((key) => ({ key: key as keyof TRecord & string }));
}

function formatValue(value: unknown): ReactNode {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string" || typeof value === "number") {
    return value;
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return JSON.stringify(value);
}
