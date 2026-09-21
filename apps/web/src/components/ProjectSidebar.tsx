import { useMemo, useState } from "react";
import type { Document, Entity, EntityType } from "@module-atelier/contracts";
import { useUiStore } from "../state/uiStore";

const sections: { type: EntityType; label: string }[] = [
  { type: "npc", label: "NPC" },
  { type: "location", label: "地点" },
  { type: "faction", label: "派系" },
  { type: "monster", label: "怪物" },
  { type: "encounter", label: "遭遇" },
  { type: "item", label: "物品" },
  { type: "clue", label: "线索" }
];

const statusDot: Record<Entity["status"], string> = {
  confirmed: "bg-forest",
  draft: "bg-brass",
  rumor: "bg-azure",
  belief: "bg-arcane",
  conditional: "bg-ink-faint",
  ambiguous: "bg-oxblood"
};

export function ProjectSidebar({
  documents,
  entities,
  onCreateEntity,
  onCreateDocument
}: {
  documents: Document[];
  entities: Entity[];
  onCreateEntity: (type: EntityType) => void;
  onCreateDocument: () => void;
}) {
  const currentDocumentId = useUiStore((s) => s.currentDocumentId);
  const openDocument = useUiStore((s) => s.openDocument);
  const selectEntity = useUiStore((s) => s.selectEntity);
  const selectedEntityId = useUiStore((s) => s.selectedEntityId);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return entities;
    return entities.filter((e) => e.name.includes(q) || e.aliases.some((a) => a.includes(q)));
  }, [entities, query]);

  const filteredDocs = useMemo(() => {
    const q = query.trim();
    if (!q) return documents;
    return documents.filter((d) => d.title.includes(q));
  }, [documents, query]);

  return (
    <nav className="flex h-full w-60 shrink-0 flex-col border-r border-hairline bg-parchment" aria-label="项目导航">
      <div className="border-b border-hairline p-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索章节与实体…"
          className="w-full rounded-md border border-hairline bg-paper px-2.5 py-1.5 text-sm outline-none placeholder:text-ink-faint focus:border-brass"
          aria-label="搜索项目"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <div className="mb-3">
          <div className="rule-ornament mb-1.5 px-1">
            <span className="label-caps text-[11px]">章节</span>
            <button
              type="button"
              onClick={onCreateDocument}
              className="rounded px-1 text-xs text-ink-faint hover:text-oxblood"
              aria-label="新建章节"
              title="新建章节"
            >
              ＋
            </button>
          </div>
          <ul>
            {filteredDocs.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => openDocument(d.id)}
                  aria-current={d.id === currentDocumentId ? "page" : undefined}
                  className={`block w-full truncate rounded px-2.5 py-1.5 text-left text-sm ${
                    d.id === currentDocumentId
                      ? "bg-ink/8 font-semibold text-ink"
                      : "text-ink-soft hover:bg-parchment-deep"
                  }`}
                >
                  {d.title}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {sections.map((sec) => {
          const items = filtered.filter((e) => e.type === sec.type);
          return (
            <div key={sec.type} className="mb-3">
              <div className="rule-ornament mb-1.5 px-1">
                <span className="label-caps text-[11px]">
                  {sec.label}
                  {items.length > 0 && <span className="ml-1 text-ink-faint">{items.length}</span>}
                </span>
                <button
                  type="button"
                  onClick={() => onCreateEntity(sec.type)}
                  className="rounded px-1 text-xs text-ink-faint hover:text-oxblood"
                  aria-label={`新建${sec.label}`}
                  title={`新建${sec.label}`}
                >
                  ＋
                </button>
              </div>
              {items.length === 0 ? (
                <p className="px-2.5 text-xs text-ink-faint/70">—</p>
              ) : (
                <ul>
                  {items.map((e) => (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() => selectEntity(e.id)}
                        className={`flex w-full items-center gap-1.5 truncate rounded px-2.5 py-1 text-left text-sm ${
                          e.id === selectedEntityId
                            ? "bg-ink/8 font-semibold text-ink"
                            : "text-ink-soft hover:bg-parchment-deep"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDot[e.status]}`}
                          title={`状态：${e.status}`}
                        />
                        <span className="truncate">{e.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
