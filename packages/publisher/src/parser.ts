import type {
  CalloutNode,
  Diagnostic,
  DocumentNode,
  HeadingNode,
  ImageNode,
  ListNode,
  ModuleDocumentInput,
  ModuleIR,
  ModuleNode,
  ParagraphNode,
  PublishSnapshot,
  PublishAsset,
  SectionNode,
  SourceLocation,
  StatBlockNode,
  TableNode,
} from "./ir.js";

const directiveKinds = new Set(["readaloud", "rule", "development", "treasure", "experience", "pagebreak", "columns", "statblock", "image"]);

function location(documentId: string, source: string, startOffset: number, endOffset: number): SourceLocation {
  const before = source.slice(0, startOffset);
  const line = before.split("\n").length;
  const lastNewline = before.lastIndexOf("\n");
  return { documentId, startOffset, endOffset, line, column: startOffset - lastNewline };
}

function nodeId(documentId: string, type: string, offset: number): string {
  return `${documentId}:${type}:${offset}`;
}

function parseTitle(raw: string): { title: string; subtitle?: string } {
  const match = raw.match(/^(.+?)\s+\|\s+(.+)$/);
  return match?.[1] && match[2] ? { title: match[1].trim(), subtitle: match[2].trim() } : { title: raw.trim() };
}

function paragraph(documentId: string, source: string, text: string, start: number): ParagraphNode {
  return { id: nodeId(documentId, "paragraph", start), nodeType: "paragraph", text, sourceLocation: location(documentId, source, start, start + text.length) };
}

function parseStatblock(documentId: string, source: string, body: string, start: number): StatBlockNode {
  const values = new Map<string, string>();
  const traits: Array<{ name: string; text: string }> = [];
  const actions: Array<{ name: string; text: string }> = [];
  for (const line of body.split("\n")) {
    const field = line.match(/^\s*([A-Za-z][A-Za-z ]+):\s*(.+)$/);
    if (field?.[1] && field[2]) values.set(field[1].toLowerCase(), field[2].trim());
    const trait = line.match(/^\s*trait\s*\|\s*([^|]+)\|\s*(.+)$/i);
    if (trait?.[1] && trait[2]) traits.push({ name: trait[1].trim(), text: trait[2].trim() });
    const action = line.match(/^\s*action\s*\|\s*([^|]+)\|\s*(.+)$/i);
    if (action?.[1] && action[2]) actions.push({ name: action[1].trim(), text: action[2].trim() });
  }
  const abilities = ["STR", "DEX", "CON", "INT", "WIS", "CHA"].map((name) => {
    const score = values.get(name.toLowerCase()) ?? "10";
    const n = Number(score);
    const modifier = Number.isFinite(n) ? `${n >= 10 ? "+" : ""}${Math.floor((n - 10) / 2)}` : "—";
    return { name, score, modifier };
  });
  const name = values.get("name") ?? "未命名生物";
  return {
    id: nodeId(documentId, "statblock", start),
    nodeType: "statblock",
    name,
    subtitle: values.get("subtitle") ?? "中型野兽，守序中立",
    armorClass: values.get("ac") ?? "12（天然护甲）",
    hitPoints: values.get("hp") ?? "18（4d8）",
    speed: values.get("speed") ?? "30 尺",
    abilities,
    traits,
    actions,
    sourceLocation: location(documentId, source, start, start + body.length),
  };
}

function parseTable(documentId: string, source: string, lines: string[], start: number): TableNode {
  const rows = lines.map((line) => line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim()));
  const headers = rows.shift() ?? [];
  if (rows[0]?.every((cell) => /^:?-+:?$/.test(cell))) rows.shift();
  return { id: nodeId(documentId, "table", start), nodeType: "table", headers, rows, sourceLocation: location(documentId, source, start, start + lines.join("\n").length) };
}

function directiveAttributes(raw: string | undefined): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of raw?.matchAll(/([A-Za-z][A-Za-z0-9_-]*)="([^"]*)"/g) ?? []) {
    if (match[1] && match[2]) attributes[match[1]] = match[2];
  }
  return attributes;
}

function isSafeImageLocation(asset: PublishAsset): boolean {
  return asset.safeLocation.startsWith(`data:${asset.mimeType};base64,`) || asset.safeLocation.startsWith("asset://");
}

function imageNode(
  documentId: string,
  asset: PublishAsset | undefined,
  assetId: string,
  alt: string,
  caption: string | undefined,
  layout: ImageNode["layout"],
  diagnostics: Diagnostic[],
  sourceLocation: SourceLocation,
  sourceStart: number,
): ImageNode | undefined {
  if (!asset) {
    diagnostics.push({ code: "MISSING_ASSET", severity: "error", message: `找不到图片资源: ${assetId}`, documentId, sourceLocation, nodeType: "image", details: { assetId } });
    return undefined;
  }
  if (!isSafeImageLocation(asset)) {
    diagnostics.push({ code: "UNSAFE_ASSET", severity: "error", message: `图片资源位置未通过安全校验: ${assetId}`, documentId, sourceLocation, nodeType: "image", details: { assetId, safeLocation: asset.safeLocation } });
    return undefined;
  }
  return {
    id: nodeId(documentId, "image", sourceStart),
    nodeType: "image",
    assetId,
    alt,
    layout,
    ...(caption ? { caption } : {}),
    src: asset.safeLocation,
    sourceLocation,
    metadata: { width: asset.width, height: asset.height, mimeType: asset.mimeType },
  };
}

