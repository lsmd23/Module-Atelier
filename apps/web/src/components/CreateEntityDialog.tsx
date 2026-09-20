import { useState } from "react";
import { entityTypes, type EntityType } from "@module-atelier/contracts";

const typeLabel: Record<EntityType, string> = {
  npc: "NPC",
  location: "地点",
  faction: "派系",
  monster: "怪物",
  encounter: "遭遇",
  item: "物品",
  clue: "线索"
};

/**
 * 创建实体。核心场景：作者在正文里选中一个词（如「阿琳」）→ 创建实体。
 * 结构化数据不挡路：名字 + 类型即可建立，其余以后补。
 */
export function CreateEntityDialog({
  initialName,
  initialType,
  onSubmit,
  onClose,
  busy
}: {
  initialName: string;
  initialType: EntityType | null;
  onSubmit: (type: EntityType, name: string) => void;
  onClose: () => void;
  busy: boolean;
}) {
  const [name, setName] = useState(initialName);
  const [type, setType] = useState<EntityType>(initialType ?? "npc");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="创建实体"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-hairline bg-parchment p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold">创建实体</h2>
        <p className="mt-1 text-xs text-ink-faint">先有名字，细节以后补。写作不被表单打断。</p>
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) onSubmit(type, name.trim());
          }}
        >
          <label className="block text-sm">
            <span className="label-caps text-[11px] text-ink-faint">名称</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="mt-1 w-full rounded-md border border-hairline bg-paper px-3 py-2 text-sm outline-none focus:border-brass"
            />
          </label>
          <fieldset>
            <legend className="label-caps text-[11px] text-ink-faint">类型</legend>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {entityTypes.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  aria-pressed={type === t}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    type === t
                      ? "border-oxblood bg-oxblood text-paper"
                      : "border-hairline text-ink-soft hover:border-brass"
                  }`}
                >
                  {typeLabel[t]}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-hairline px-4 py-1.5 text-sm text-ink-soft hover:bg-parchment-deep"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="rounded-md bg-ink px-4 py-1.5 text-sm text-paper hover:bg-ink-soft disabled:opacity-40"
            >
              创建
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
