export type RecordEditorProps = {
  value: string;
  onChange(value: string): void;
  onSave(): void;
  onDelete(): void;
  onImportReplace(): void;
  onImportUpsert(): void;
  canDelete: boolean;
  pending: boolean;
};

export function RecordEditor({
  value,
  onChange,
  onSave,
  onDelete,
  onImportReplace,
  onImportUpsert,
  canDelete,
  pending
}: RecordEditorProps) {
  return (
    <section className="swd-dev-editor" aria-label="Record editor">
      <div className="swd-dev-panel-title">JSON editor</div>
      <textarea
        className="swd-dev-editor__textarea"
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      <div className="swd-dev-button-row">
        <button type="button" onClick={onSave} disabled={pending}>Save/upsert</button>
        <button className="swd-dev-button-danger" type="button" onClick={onDelete} disabled={pending || !canDelete}>Delete</button>
        <button type="button" onClick={onImportReplace} disabled={pending}>Import replace</button>
        <button type="button" onClick={onImportUpsert} disabled={pending}>Import upsert</button>
      </div>
    </section>
  );
}