function parseBlocks(document: ModuleDocumentInput, source: string, diagnostics: Diagnostic[], fullSource = source, sourceOffset = 0, assets = new Map<string, PublishAsset>()): ModuleNode[] {
  const lines = source.split("\n");
  const nodes: ModuleNode[] = [];
  const loc = (start: number, end: number) => location(document.id, fullSource, sourceOffset + start, sourceOffset + end);
  let offset = 0;
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    const currentOffset = offset;
    if (!trimmed) { offset += line.length + 1; index += 1; continue; }

    const directive = trimmed.match(/^:::(\w+)(?:\s+(.+))?$/);
    if (directive?.[1]) {
      const kind = directive[1].toLowerCase();
      const end = lines.slice(index + 1).findIndex((value) => value.trim() === ":::");
      if (end < 0) {
        diagnostics.push({ code: "INVALID_DIRECTIVE", severity: "error", message: `未闭合 directive: ${kind}`, documentId: document.id, sourceLocation: loc(currentOffset, currentOffset + line.length), details: { directive: kind } });
        offset += line.length + 1; index += 1; continue;
      }
      const bodyLines = lines.slice(index + 1, index + 1 + end);
      const body = bodyLines.join("\n");
      const endOffset = currentOffset + line.length + 1 + body.length;
      if (!directiveKinds.has(kind)) {
        diagnostics.push({ code: "INVALID_DIRECTIVE", severity: "error", message: `不支持的 directive: ${kind}`, documentId: document.id, sourceLocation: loc(currentOffset, endOffset), details: { directive: kind } });
      } else if (kind === "pagebreak") {
        nodes.push({ id: nodeId(document.id, "pageBreak", sourceOffset + currentOffset), nodeType: "pageBreak", sourceLocation: loc(currentOffset, endOffset) });
      } else if (kind === "statblock") {
        const node = parseStatblock(document.id, source, body, currentOffset);
        node.id = nodeId(document.id, "statblock", sourceOffset + currentOffset);
        node.sourceLocation = loc(currentOffset, endOffset);
        nodes.push(node);
      } else if (kind === "columns") {
        const count = Number(directive[2]?.match(/count=(\d+)/)?.[1] ?? 2);
        nodes.push({ id: nodeId(document.id, "columns", sourceOffset + currentOffset), nodeType: "columns", count: Number.isFinite(count) ? count : 2, children: parseBlocks({ ...document, content: body }, body, diagnostics, fullSource, sourceOffset + currentOffset + line.length + 1, assets), sourceLocation: loc(currentOffset, endOffset) });
      } else if (kind === "image") {
        const attributes = directiveAttributes(directive[2]);
        const assetId = attributes.asset;
        const layout = attributes.layout === "full" || attributes.layout === "column" ? attributes.layout : "block";
        if (!assetId) {
          diagnostics.push({ code: "INVALID_DIRECTIVE", severity: "error", message: "image directive 缺少 asset 属性", documentId: document.id, sourceLocation: loc(currentOffset, endOffset), details: { directive: kind } });
        } else {
          const image = imageNode(document.id, assets.get(assetId), assetId, attributes.alt ?? assetId, attributes.caption, layout, diagnostics, loc(currentOffset, endOffset), sourceOffset + currentOffset);
          if (image) nodes.push(image);
        }
      } else {
        const title = kind === "readaloud" ? "朗读 Read Aloud" : kind === "rule" ? "规则 Rule" : kind === "development" ? "发展 Development" : kind === "treasure" ? "宝藏 Treasure" : "经验奖励 Experience";
        const children = parseBlocks({ ...document, content: body }, body, diagnostics, fullSource, sourceOffset + currentOffset + line.length + 1, assets);
        const node: CalloutNode = { id: nodeId(document.id, "callout", sourceOffset + currentOffset), nodeType: "callout", kind: kind as CalloutNode["kind"], title, children, sourceLocation: loc(currentOffset, endOffset) };
        nodes.push(node);
      }
      const consumed = lines.slice(index, index + end + 2).reduce((total, value) => total + value.length + 1, 0);
      offset += consumed; index += end + 2; continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading?.[1] && heading[2]) {
      const parsed = parseTitle(heading[2]);
      const h: HeadingNode = { id: nodeId(document.id, "heading", sourceOffset + currentOffset), nodeType: "heading", level: heading[1].length, ...parsed, sourceLocation: loc(currentOffset, currentOffset + line.length) };
      nodes.push(h); offset += line.length + 1; index += 1; continue;
    }

    if (line.startsWith("|")) {
      const tableLines: string[] = [];
      let cursor = index;
      while (cursor < lines.length && (lines[cursor] ?? "").trim().startsWith("|")) { tableLines.push(lines[cursor] ?? ""); cursor += 1; }
      const table = parseTable(document.id, source, tableLines, currentOffset);
      table.id = nodeId(document.id, "table", sourceOffset + currentOffset);
      table.sourceLocation = loc(currentOffset, currentOffset + tableLines.join("\n").length);
      if (table.headers.length > 3) diagnostics.push({ code: "TABLE_TOO_WIDE", severity: "warning", message: "表格列数较多，PDF 中可能需要缩小字号或拆分。", documentId: document.id, ...(table.sourceLocation ? { sourceLocation: table.sourceLocation } : {}), nodeType: "table", details: { columns: table.headers.length } });
      nodes.push(table); const consumed = tableLines.reduce((total, value) => total + value.length + 1, 0); offset += consumed; index = cursor; continue;
    }

    const markdownImage = line.match(/^!\[([^\]]+)\]\(asset:([A-Za-z0-9_-]+)(?:\s+"([^"]*)")?\)$/);
    if (markdownImage?.[1] && markdownImage[2]) {
      const image = imageNode(document.id, assets.get(markdownImage[2]), markdownImage[2], markdownImage[1], markdownImage[3], "block", diagnostics, loc(currentOffset, currentOffset + line.length), sourceOffset + currentOffset);
      if (image) nodes.push(image);
      offset += line.length + 1; index += 1; continue;
    }

    if (/^[-*+]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      const ordered = /^\d+\.\s+/.test(line); const items: string[] = []; let cursor = index;
      while (cursor < lines.length && new RegExp(ordered ? "^\\d+\\.\\s+" : "^[-*+]\\s+").test(lines[cursor] ?? "")) { items.push((lines[cursor] ?? "").replace(ordered ? /^\d+\.\s+/ : /^[-*+]\s+/, "")); cursor += 1; }
      const list: ListNode = { id: nodeId(document.id, "list", sourceOffset + currentOffset), nodeType: "list", ordered, items, sourceLocation: loc(currentOffset, currentOffset + items.join("\n").length) };
      nodes.push(list); offset += lines.slice(index, cursor).reduce((total, value) => total + value.length + 1, 0); index = cursor; continue;
    }

    const paragraphLines: string[] = [line]; let cursor = index + 1;
    while (cursor < lines.length && (lines[cursor] ?? "").trim() && !/^#{1,6}\s+/.test(lines[cursor] ?? "") && !(lines[cursor] ?? "").trim().startsWith(":::") && !(lines[cursor] ?? "").trim().startsWith("|")) { paragraphLines.push(lines[cursor] ?? ""); cursor += 1; }
    const text = paragraphLines.join(" ").trim();
    const parsedParagraph = paragraph(document.id, source, text, currentOffset);
    parsedParagraph.id = nodeId(document.id, "paragraph", sourceOffset + currentOffset);
    parsedParagraph.sourceLocation = loc(currentOffset, currentOffset + text.length);
    nodes.push(parsedParagraph);
    offset += lines.slice(index, cursor).reduce((total, value) => total + value.length + 1, 0); index = cursor;
  }
  return nodes;
}

