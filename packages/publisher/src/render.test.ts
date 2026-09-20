import { describe, expect, it } from "vitest";
import { parsePublishSnapshot } from "./parser.js";
import { renderHtml } from "./render.js";

const snapshot = {
  schemaVersion: "publish-snapshot@0.1" as const,
  project: { title: "雾钟镇", subtitle: "Fogbell Hamlet", language: "zh-CN" as const, theme: "classic-fantasy@1" as const },
  documents: [{ id: "chapter-01", title: "雾钟镇", content: "# 第一章 | The First Bell\n\n这是中文正文。\n\n:::readaloud\n远处的雾钟敲响了。\n:::\n\n| d6 | 结果 |\n| --- | --- |\n| 1 | 雨幕 |" }],
};

describe("publishing spike", () => {
  it("builds source-mapped IR and HTML", () => {
    const ir = parsePublishSnapshot(snapshot);
    expect(ir.schemaVersion).toBe("module-ir@0.1");
    expect(ir.documents[0]?.children[0]?.nodeType).toBe("section");
    expect(ir.documents[0]?.children[0]?.sourceLocation?.line).toBe(1);
    const html = renderHtml(ir);
    expect(html).toContain("雾钟镇");
    expect(html).toContain("callout-readaloud");
    expect(html).toContain("module-table");
    const readAloud = ir.documents[0]?.children[0]?.nodeType === "section" ? ir.documents[0].children[0].children.find((node) => node.nodeType === "callout") : undefined;
    const readAloudText = readAloud?.nodeType === "callout" ? readAloud.children[0] : undefined;
    expect(readAloudText?.sourceLocation?.line).toBe(6);
  });

  it("diagnoses invalid directives and preserves source locations", () => {
    const ir = parsePublishSnapshot({ ...snapshot, documents: [{ id: "chapter-01", title: "雾钟镇", content: ":::javascript\nalert(1)\n:::" }] });
    expect(ir.diagnostics[0]?.code).toBe("INVALID_DIRECTIVE");
    expect(ir.diagnostics[0]?.sourceLocation?.line).toBe(1);
  });

  it("escapes untrusted inline HTML", () => {
    const ir = parsePublishSnapshot({ ...snapshot, documents: [{ id: "chapter-01", title: "雾钟镇", content: "# 安全\n\n<script>alert(1)</script> <img src=x onerror=alert(1)>" }] });
    const html = renderHtml(ir);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img src=x");
  });
});
