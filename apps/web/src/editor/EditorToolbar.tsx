import { useEffect, useRef, useState } from "react";
import type { MarkdownEditorHandle } from "./MarkdownEditor";
import { insertBlockTemplates } from "./insertBlocks";

/**
 * 编辑器工具栏：插入插件块 + 从选区创建实体。
 * 工具栏操作经 editor handle 走 dispatch，绝不通过 React 重写编辑器内容。
 */
export function EditorToolbar({
  editorHandle,
  onCreateEntityFromSelection
}: {
  editorHandle: MarkdownEditorHandle | null;
  onCreateEntityFromSelection: (name: string) => void;
}) {
  const [insertOpen, setInsertOpen] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // 轮询选区状态（编辑器不向外发选区事件；300ms 足够轻量且不在输入路径上）
  useEffect(() => {
    const t = setInterval(() => {
      setHasSelection(editorHandle?.getSelectionText() != null);
    }, 300);
    return () => clearInterval(t);
  }, [editorHandle]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setInsertOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  return (
    <div ref={wrapRef} className="flex h-10 shrink-0 items-center gap-2 border-b border-hairline bg-parchment px-3">
      <div className="relative">
        <button
          type="button"
          onClick={() => setInsertOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={insertOpen}
          className="whitespace-nowrap rounded-md border border-hairline bg-paper px-2.5 py-1 text-xs text-ink-soft hover:border-brass"
        >
          ＋ 插入 ▾
        </button>
        {insertOpen && (
          <div
            role="menu"
            className="absolute left-0 z-40 mt-1 w-64 rounded-md border border-hairline bg-paper p-1 shadow-lg"
          >
            {insertBlockTemplates.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                role="menuitem"
                className="block w-full rounded px-2.5 py-1.5 text-left hover:bg-parchment"
                onClick={() => {
                  editorHandle?.insertSnippet(tpl.snippet);
                  setInsertOpen(false);
                }}
              >
                <span className="block text-sm">{tpl.label}</span>
                <span className="block text-[11px] text-ink-faint">{tpl.hint}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        disabled={!hasSelection}
        onClick={() => {
          const text = editorHandle?.getSelectionText();
          if (text) onCreateEntityFromSelection(text);
        }}
        title="把选中的文字登记为实体（如选中「阿琳」→ 创建 NPC）"
        className="whitespace-nowrap rounded-md border border-hairline bg-paper px-2.5 py-1 text-xs text-ink-soft hover:border-brass disabled:cursor-not-allowed disabled:opacity-40"
      >
        ✦ 选区 → 实体
      </button>

      <span className="ml-auto hidden whitespace-nowrap text-[11px] text-ink-faint 2xl:inline">
        [[实体名]] 引用 · ::: 指令块 · Cmd/Ctrl+Z 撤销
      </span>
    </div>
  );
}
