# Classic Fantasy layout spec（出版技术 spike）

## 来源与边界

本规格从 `docs/examplePDF/5eDnD_凡戴尔的失落矿坑_模组_中译(二校).pdf` 的结构关系提炼而来。参考样例含第三方品牌标识、插画/装饰、字体和原文；本项目不复制这些资产，也不把具体页面当作模板。以下是可独立实现的版式约束。

## 页面与网格

- 纸张：A4，595 × 842 pt（210 × 297 mm）。
- 正文页外边距目标：左右约 20–21 mm；上约 26–32 mm；下约 22–26 mm。Spike 使用 `20 mm 20 mm 26 mm 22 mm`（左/右/上/下）。
- 双栏：两栏等宽；参考页文本框约 224 pt（78.8 mm）宽，栏间距约 26 pt（9.1 mm）。Spike 使用 9 mm 栏间距。
- 正文可用宽度约 170 mm；正文页不做满版出血。
- 页眉/页脚不侵入正文栏；页脚显示当前页码与总页数，页眉显示项目名/副标题。

## 字体角色

- 正文：中文衬线，目标 `Noto Serif SC`（SIL OFL 1.1）；部署不可用时按明确顺序回退 `Songti SC` / `STSong`，并产生字体诊断。
- 标题：同一 CJK 衬线族的 semibold，英文副标题可使用 Georgia/系统 serif fallback；不使用参考样例中的品牌字体。
- 规则框/统计块标签：衬线 semibold，小号；数据表可使用同一衬线族，避免中英混排时字形跳变。
- 正文目标字号约 9–9.5 pt，行高约 1.5–1.55；statblock 可降至约 8.3–8.5 pt。
- 字体版本、许可证和加载结果必须写入发布记录；不能依赖公网 CDN。

## 颜色与装饰

- 章节标题深红：`#7a1e18`（参考样例使用相近的深红，但本实现不复制其图形资产）。
- 标题横线/次级规则线：`#8c8883`。
- 规则/发展/宝藏/经验框：暖灰 `#f0efed`，细灰边框。
- 朗读框：极浅蓝 `#eef5f9`，两侧深灰蓝边线，使用独立 `ReadAloud` IR node。
- statblock：暖白底、深红顶边与边框；不使用官方 logo、纹章或插画。

## 标题层级

- 封面：项目中文主标题 + 英文/拉丁副标题，配原创纯色横线与主题 kicker。
- `h1`/一级章节：深红、较大字号、章节编号；不得与正文孤立到下一栏。
- `h2`/场景标题：中文标题 + 英文副标题，深红、细灰横线。
- `h3`/组件标题：灰黑或深红，避免过度装饰。
- TOC 数据来自 Module IR 的 Heading/Section 节点，不重新解析最终 HTML。

## 文本框与组件

- `ReadAloud`：浅蓝框，允许多段，`break-inside: avoid`；超长时允许安全拆分并诊断。
- `Rule`：灰色规则框，用于规则提示。
- `Development`：灰色发展说明框。
- `Treasure`：灰色宝藏框。
- `Experience`：灰色经验奖励框。
- `StatBlock`：结构化节点，不拼接业务层 HTML；小块尽量保持整体，过长时按段落安全拆分并产生 warning。
- `Table`：重复表头、单元格可换行；超过三列时产生宽度风险 warning。
- `Image`：只接受受控 asset resolver 的安全位置；本 spike fixture 不依赖外部图片。

## 分栏与分页规则

- 正文默认两栏；浏览器 Preview 与 PDF 共享同一 HTML/CSS renderer。
- 章节/组件标题 `break-after: avoid`；callout、statblock、table、figure `break-inside: avoid`。
- 作者可用 `:::pagebreak` 明确开始新页；不提供未经验证的 column-break 语法。
- 超长 statblock/朗读框不强行截断作者内容；允许安全分页并产生诊断。
- 中文标点、中英混排、长英文 token 和 URL 使用 CSS 断行策略，不修改正文。
- 页眉/页脚由 Playwright PDF 的 header/footer template 注入，避免依赖未标准化的 CSS margin boxes。
