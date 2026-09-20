import { useState } from "react";
import type { AuthorQuestion } from "@module-atelier/contracts";

const statusText: Record<AuthorQuestion["status"], string> = {
  watching: "观察中",
  paused: "已暂停",
  resolved: "已解决"
};

const statusColor: Record<AuthorQuestion["status"], string> = {
  watching: "border-forest/50 text-forest",
  paused: "border-brass/50 text-brass",
  resolved: "border-ink-faint/50 text-ink-faint"
};

const helpModeText: Record<AuthorQuestion["helpMode"], string> = {
  canon: "正典",
  muse: "灵感",
  mechanic: "机制",
  any: "不限"
};

export function QuestionPanel({
  questions,
  onCreate,
  onSetStatus,
  busy
}: {
  questions: AuthorQuestion[];
  onCreate: (text: string) => void;
  onSetStatus: (id: string, status: AuthorQuestion["status"]) => void;
  busy: boolean;
}) {
  const [draft, setDraft] = useState("");

  return (
    <div className="flex h-full flex-col gap-3 text-sm">
      <p className="px-1 text-[11px] leading-snug text-ink-faint">
        作者提问是项目对象，不是聊天记录。Agent 会围绕「观察中」的问题工作。
      </p>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const text = draft.trim();
          if (!text) return;
          onCreate(text);
          setDraft("");
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="记录一个创作问题…"
          className="min-w-0 flex-1 rounded-md border border-hairline bg-paper px-2.5 py-1.5 text-sm outline-none placeholder:text-ink-faint focus:border-brass"
          aria-label="新问题"
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          className="shrink-0 rounded-md bg-ink px-3 py-1.5 text-sm text-paper hover:bg-ink-soft disabled:opacity-40"
        >
          记录
        </button>
      </form>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {questions.map((q) => (
          <div key={q.id} className="rounded-md border border-hairline bg-paper p-2.5">
            <p className="flex items-center gap-2 text-[10px]">
              <span className={`rounded-full border px-1.5 py-px ${statusColor[q.status]}`}>
                {statusText[q.status]}
              </span>
              <span className="text-ink-faint">求助方向：{helpModeText[q.helpMode]}</span>
              <span className="ml-auto text-ink-faint">r{q.sourceRevision}</span>
            </p>
            <p className={`mt-1.5 leading-snug ${q.status === "resolved" ? "text-ink-faint line-through" : ""}`}>
              {q.text}
            </p>
            <div className="mt-2 flex gap-1.5 text-xs">
              {q.status !== "watching" && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onSetStatus(q.id, "watching")}
                  className="rounded border border-hairline px-2 py-0.5 text-ink-soft hover:bg-parchment-deep"
                >
                  {q.status === "resolved" ? "重新打开" : "继续观察"}
                </button>
              )}
              {q.status === "watching" && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onSetStatus(q.id, "paused")}
                  className="rounded border border-hairline px-2 py-0.5 text-ink-soft hover:bg-parchment-deep"
                >
                  暂停
                </button>
              )}
              {q.status !== "resolved" && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onSetStatus(q.id, "resolved")}
                  className="rounded border border-forest/50 px-2 py-0.5 text-forest hover:bg-forest/10"
                >
                  标记解决
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
