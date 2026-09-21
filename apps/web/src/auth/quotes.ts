/**
 * 进入页品牌栏的轮替名言。
 * 出处分两类：官方作品（标注书名，含官方授权游戏）与桌面传统（约定俗成的桌边格言）。
 */
export interface TableQuote {
  text: string;
  source: string;
  /** official = D&D 官方作品；table = 桌面传统格言 */
  origin: "official" | "table";
}

export const tableQuotes: TableQuote[] = [
  // ── 官方作品 ──────────────────────────────────────────
  { text: "不要相信任何人。", source: "《珊娜萨的万事指南》", origin: "official" },
  { text: "他是远古者。他就是这片土地。", source: "《斯特拉德的诅咒》", origin: "official" },
  { text: "赞美晨光之主。", source: "《斯特拉德的诅咒》", origin: "official" },
  { text: "鸦阁的迷雾正在升起。", source: "《鸦阁》系列", origin: "official" },
  { text: "以九狱之名！", source: "被遗忘的国度", origin: "official" },
  { text: "费伦是一片魔法之地。", source: "被遗忘的国度", origin: "official" },
  { text: "你必须先集合队伍，才能启程。", source: "《博德之门》", origin: "official" },
  { text: "瞄准眼睛，小布！瞄准眼睛！", source: "《博德之门》· 明斯克", origin: "official" },
  { text: "世界需要英雄。", source: "《玩家手册》", origin: "official" },
  { text: "每只怪物都是一个等待被讲述的故事。", source: "《怪物图鉴》", origin: "official" },

  // ── 桌面传统 ──────────────────────────────────────────
  { text: "你们在一家酒馆里相遇。", source: "每一部冒险的开场", origin: "table" },
  { text: "先攻检定。", source: "Roll for initiative.", origin: "table" },
  { text: "绝不要分头行动。", source: "桌面生存第一法则", origin: "table" },
  { text: "记得检查陷阱。", source: "桌面生存第二法则", origin: "table" },
  { text: "宝箱也许是拟身怪。", source: "桌面生存第三法则", origin: "table" },
  { text: "你当然可以试试看。", source: "DM 的名言（You can certainly try.）", origin: "table" },
  { text: "你想怎么解决它？", source: "致命一击前的提问", origin: "table" },
  { text: "我施放火球术。", source: "每个术士的最终答案", origin: "table" },
  { text: "这正是我角色会做的事。", source: "团灭前的名台词", origin: "table" },
  { text: "落石滚滚，全员团灭。", source: "桌面黑色幽默", origin: "table" },
  { text: "天然 20！", source: "桌面欢呼", origin: "table" },
  { text: "你不是你的骰点。", source: "桌面格言", origin: "table" },
  { text: "骰子是善变的神。", source: "桌面格言", origin: "table" },
  { text: "城主不是你的敌人——通常不是。", source: "桌面格言", origin: "table" },
  { text: "酒馆老板知道的总比说的多。", source: "桌面格言", origin: "table" },
  { text: "此处有龙。", source: "Here be dragons.", origin: "table" },
  { text: "别插手龙的事务——你又脆，又配番茄酱好吃。", source: "桌面格言", origin: "table" },
  { text: "故事不在书里，在桌上。", source: "桌面格言", origin: "table" },
  { text: "愿你的骰子永远滚烫。", source: "桌面祝福", origin: "table" },
  { text: "火光之外，黑暗自有眼睛。", source: "城主须知", origin: "table" },
  { text: "每一扇门的后面，都是另一个世界。", source: "桌面格言", origin: "table" }
];
