import type { Suggestion } from "@module-atelier/contracts";
import { useUiStore } from "../state/uiStore";
import { kindStyle, statusLabel } from "./kindStyle";

export function SuggestionInbox({ suggestions }: { suggestions: Suggestion[] }) {
  const openSuggestion = useUiStore((s) => s.openSuggestion);
  const selectedSuggestionId = useUiStore((s) => s.selectedSuggestionId);

  const pending = suggestions.filter((s) => s.status === "pending" || s.status === "stale");
  const settled = suggestions.filter((s) => s.status !== "pending" && s.status !== "stale");

  const renderItem = (s: Suggestion) => {
    const st = kindStyle[s.kind];
    const stale = s.status === "stale";
    return (
      <li key={s.id}>
        <button
          type="button"
          onClick={() => openSuggestion(s.id)}
          className={`w-full rounded-md border p-2.5 text-left transition-colors ${
            s.id === selectedSuggestionId ? `${st.border} ${st.bg}` : "border-hairline bg-paper hover:border-brass/50"
          } ${stale ? "opacity-70" : ""}`}
        >
          <span className="flex items-center gap-1.5">
            <span className={`text-sm ${st.text}`} aria-hidden>
              {st.icon}
            </span>
            <span className={`label-caps text-[10px] ${st.text}`}>{st.label}</span>
            {stale && (
              <span className="rounded border border-ink-faint/50 px-1 text-[10px] font-semibold text-ink-faint">
                STALE · 已过期
              </span>
            )}
            <span className="ml-auto text-[10px] text-ink-faint">{statusLabel[s.status]}</span>
          </span>
          <span className={`mt-1 block text-sm leading-snug ${stale ? "text-ink-faint" : "text-ink"}`}>
            {s.title}
          </span>
        </button>
      </li>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <p className="mb-2 px-1 text-[11px] leading-snug text-ink-faint">
        建议静默到达。只有作者打开后，Agent 的工作才会进入视野。
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {pending.length === 0 && settled.length === 0 && (
          <p className="px-1 py-6 text-center text-sm text-ink-faint">收件箱是空的。✦</p>
        )}
        {pending.length > 0 && (
          <>
            <p className="label-caps mb-1 px-1 text-[11px] text-ink-faint">待处理 · {pending.length}</p>
            <ul className="space-y-1.5">{pending.map(renderItem)}</ul>
          </>
        )}
        {settled.length > 0 && (
          <>
            <p className="label-caps mb-1 mt-4 px-1 text-[11px] text-ink-faint">已处理</p>
            <ul className="space-y-1.5">{settled.map(renderItem)}</ul>
          </>
        )}
      </div>
    </div>
  );
}
