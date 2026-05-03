import type { CollectionDescriptor, DataRecord } from "../api.js";

export type RecordTableProps = {
  collection: CollectionDescriptor | undefined;
  records: DataRecord[];
  selectedRecord: DataRecord | undefined;
  onSelect(record: DataRecord): void;
};

export function RecordTable({ collection, records, selectedRecord, onSelect }: RecordTableProps) {
  const columns = collection?.fields.map((field) => field.name) ?? inferColumns(records);
  const selectedKey = selectedRecord && collection ? String(selectedRecord[collection.primaryKey] ?? "") : undefined;

  return (
    <div className="swd-dev-table-wrap">
      <table className="swd-dev-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col">{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.length === 0 ? (
            <tr>
              <td colSpan={Math.max(columns.length, 1)}>No records</td>
            </tr>
          ) : (
            records.map((record, index) => {
              const rowKey = collection ? String(record[collection.primaryKey] ?? index) : String(index);
              return (
                <tr
                  data-active={selectedKey !== undefined && rowKey === selectedKey ? "true" : "false"}
                  key={rowKey}
                  onClick={() => onSelect(record)}
                >
                  {columns.map((column) => (
                    <td key={column}>{formatCell(record[column])}</td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function inferColumns(records: DataRecord[]): string[] {
  return Array.from(new Set(records.flatMap((record) => Object.keys(record))));
}

function formatCell(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  return typeof value === "string" ? value : JSON.stringify(value);
}
