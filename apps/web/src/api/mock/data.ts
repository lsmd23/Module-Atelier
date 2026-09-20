import type {
  AuthorQuestion,
  Document,
  Entity,
  PatchSet,
  Project,
  Suggestion
} from "@module-atelier/contracts";

/*
 * MOCK ONLY —— 演示项目「雾锁矿脉」的全部数据。
 * 真实数据将来自 apps/api（BE-001 之后），此处仅为前端原型服务。
 */

const T = "2026-09-19T10:00:00Z";

export const mockProject: Project = {
  id: "proj-veil",
  name: "雾锁矿脉",
  createdAt: T,
  updatedAt: T
};

const chapter1Content = `# 第一章 雾抵白鸦镇

商队在黄昏前抵达了[[白鸦镇]]。浓雾从北方的山脊压下来，像一床浸了水的灰毯，把镇口的绞架和路牌一并吞没。

:::readaloud
你们走进镇子时，几乎听不到狗吠。酒馆「醉鸦」的窗缝里透出暖光，一个女人的声音在里头不紧不慢地拨着算盘。
:::

酒馆老板[[阿琳]]站在吧台后面，似乎一直在观察入口。她三十岁上下，左手缺了无名指——她说是年轻时在[[北方矿井]]里丢的。

> 设计笔记：阿琳知道矿难当晚发生的事，但她不会主动提起。

## 镇长的警告

镇长[[布劳恩]]拒绝透露任何信息。他只反复说一句话：「井下的事，归井管。」

:::info 检定提示
察觉（DC 12）：注意到布劳恩提到矿井时右手一直按着胸口的银徽记。
游说（DC 15）：若角色们出示矿工行会的旧印，他会松口透露一条走私道。
:::

## 夜宿

夜里值夜的角色会听到雾里有镐头敲击石头的声音——节奏规整，像有人在数拍子。
`;

const chapter2Content = `# 第二章 北方矿井

:::background 矿难始末
三年前，北方矿井的七号巷道塌了，十七名矿工没能出来。官方记录写的是瓦斯爆炸，但幸存者们私下里都说，那一晚井下先响起了歌声。
:::

矿井入口被铁链封着，锁头上挂着镇公所的铜印。链环的断口很新。

一只[[灰鳞巨魔]]在塌方区筑了巢。它不怕火，但畏惧钟声——这是矿工们用命换来的情报。

:::monster 灰鳞巨魔
挑战等级: 5 (1,800 XP)
护甲等级: 15 (天然护甲)
生命值: 84 (8d10 + 40)
速度: 30 尺
力量 18 | 敏捷 13 | 体质 20 | 智力 7 | 感知 9 | 魅力 7
抗性: 火焰
弱点: 钟声震慑（听到钟声后须过 DC 14 感知豁免，否则震慑 1 轮）
:::

:::info 遭遇平衡
四名 3 级角色面对巨魔属于「艰难」遭遇。若角色们先取得教堂的铜钟，难度降为「中等」。
:::
`;

export const mockDocuments: Document[] = [
  {
    id: "doc-ch1",
    projectId: "proj-veil",
    title: "第一章 雾抵白鸦镇",
    content: chapter1Content,
    revision: 7,
    createdAt: T,
    updatedAt: "2026-09-19T18:30:00Z"
  },
  {
    id: "doc-ch2",
    projectId: "proj-veil",
    title: "第二章 北方矿井",
    content: chapter2Content,
    revision: 3,
    createdAt: T,
    updatedAt: "2026-09-19T16:10:00Z"
  }
];

export const mockEntities: Entity[] = [
  {
    id: "ent-arin",
    projectId: "proj-veil",
    type: "npc",
    name: "阿琳",
    aliases: ["醉鸦老板", "缺指的阿琳"],
    description: "酒馆「醉鸦」的老板，左缺无名指。矿难当晚她在七号巷道外当班，知道一些没有写进官方记录的事。",
    structuredData: { 职业: "酒馆老板", 阵营: "中立善良", 所在地: "白鸦镇" },
    revision: 4,
    status: "confirmed"
  },
  {
    id: "ent-braun",
    projectId: "proj-veil",
    type: "npc",
    name: "布劳恩",
    aliases: ["镇长"],
    description: "白鸦镇镇长，胸口佩一枚银徽记。明面上封锁矿井话题，暗地里在偿还一笔旧债。",
    structuredData: { 职业: "镇长", 阵营: "守序中立" },
    revision: 2,
    status: "confirmed"
  },
  {
    id: "ent-whiteraven",
    projectId: "proj-veil",
    type: "location",
    name: "白鸦镇",
    aliases: [],
    description: "矿道尽头的山镇，常年被北坡下来的雾压着。镇口有一座从没用过的绞架。",
    structuredData: { 人口: "约 400", 产业: "银矿、羊毛" },
    revision: 3,
    status: "confirmed"
  },
  {
    id: "ent-mine",
    projectId: "proj-veil",
    type: "location",
    name: "北方矿井",
    aliases: ["七号巷道"],
    description: "三年前塌方后封闭的银矿。夜里会传出数拍子一样的镐声。",
    structuredData: { 状态: "封闭", 危险等级: "高" },
    revision: 5,
    status: "rumor"
  },
  {
    id: "ent-troll",
    projectId: "proj-veil",
    type: "monster",
    name: "灰鳞巨魔",
    aliases: [],
    description: "在塌方区筑巢的巨魔亚种，鳞甲呈湿灰色。不怕火，畏惧钟声。",
    structuredData: { 挑战等级: 5, 生命值: 84 },
    revision: 1,
    status: "draft"
  },
  {
    id: "ent-guild",
    projectId: "proj-veil",
    type: "faction",
    name: "矿工行会",
    aliases: ["旧行会"],
    description: "矿难后名存实亡的行会。旧印仍能在镇上换来一些沉默的敬意。",
    structuredData: {},
    revision: 1,
    status: "belief"
  }
];