function nestSections(document: ModuleDocumentInput, nodes: ModuleNode[]): ModuleNode[] {
  const output: ModuleNode[] = [];
  let current: SectionNode | undefined;
  let sectionNumber = 0;
  for (const node of nodes) {
    if (node.nodeType === "heading" && node.level <= 2) {
      sectionNumber += 1;
      const hasExplicitNumber = /^\d+[.、]\s*/.test(node.title);
      const section: SectionNode = { id: node.id.replace(":heading:", ":section:"), nodeType: "section", level: node.level, title: node.title, children: [], ...(hasExplicitNumber ? {} : { number: `${sectionNumber}.` }), ...(node.subtitle ? { subtitle: node.subtitle } : {}), ...(node.sourceLocation ? { sourceLocation: node.sourceLocation } : {}) };
      current = section;
      output.push(section);
    } else if (current) current.children.push(node);
    else output.push(node);
  }
  return output;
}

export function parsePublishSnapshot(snapshot: PublishSnapshot): ModuleIR {
  const diagnostics: Diagnostic[] = [];
  const assets = new Map((snapshot.assets ?? []).map((asset) => [asset.id, asset]));
  const documents: DocumentNode[] = snapshot.documents.map((document) => ({
    id: `document:${document.id}`,
    nodeType: "document",
    documentId: document.id,
    title: document.title,
    children: nestSections(document, parseBlocks(document, document.content, diagnostics, document.content, 0, assets)),
  }));
  return { schemaVersion: "module-ir@0.1", project: snapshot.project, documents, diagnostics };
}
