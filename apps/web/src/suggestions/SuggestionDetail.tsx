import type { Suggestion } from "@module-atelier/contracts";
import { isSuggestionStale } from "../utils/suggestions";
import { kindStyle, statusLabel } from "./kindStyle";

export function SuggestionDetail({
  suggestion,
  currentRevisions,
  onAction,
  onOpenPatchReview,
  onBack,
  busy
}: {
  suggestion: Suggestion;
  currentRevisions: ReadonlyMap<string, number>;
  onAction: (action: "accept" | "reject" | "later" | "regenerate") => void;
  onOpenPatchReview: () => void;
  onBack: () => void;
  busy: boolean;
}) {
  const st = kindStyle[suggestion.kind];
  const settled = suggestion.status === "accepted" || suggestion.status === "rejected";
  // 已处理的建议不再显示过期警告（接受/拒绝本身就会推动 revision 前进）
  const stale = !settled && isSuggestionStale(suggestion, currentRevisions);

  return (
    <article className="flex h-full flex-col" aria-label="建议详情">
      <button
        type="button"
        onClick={onBack}
        className="mb-2 self-start rounded px-1.5 py-0.5 text-xs text-ink-faint hover:bg-parchment-deep hover:text-ink"
      >
        ← 返回收件箱
      </button>
      <header className={`rounded-md border p-3 ${st.border} ${st.bg}`}>
        <p className="flex items-center gap-1.5">
          <span className={st.text} aria-hidden>
            {st.icon}
          </span>
          <span className={`label-caps text-[10px] ${st.text}`}>{st.label}</span>
          <span className="ml-auto text-[10px] text-ink-faint">{statusLabel[suggestion.status]}</span>
        </p>
        <h3 className="mt-1 text-sm font-semibold leading-snug">{suggestion.title}</h3>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto py-3 text-sm">
        {stale && (
          <p className="rounded-md border border-ink-faint/50 bg-parchment-deep px-3 py-2 text-xs text-ink-soft">
            <strong>STALE · 此建议已过期。</strong>它基于的文稿已被修改，不能直接应用。
            可以请求重新生成，或关闭它。
          </p>
        )}
        <section>
          <h4 className="label-caps text-[11px] text-ink-faint">观察</h4>
          <p className="mt-1 leading-relaxed">{suggestion.observation}</p>
        </section>
        {suggestion.question && (
          <section>
            <h4 className="label-caps text-[11px] text-ink-faint">留给作者的问题</h4>
            <p className="mt-1 leading-relaxed text-azure">{suggestion.question}</p>
          </section>
        )}
        <section>
          <h4 className="label-caps text-[11px] text-ink-faint">触发原因</h4>
          <p className="mt-1 text-xs text-ink-soft">{suggestion.triggerReason}</p>
        </section>
        <section>
          <h4 className="label-caps text-[11px] text-ink-faint">依据</h4>
          <ul className="mt-1 space-y-1 text-xs text-ink-soft">
            {suggestion.sourceReferences.map((r) => (
              <li key={r} className="rounded border border-hairline bg-paper px-2 py-1">
                {r}
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h4 className="label-caps text-[11px] text-ink-faint">相关修订</h4>
          <p className="mt-1 text-xs text-ink-soft">
            {Object.entries(suggestion.relevantRevisionMap)
              .map(([res, rev]) => {
                const cur = currentRevisions.get(res);
                const behind = cur !== undefined && cur > rev;
                return `${res} @ r${rev}${behind ? `（当前 r${cur}）` : ""}`;
              })
              .join(" · ")}
          </p>
        </section>
      </div>

      <footer className="space-y-2 border-t border-hairline pt-2">
        {suggestion.patchSetId && !settled && (
          <button
            type="button"
            onClick={onOpenPatchReview}
            disabled={stale}
            className="w-full rounded-md border border-arcane/60 px-3 py-1.5 text-sm text-arcane hover:bg-arcane/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            查看补丁（Patch Review）
          </button>
        )}
        <div className="flex gap-2">
          {settled ? (
            <p className="w-full text-center text-xs text-ink-faint">此建议已处理完毕。</p>
          ) : stale ? (
            <>
              <button
                type="button"
                onClick={() => onAction("regenerate")}
                disabled={busy}
                className="flex-1 rounded-md bg-ink px-3 py-1.5 text-sm text-paper hover:bg-ink-soft disabled:opacity-40"
              >
                重新生成
              </button>
              <button
                type="button"
                onClick={() => onAction("reject")}
                disabled={busy}
                className="flex-1 rounded-md border border-hairline px-3 py-1.5 text-sm text-ink-soft hover:bg-parchment-deep"
              >
                关闭
              </button>
            </>
          ) : (
            <>
              {!suggestion.patchSetId && (
                <button
                  type="button"
                  onClick={() => onAction("accept")}
                  disabled={busy}
                  className="flex-1 rounded-md bg-ink px-3 py-1.5 text-sm text-paper hover:bg-ink-soft disabled:opacity-40"
                >
                  接受
                </button>
              )}
              <button
                type="button"
                onClick={() => onAction("later")}
                disabled={busy}
                className="flex-1 rounded-md border border-hairline px-3 py-1.5 text-sm text-ink-soft hover:bg-parchment-deep"
              >
                稍后
              </button>
              <button
                type="button"
                onClick={() => onAction("reject")}
                disabled={busy}
                className="flex-1 rounded-md border border-oxblood/50 px-3 py-1.5 text-sm text-oxblood hover:bg-oxblood/10"
              >
                拒绝
              </button>
            </>
          )}
        </div>
      </footer>
    </article>
  );
}
