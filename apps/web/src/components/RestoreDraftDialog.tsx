import type { RecoveryDecision } from "../drafts/recovery";

/**
 * 草稿恢复对话框：本地草稿比服务端新时询问作者。
 * 绝不自动覆盖服务端内容。
 */
export function RestoreDraftDialog({
  decision,
  onResolve
}: {
  decision: RecoveryDecision;
  onResolve: (choice: "restore-draft" | "use-server" | "keep-draft") => void;
}) {
  if (decision.action !== "prompt-restore") return null;
  const { draft, server } = decision;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="恢复本地草稿"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-6"
    >
      <div className="w-full max-w-lg rounded-lg border border-hairline bg-parchment p-5 shadow-2xl">
        <h2 className="text-base font-semibold">检测到未保存的本地草稿</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          此文档在本地留有一份草稿（{new Date(draft.updatedAt).toLocaleString("zh-CN")}）， 比服务端版本（r
          {server.revision} · {new Date(server.updatedAt).toLocaleString("zh-CN")}）更新， 且内容不同。
          可能是上次离线或浏览器崩溃前未保存的内容。
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded border border-hairline bg-paper p-2">
            <p className="label-caps text-[10px] text-ink-faint">草稿开头</p>
            <p className="mt-1 line-clamp-3">{draft.content.slice(0, 120)}</p>
          </div>
          <div className="rounded border border-hairline bg-paper p-2">
            <p className="label-caps text-[10px] text-ink-faint">服务端开头</p>
            <p className="mt-1 line-clamp-3">{server.content.slice(0, 120)}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => onResolve("restore-draft")}
            className="rounded-md bg-ink px-4 py-2 text-sm text-paper hover:bg-ink-soft"
          >
            恢复本地草稿（标为未保存，由我决定何时保存）
          </button>
          <button
            type="button"
            onClick={() => onResolve("use-server")}
            className="rounded-md border border-hairline px-4 py-2 text-sm text-ink-soft hover:bg-parchment-deep"
          >
            使用服务端版本（丢弃草稿）
          </button>
          <button
            type="button"
            onClick={() => onResolve("keep-draft")}
            className="rounded-md px-4 py-1 text-xs text-ink-faint hover:text-ink"
          >
            先查看服务端版本，草稿保留，下次再问我
          </button>
        </div>
      </div>
    </div>
  );
}
