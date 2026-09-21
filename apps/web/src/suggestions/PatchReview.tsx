import { useEffect, useMemo, useState } from "react";
import type { Document, PatchSet, Suggestion } from "@module-atelier/contracts";
import { api } from "../api";
import { diffLines } from "../utils/diff";
import { kindStyle } from "./kindStyle";

/**
 * Patch Review —— Agent 正式改动作品前的作者审阅关卡。
 * 规则：
 * - 展示每个操作、操作间依赖、目标资源 baseRevision；
 * - 有关联依赖的操作成组展示，整组接受/拒绝；
 * - 目标文档存在未保存的本地修改时禁止应用（防止覆盖作者内容）；
 * - STALE 建议的补丁禁止应用。
 */

function DocumentDiff({ patchSet, documents }: { patchSet: PatchSet; documents: Document[] }) {
  const updates = patchSet.operations.filter((op) => op.op === "update_document");
  if (updates.length === 0) return null;
  return (
    <div className="space-y-3">
      {updates.map((op) => {
        if (op.op !== "update_document") return null;
        const doc = documents.find((d) => d.id === op.documentId);
        const base = doc?.content ?? "";
        const lines = diffLines(base, op.content);
        return (
          <div key={op.documentId} className="overflow-hidden rounded-md border border-hairline">
            <p className="border-b border-hairline bg-parchment px-3 py-1.5 text-xs text-ink-soft">
              修改文档：{doc?.title ?? op.documentId}（基于 r{op.baseRevision}）
            </p>
            <pre className="max-h-64 overflow-auto bg-paper p-3 text-[12.5px] leading-relaxed">
              {lines.map((l, i) => (
                <div
                  key={i}
                  className={
                    l.type === "added"
                      ? "bg-forest/15 text-forest"
                      : l.type === "removed"
                        ? "bg-oxblood/10 text-oxblood line-through"
                        : "text-ink-faint"
                  }
                >
                  {l.type === "added" ? "+ " : l.type === "removed" ? "− " : "  "}
                  {l.text}
                </div>
              ))}
            </pre>
          </div>
        );
      })}
    </div>
  );
}

export function PatchReview({
  suggestion,
  documents,
  applyBlockedReason,
  onClose,
  onApply,
  onReject,
  busy
}: {
  suggestion: Suggestion;
  documents: Document[];
  applyBlockedReason: string | null;
  onClose: () => void;
  onApply: () => void;
  onReject: () => void;
  busy: boolean;
}) {
  const [patchSet, setPatchSet] = useState<PatchSet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const st = kindStyle[suggestion.kind];

  useEffect(() => {
    let cancelled = false;
    if (!suggestion.patchSetId) return;
    api
      .getPatchSet(suggestion.patchSetId)
      .then((ps) => {
        if (!cancelled) setPatchSet(ps);
      })
      .catch(() => {
        if (!cancelled) setError("补丁加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, [suggestion.patchSetId]);

  const createdEntities = useMemo(
    () => (patchSet ? patchSet.operations.filter((op) => op.op === "create_entity") : []),
    [patchSet]
  );

  const opCount = patchSet?.operations.length ?? 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="补丁审阅"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg border border-hairline bg-parchment shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-hairline p-4">
          <p className={`flex items-center gap-1.5 text-xs ${st.text}`}>
            <span aria-hidden>{st.icon}</span> {st.label}建议 · 补丁审阅
          </p>
          <h2 className="mt-1 text-base font-semibold">{suggestion.title}</h2>
          {patchSet && (
            <p className="mt-1 text-xs text-ink-soft">
              {opCount > 1 ? `${opCount} 个相互关联的变更（成组应用）` : "1 个变更"}
              {patchSet.dependencies.length > 0 && ` · 依赖：${patchSet.dependencies.join("；")}`}
            </p>
          )}
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {error && <p className="text-sm text-oxblood">{error}</p>}
          {!patchSet && !error && <p className="text-sm text-ink-faint">正在取回补丁…</p>}

          {createdEntities.length > 0 && (
            <div className="space-y-2">
              {createdEntities.map((op) => {
                if (op.op !== "create_entity") return null;
                const e = op.entity;
                return (
                  <div key={e.id} className="rounded-md border border-forest/40 bg-forest/5 p-3">
                    <p className="text-xs font-semibold text-forest">＋ 新建实体 · {e.type}</p>
                    <p className="mt-1 text-sm font-semibold">{e.name}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{e.description}</p>
                  </div>
                );
              })}
            </div>
          )}

          {patchSet && <DocumentDiff patchSet={patchSet} documents={documents} />}

          {patchSet && (
            <p className="text-[11px] leading-relaxed text-ink-faint">
              应用将基于修订 {JSON.stringify(patchSet.baseRevisions)} 原子执行：任何一个资源的
              revision 不再匹配，整组变更都会被拒绝，不会写入一半。
            </p>
          )}
        </div>

        <footer className="flex items-center gap-2 border-t border-hairline p-4">
          {applyBlockedReason && <p className="mr-auto text-xs text-oxblood">{applyBlockedReason}</p>}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-hairline px-4 py-1.5 text-sm text-ink-soft hover:bg-parchment-deep"
          >
            返回
          </button>
          <button
            type="button"
            onClick={onReject}
            disabled={busy}
            className="rounded-md border border-oxblood/50 px-4 py-1.5 text-sm text-oxblood hover:bg-oxblood/10 disabled:opacity-40"
          >
            拒绝整组
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={busy || applyBlockedReason !== null || !patchSet}
            className="rounded-md bg-ink px-4 py-1.5 text-sm text-paper hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-40"
          >
            接受并应用
          </button>
        </footer>
      </div>
    </div>
  );
}
