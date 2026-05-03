import type { CollectionDescriptor } from "../api.js";

export type CollectionSidebarProps = {
  collections: CollectionDescriptor[];
  selectedName: string | undefined;
  onSelect(name: string): void;
};

export function CollectionSidebar({ collections, selectedName, onSelect }: CollectionSidebarProps) {
  return (
    <aside className="swd-dev-sidebar" aria-label="Collections">
      <div className="swd-dev-sidebar__header">Collections</div>
      <nav className="swd-dev-collection-list">
        {collections.map((collection) => (
          <button
            className="swd-dev-collection"
            data-active={collection.name === selectedName ? "true" : "false"}
            key={collection.name}
            type="button"
            onClick={() => onSelect(collection.name)}
          >
            <span className="swd-dev-collection__name">{collection.name}</span>
            <span className="swd-dev-collection__meta">
              {collection.storage.type} · {collection.primaryKey}
            </span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
