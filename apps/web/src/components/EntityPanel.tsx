import type { Entity } from "@module-atelier/contracts";

const statusText: Record<Entity["status"], string> = {
  confirmed: "已确认",
  draft: "草稿",
  rumor: "传闻",
  belief: "角色认知",
  conditional: "有条件成立",
  ambiguous: "刻意模糊"
};

const typeText: Record<Entity["type"], string> = {
  npc: "NPC",
  location: "地点",
  faction: "派系",
  monster: "怪物",
  encounter: "遭遇",
  item: "物品",
  clue: "线索"
};

export function EntityPanel({ entity, referencedBy }: { entity: Entity | null; referencedBy: string[] }) {
  if (!entity) {
    return (
      <p className="px-1 py-6 text-center text-sm text-ink-faint">
        在左侧选择实体，或在正文中点击 [[引用]]。
      </p>
    );
  }
  const fields = Object.entries(entity.structuredData);
  return (
    <article className="space-y-4 text-sm" aria-label={`实体：${entity.name}`}>
      <header>
        <p className="label-caps text-[11px] text-ink-faint">
          {typeText[entity.type]} · r{entity.revision}
        </p>
        <h3 className="mt-0.5 text-lg font-semibold">{entity.name}</h3>
        {entity.aliases.length > 0 && (
          <p className="mt-0.5 text-xs text-ink-soft">又名：{entity.aliases.join("、")}</p>
        )}
        <p className="mt-1">
          <span className="rounded-full border border-hairline px-2 py-0.5 text-[11px] text-ink-soft">
            {statusText[entity.status]}
          </span>
        </p>
      </header>

      <section>
        <h4 className="label-caps text-[11px] text-ink-faint">描述</h4>
        <p className="mt-1 leading-relaxed">{entity.description || "（暂无描述）"}</p>
      </section>

      {fields.length > 0 && (
        <section>
          <h4 className="label-caps text-[11px] text-ink-faint">结构化字段</h4>
          <dl className="mt-1 space-y-1">
            {fields.map(([k, v]) => (
              <div key={k} className="flex gap-2 text-[13px]">
                <dt className="w-20 shrink-0 text-ink-faint">{k}</dt>
                <dd className="text-ink">{String(v)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section>
        <h4 className="label-caps text-[11px] text-ink-faint">被引用于</h4>
        {referencedBy.length === 0 ? (
          <p className="mt-1 text-xs text-ink-faint">（暂无引用）</p>
        ) : (
          <ul className="mt-1 space-y-1 text-[13px] text-ink-soft">
            {referencedBy.map((r) => (
              <li key={r} className="rounded border border-hairline bg-paper px-2 py-1">
                {r}
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}
