import type { ReactNode } from "react";
import { useUiStore, type ContextTab } from "../state/uiStore";

const tabs: { id: ContextTab; label: string }[] = [
  { id: "entity", label: "实体" },
  { id: "suggestions", label: "建议" },
  { id: "questions", label: "提问" },
  { id: "references", label: "引用" }
];

export function ContextPanel({ children }: { children: (tab: ContextTab) => ReactNode }) {
  const contextTab = useUiStore((s) => s.contextTab);
  const openContext = useUiStore((s) => s.openContext);
  const toggleContext = useUiStore((s) => s.toggleContext);

  return (
    <aside
      className="flex h-full w-80 shrink-0 flex-col border-l border-hairline bg-parchment"
      aria-label="上下文面板"
    >
      <div className="flex items-center border-b border-hairline">
        <div className="flex flex-1" role="tablist" aria-label="上下文标签页">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={contextTab === t.id}
              onClick={() => openContext(t.id)}
              className={`flex-1 border-b-2 px-2 py-2 text-xs ${
                contextTab === t.id
                  ? "border-oxblood font-semibold text-ink"
                  : "border-transparent text-ink-soft hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={toggleContext}
          className="px-2 text-ink-faint hover:text-ink"
          aria-label="关闭上下文面板"
        >
          ×
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">{children(contextTab)}</div>
    </aside>
  );
}
