/**
 * 插入插件模板。语法为原型暂定（:::directive），最终语法以 Contracts / Parser 为准。
 */
export interface InsertBlockTemplate {
  id: string;
  label: string;
  hint: string;
  snippet: string;
}

export const insertBlockTemplates: InsertBlockTemplate[] = [
  {
    id: "monster",
    label: "怪物资料卡",
    hint: "D&D 式属性卡，随书页排版印刷",
    snippet: `:::monster 怪物名称
挑战等级: 1 (200 XP)
护甲等级: 13
生命值: 22 (3d8 + 9)
速度: 30 尺
力量 14 | 敏捷 12 | 体质 16 | 智力 6 | 感知 10 | 魅力 6
特性: （如无惧、再生等）
:::
`
  },
  {
    id: "info",
    label: "信息框",
    hint: "检定提示、规则备注、DM 备忘",
    snippet: `:::info 标题
写给 DM 的提示正文。
:::
`
  },
  {
    id: "background",
    label: "背景框",
    hint: "世界观背景、历史与传说",
    snippet: `:::background 标题
背景与传说正文。
:::
`
  },
  {
    id: "readaloud",
    label: "朗读框",
    hint: "直接念给玩家听的场景描写",
    snippet: `:::readaloud
用第二人称写、可以直接朗读的场景文字。
:::
`
  },
  {
    id: "encounter",
    label: "遭遇卡",
    hint: "战斗遭遇配置（原型）",
    snippet: `:::info 遭遇：名称
敌人: [[怪物名]] × 数量
地形: …
调整: …
:::
`
  }
];
