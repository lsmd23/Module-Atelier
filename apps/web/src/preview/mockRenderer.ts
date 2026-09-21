/**
 * MOCK ONLY —— 本地 Markdown 子集 + 指令块解析器。
 *
 * 警告：真实 Preview/PDF 必须由 Publisher 从 Module IR 渲染（见 docs/ARCHITECTURE.md），
 * 前端不得维护第二套正式 renderer。此解析器只为原型演示「书页排版 + 资料卡」的
 * 视觉效果，BE/PUB 就绪后整体删除。
 */

export interface Span {
  text: string;
  bold?: boolean;
  italic?: boolean;
  /** [[实体引用]] 的目标名 */
  ref?: string;
}

export type Block =
  | { type: "chapter"; text: string }
  | { type: "heading"; text: string }
  | { type: "paragraph"; spans: Span[]; dropCap: boolean }
  | { type: "quote"; spans: Span[] }
  | { type: "list"; items: Span[][] }
  | { type: "monster"; title: string; rows: string[] }
  | { type: "info"; title: string; lines: string[] }
  | { type: "background"; title: string; lines: string[] }
  | { type: "readaloud"; lines: string[] }
  | { type: "hr" };

const DIRECTIVE_RE = /^:::\s*(monster|info|background|readaloud)\s*(.*)$/;
const REF_RE = /\[\[([^\]]+)\]\]/g;

export function parseInline(text: string): Span[] {
  const spans: Span[] = [];
  let last = 0;
  for (const m of text.matchAll(REF_RE)) {
    const idx = m.index;
    if (idx > last) pushEmphasis(text.slice(last, idx), spans);
    spans.push({ text: m[1] ?? "", ref: m[1] ?? "" });
    last = idx + m[0].length;
  }
  if (last < text.length) pushEmphasis(text.slice(last), spans);
  return spans;
}

function pushEmphasis(text: string, out: Span[]) {
  // 简化：**bold** 优先，*italic* 其次。原型足够。
  const token = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  for (const m of text.matchAll(token)) {
    const idx = m.index;
    if (idx > last) out.push({ text: text.slice(last, idx) });
    const raw = m[0];
    if (raw.startsWith("**")) out.push({ text: raw.slice(2, -2), bold: true });
    else out.push({ text: raw.slice(1, -1), italic: true });
    last = idx + raw.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
}

export function parseDocument(markdown: string): Block[] {
  const lines = markdown.split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let firstParagraphAfterChapter = false;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const text = paragraph.join(" ").trim();
    if (text.length > 0) {
      blocks.push({ type: "paragraph", spans: parseInline(text), dropCap: firstParagraphAfterChapter });
      firstParagraphAfterChapter = false;
    }
    paragraph = [];
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const directive = line.match(DIRECTIVE_RE);
    if (directive) {
      flushParagraph();
      const kind = directive[1] as "monster" | "info" | "background" | "readaloud";
      const title = (directive[2] ?? "").trim();
      const body: string[] = [];
      i += 1;
      while (i < lines.length && (lines[i] ?? "").trim() !== ":::") {
        const l = (lines[i] ?? "").trim();
        if (l.length > 0) body.push(l);
        i += 1;
      }
      i += 1; // 跳过结尾 :::
      if (kind === "monster") blocks.push({ type: "monster", title, rows: body });
      else if (kind === "info") blocks.push({ type: "info", title, lines: body });
      else if (kind === "background") blocks.push({ type: "background", title, lines: body });
      else blocks.push({ type: "readaloud", lines: body });
      continue;
    }

    const trimmed = line.trim();
    if (trimmed.startsWith("# ")) {
      flushParagraph();
      blocks.push({ type: "chapter", text: trimmed.slice(2).trim() });
      firstParagraphAfterChapter = true;
    } else if (trimmed.startsWith("## ")) {
      flushParagraph();
      blocks.push({ type: "heading", text: trimmed.slice(3).trim() });
    } else if (trimmed.startsWith("> ")) {
      flushParagraph();
      blocks.push({ type: "quote", spans: parseInline(trimmed.slice(2)) });
    } else if (trimmed.startsWith("- ")) {
      flushParagraph();
      const items: Span[][] = [];
      while (i < lines.length && (lines[i] ?? "").trim().startsWith("- ")) {
        items.push(parseInline((lines[i] ?? "").trim().slice(2)));
        i += 1;
      }
      blocks.push({ type: "list", items });
      continue;
    } else if (trimmed === "---") {
      flushParagraph();
      blocks.push({ type: "hr" });
    } else if (trimmed.length === 0) {
      flushParagraph();
    } else {
      paragraph.push(trimmed);
    }
    i += 1;
  }
  flushParagraph();
  return blocks;
}

/** 从正文中提取全部 [[引用]] 目标名（编辑器高亮与缺失检查共用）。 */
export function extractReferences(markdown: string): string[] {
  const out: string[] = [];
  for (const m of markdown.matchAll(REF_RE)) {
    if (m[1]) out.push(m[1]);
  }
  return out;
}
