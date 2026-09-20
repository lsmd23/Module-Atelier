import { describe, expect, it } from "vitest";
import type { Suggestion } from "@module-atelier/contracts";
import { isSuggestionStale } from "./suggestions";
import { diffLines } from "./diff";

const base: Suggestion = {
  id: "s1",
  projectId: "p",
  kind: "canon",
  triggerReason: "t",
  sourceReferences: [],
  relevantRevisionMap: { "doc-ch1": 7 },
  title: "t",
  observation: "o",
  status: "pending",
  createdAt: "2026-09-19T00:00:00Z"
};

describe("isSuggestionStale", () => {
  it("相关资源 revision 未变 → 不过期", () => {
    expect(isSuggestionStale(base, new Map([["doc-ch1", 7]]))).toBe(false);
  });

  it("相关资源 revision 已领先 → 过期（禁止 Apply）", () => {
    expect(isSuggestionStale(base, new Map([["doc-ch1", 8]]))).toBe(true);
  });

  it("服务端已标记 stale → 过期", () => {
    expect(isSuggestionStale({ ...base, status: "stale" }, new Map())).toBe(true);
  });

  it("资源不在当前表中 → 不因此误判过期", () => {
    expect(isSuggestionStale(base, new Map())).toBe(false);
  });
});

describe("diffLines", () => {
  it("单行替换", () => {
    const d = diffLines("a\nb\nc", "a\nB\nc");
    expect(d).toEqual([
      { type: "context", text: "a" },
      { type: "removed", text: "b" },
      { type: "added", text: "B" },
      { type: "context", text: "c" }
    ]);
  });

  it("纯追加", () => {
    const d = diffLines("a", "a\nb");
    expect(d.filter((l) => l.type === "added")).toEqual([{ type: "added", text: "b" }]);
  });

  it("完全相同 → 全是 context", () => {
    const d = diffLines("x\ny", "x\ny");
    expect(d.every((l) => l.type === "context")).toBe(true);
  });
});
