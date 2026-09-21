import { describe, expect, it } from "vitest";
import { extractReferences, parseDocument, parseInline } from "./mockRenderer";

describe("mockRenderer (MOCK ONLY)", () => {
  it("解析章节标题与首段首字下沉标记", () => {
    const blocks = parseDocument("# 第一章 雾抵白鸦镇\n\n商队在黄昏前抵达。");
    expect(blocks[0]).toEqual({ type: "chapter", text: "第一章 雾抵白鸦镇" });
    expect(blocks[1]).toMatchObject({ type: "paragraph", dropCap: true });
  });

  it("解析怪物资料卡指令块", () => {
    const md = ":::monster 灰鳞巨魔\n挑战等级: 5\n生命值: 84\n:::\n";
    const blocks = parseDocument(md);
    expect(blocks[0]).toEqual({ type: "monster", title: "灰鳞巨魔", rows: ["挑战等级: 5", "生命值: 84"] });
  });

  it("解析 info / background / readaloud 块", () => {
    const md = ":::info 提示\n正文一\n:::\n\n:::background 历史\n正文二\n:::\n\n:::readaloud\n正文三\n:::";
    const blocks = parseDocument(md);
    expect(blocks.map((b) => b.type)).toEqual(["info", "background", "readaloud"]);
    expect(blocks[0]).toMatchObject({ title: "提示", lines: ["正文一"] });
  });

  it("行内解析 [[引用]] 与强调", () => {
    const spans = parseInline("酒馆老板[[阿琳]]站在吧台后面，**似乎**一直在观察入口。");
    expect(spans).toContainEqual({ text: "阿琳", ref: "阿琳" });
    expect(spans).toContainEqual({ text: "似乎", bold: true });
  });

  it("提取全部引用目标（供缺失检查）", () => {
    const refs = extractReferences("[[阿琳]]与[[不存在的人]]都看着[[白鸦镇]]。[[阿琳]]重复。");
    expect(refs).toEqual(["阿琳", "不存在的人", "白鸦镇", "阿琳"]);
  });

  it("未闭合的指令块不会吞掉后续全部内容（容错）", () => {
    const blocks = parseDocument(":::info 提示\n只有一行");
    expect(blocks[0]).toMatchObject({ type: "info", lines: ["只有一行"] });
  });
});