/*
 * PatchSet 演示：Agent 提议「创建线索实体 + 修改第二章正文」，
 * 两个操作有依赖（正文引用新实体），必须成组审阅。
 */
export const mockPatchSet: PatchSet = {
  id: "ps-echo-1",
  projectId: "proj-veil",
  baseRevisions: { "doc-ch2": 3 },
  operations: [
    {
      op: "create_entity",
      entity: {
        id: "ent-clue-bell",
        projectId: "proj-veil",
        type: "clue",
        name: "锈铜钟锤",
        aliases: [],
        description: "矿洞口碎石堆里埋着的铜钟锤，钟体已不在。锤柄上刻着行会旧印的纹样。",
        structuredData: {},
        status: "draft"
      }
    },
    {
      op: "update_document",
      documentId: "doc-ch2",
      baseRevision: 3,
      content: chapter2Content.replace(
        "链环的断口很新。",
        "链环的断口很新。断口旁的碎石堆里埋着一柄[[锈铜钟锤]]，锤柄上刻着矿工行会的旧印。"
      )
    }
  ],
  dependencies: ["op-2 依赖 op-1 创建的线索实体"],
  source: "agent",
  status: "pending"
};

export const mockSuggestions: Suggestion[] = [
  {
    id: "sug-canon-age",
    projectId: "proj-veil",
    kind: "canon",
    triggerReason: "检测到跨章节设定引用不一致",
    sourceReferences: ["doc-ch1: 阿琳自称矿难时已在矿上当班", "ent-mine: 矿难发生于三年前"],
    relevantRevisionMap: { "doc-ch1": 7 },
    title: "阿琳的年龄可能与矿难时间冲突",
    observation:
      "阿琳「三十岁上下」，且自称无名指「年轻时在矿里丢的」。若矿难发生在三年前、她当时已在七号巷道外当班，则她当时约二十七岁，与「年轻时」的措辞略有张力。可以是有意的谎言（她比看起来更年轻/更年长），建议确认或留作伏笔。",
    question: "阿琳的年龄是笔误，还是她刻意隐瞒的伏笔？",
    status: "pending",
    createdAt: "2026-09-19T19:02:00Z"
  },
  {
    id: "sug-mech-bell",
    projectId: "proj-veil",
    kind: "mechanical",
    triggerReason: "遭遇参照完整性检查",
    sourceReferences: ["doc-ch2: 遭遇平衡信息框", "ent-troll: 灰鳞巨魔"],
    relevantRevisionMap: { "doc-ch2": 3 },
    title: "第二章遭遇缺少「铜钟」的可获取路径",
    observation:
      "信息框写「若角色们先取得教堂的铜钟，难度降为中等」，但全文没有任何段落说明铜钟在哪里、如何取得。读者（DM）无法执行这条建议。",
    patchSetId: "ps-echo-1",
    status: "pending",
    createdAt: "2026-09-19T19:05:00Z"
  },
  {
    id: "sug-muse-echo",
    projectId: "proj-veil",
    kind: "idea",
    triggerReason: "Ambient Muse：章节氛围分析",
    sourceReferences: ["doc-ch1: 夜宿", "ent-mine"],
    relevantRevisionMap: { "doc-ch1": 7 },
    title: "镐声的「数拍子」可以成为回响母题",
    observation:
      "第一章夜里「数拍子一样的镐声」很有记忆点。如果后文井下也响起同样的节奏——而角色们意识到那是求救信号的旧式敲击码——前两章的意象就扣上了。",
    status: "pending",
    createdAt: "2026-09-19T20:11:00Z"
  },
  {
    id: "sug-stale-map",
    projectId: "proj-veil",
    kind: "draft",
    triggerReason: "结构草稿：地点关联补全",
    sourceReferences: ["ent-whiteraven", "ent-mine"],
    relevantRevisionMap: { "doc-ch1": 4 },
    title: "草稿：白鸦镇与矿井之间的走私道",
    observation: "基于旧版本正文生成的走私道段落草稿。正文自那以后已修改，草稿可能不再贴合。",
    status: "stale",
    createdAt: "2026-09-18T09:40:00Z"
  }
];

export const mockQuestions: AuthorQuestion[] = [
  {
    id: "q-bell",
    projectId: "proj-veil",
    documentId: "doc-ch2",
    text: "教堂的铜钟为什么能震慑灰鳞巨魔？这背后和矿难那晚的「歌声」有关吗？",
    helpMode: "canon",
    status: "watching",
    sourceRevision: 3
  },
  {
    id: "q-king",
    projectId: "proj-veil",
    documentId: "doc-ch1",
    text: "镇口的绞架从来没用过——是立给谁看的？",
    helpMode: "any",
    status: "paused",
    sourceRevision: 7
  },
  {
    id: "q-gallows",
    projectId: "proj-veil",
    documentId: "doc-ch1",
    text: "布劳恩欠的旧债是欠谁的？",
    helpMode: "muse",
    status: "resolved",
    sourceRevision: 6
  }
];
