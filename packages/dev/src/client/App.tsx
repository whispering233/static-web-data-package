import { useEffect, useMemo, useState } from "react";
import {
  deleteRecord,
  exportStaticBundle,
  importRecords,
  listCollections,
  listRecords,
  saveRecord,
  validateData,
  type CollectionDescriptor,
  type DataRecord,
  type ImportMode
} from "./api.js";
import { CollectionSidebar } from "./components/CollectionSidebar.js";
import { RecordEditor } from "./components/RecordEditor.js";
import { RecordTable } from "./components/RecordTable.js";
import { StatusBar } from "./components/StatusBar.js";

const EMPTY_RECORD = "{\n  \n}";

export function App() {
  const [collections, setCollections] = useState<CollectionDescriptor[]>([]);
  const [selectedName, setSelectedName] = useState<string>();
  const [records, setRecords] = useState<DataRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<DataRecord>();
  const [editorText, setEditorText] = useState(EMPTY_RECORD);
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  const selectedCollection = useMemo(
    () => collections.find((collection) => collection.name === selectedName),
    [collections, selectedName]
  );
  const selectedPrimaryKeyValue = selectedRecordId(selectedCollection, selectedRecord);
  const canDeleteSelectedRecord =
    selectedName !== undefined &&
    selectedPrimaryKeyValue !== undefined &&
    selectedPrimaryKeyValue !== null &&
    selectedPrimaryKeyValue !== "";

  useEffect(() => {
    void loadCollections();
  }, []);

  async function loadCollections() {
    await run("Collections loaded", async () => {
      const loaded = await listCollections();
      setCollections(loaded);
      const nextName = selectedName ?? loaded[0]?.name;
      setSelectedName(nextName);
      if (nextName) {
        await loadRecords(nextName);
      }
    });
  }

  async function loadRecords(collectionName = selectedName) {
    if (!collectionName) {
      setRecords([]);
      return;
    }
    await run("Records loaded", async () => {
      const loaded = await listRecords(collectionName);
      setRecords(loaded);
      setSelectedRecord(loaded[0]);
      setEditorText(JSON.stringify(loaded[0] ?? {}, null, 2));
    });
  }

  function selectCollection(name: string) {
    setSelectedName(name);
    void loadRecords(name);
  }

  function selectRecord(record: DataRecord) {
    setSelectedRecord(record);
    setEditorText(JSON.stringify(record, null, 2));
  }

  async function saveEditorRecord() {
    if (!selectedName) {
      return;
    }
    await run("Record saved", async () => {
      await saveRecord(selectedName, parseRecord(editorText));
      await loadRecords(selectedName);
    });
  }

  async function importEditorRecords(mode: ImportMode) {
    if (!selectedName) {
      return;
    }
    await run(`Import ${mode} complete`, async () => {
      const parsedRecords = parseRecords(editorText);
      if (mode === "replace" && !confirmImportReplace(window.confirm, selectedName, parsedRecords.length)) {
        return "Import canceled";
      }
      await importRecords(selectedName, parsedRecords, mode);
      await loadRecords(selectedName);
    });
  }

  async function deleteSelectedRecord() {
    if (!selectedName || !canDeleteSelectedRecord) {
      return;
    }
    const id = String(selectedPrimaryKeyValue);
    if (!confirmDeleteRecord(window.confirm, selectedName, id)) {
      return;
    }
    await run("Record deleted", async () => {
      await deleteRecord(selectedName, id);
      const loaded = await listRecords(selectedName);
      setRecords(loaded);
      setSelectedRecord(loaded[0]);
      setEditorText(JSON.stringify(loaded[0] ?? {}, null, 2));
    });
  }

  async function validate() {
    await run("Validation complete", async () => {
      const result = await validateData();
      return `Validation complete: ${JSON.stringify(result.collections)}`;
    });
  }

  async function exportBundle() {
    await run("Export complete", async () => {
      const result = await exportStaticBundle();
      return `Exported ${Object.keys(result.collections).length} collections to ${result.outputDir}`;
    });
  }

  async function run(successMessage: string, action: () => Promise<string | void>) {
    if (pending) {
      return;
    }
    setError(undefined);
    setPending(true);
    try {
      const detailedMessage = await action();
      setStatus(resolveSuccessMessage(successMessage, detailedMessage));
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
      setStatus("Action failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="swd-dev-app">
      <CollectionSidebar collections={collections} selectedName={selectedName} onSelect={selectCollection} />
      <main className="swd-dev-main">
        <header className="swd-dev-header">
          <div>
            <h1>Static Web Data</h1>
            <p>{selectedCollection ? `${selectedCollection.name} · ${selectedCollection.storage.type}` : "No collection selected"}</p>
          </div>
          <div className="swd-dev-button-row" aria-label="Actions">
            <button type="button" onClick={() => void loadRecords()}>Refresh</button>
            <button type="button" onClick={() => void validate()}>Validate</button>
            <button type="button" onClick={() => void exportBundle()}>Export</button>
          </div>
        </header>
        <StatusBar message={status} error={error} />
        <div className="swd-dev-workbench">
          <RecordTable
            collection={selectedCollection}
            records={records}
            selectedRecord={selectedRecord}
            onSelect={selectRecord}
          />
          <RecordEditor
            value={editorText}
            onChange={setEditorText}
            onSave={() => void saveEditorRecord()}
            onDelete={() => void deleteSelectedRecord()}
            onImportReplace={() => void importEditorRecords("replace")}
            onImportUpsert={() => void importEditorRecords("upsert")}
            canDelete={canDeleteSelectedRecord}
            pending={pending}
          />
        </div>
      </main>
    </div>
  );
}

export function selectedRecordId(
  collection: CollectionDescriptor | undefined,
  record: DataRecord | undefined
): unknown {
  return collection && record ? record[collection.primaryKey] : undefined;
}

export function confirmDeleteRecord(
  confirm: (message: string) => boolean,
  collectionName: string,
  recordId: string
): boolean {
  return confirm(`Delete record "${recordId}" from collection "${collectionName}"?`);
}

export function confirmImportReplace(
  confirm: (message: string) => boolean,
  collectionName: string,
  recordCount: number
): boolean {
  return confirm(`This will replace all records in collection "${collectionName}" with ${recordCount} records. Continue?`);
}

export function resolveSuccessMessage(defaultMessage: string, detailedMessage: string | void): string {
  return detailedMessage ?? defaultMessage;
}

function parseRecord(text: string): DataRecord {
  const value = JSON.parse(text) as unknown;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Editor JSON must be an object.");
  }
  return value as DataRecord;
}

function parseRecords(text: string): DataRecord[] {
  const value = JSON.parse(text) as unknown;
  if (!Array.isArray(value)) {
    throw new Error("Import JSON must be an array.");
  }
  return value.map((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new Error("Import JSON must contain objects.");
    }
    return item as DataRecord;
  });
}
