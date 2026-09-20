import type { CalloutNode, ModuleIR, ModuleNode, SectionNode, StatBlockNode, TableNode } from "./ir.js";

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function inline(value: string): string {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[\[([^\]]+)\]\]/g, '<span class="entity-reference">$1</span>');
}

function renderTable(node: TableNode): string {
  return `<table class="module-table"><thead><tr>${node.headers.map((cell) => `<th>${inline(cell)}</th>`).join("")}</tr></thead><tbody>${node.rows.map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function renderStatBlock(node: StatBlockNode): string {
  return `<aside class="statblock" data-node-id="${escapeHtml(node.id)}"><h3>${inline(node.name)}</h3><p class="stat-subtitle">${inline(node.subtitle)}</p><div class="stat-rule"></div><dl class="stat-summary"><div><dt>护甲等级 AC</dt><dd>${inline(node.armorClass)}</dd></div><div><dt>生命值 HP</dt><dd>${inline(node.hitPoints)}</dd></div><div><dt>速度 Speed</dt><dd>${inline(node.speed)}</dd></div></dl><div class="ability-grid">${node.abilities.map((ability) => `<div><b>${ability.name}</b><span>${ability.score} (${ability.modifier})</span></div>`).join("")}</div>${node.traits.length ? `<h4>特性 Traits</h4>${node.traits.map((trait) => `<p><strong>${inline(trait.name)}。</strong> ${inline(trait.text)}</p>`).join("")}` : ""}${node.actions.length ? `<h4>动作 Actions</h4>${node.actions.map((action) => `<p><strong>${inline(action.name)}。</strong> ${inline(action.text)}</p>`).join("")}` : ""}</aside>`;
}

function renderCallout(node: CalloutNode): string {
  const body = node.children.map(renderNode).join("");
  return `<aside class="callout callout-${node.kind}" data-node-id="${escapeHtml(node.id)}"><h3>${inline(node.title)}</h3>${body}</aside>`;
}

function renderSection(node: SectionNode): string {
  return `<section class="module-section level-${node.level}" data-node-id="${escapeHtml(node.id)}"><h2>${node.number ? `<span class="section-number">${escapeHtml(node.number)}</span> ` : ""}${inline(node.title)}${node.subtitle ? ` <span class="subtitle">${inline(node.subtitle)}</span>` : ""}</h2>${node.children.map(renderNode).join("")}</section>`;
}

function renderNode(node: ModuleNode): string {
  switch (node.nodeType) {
    case "section": return renderSection(node);
    case "heading": return `<h2 data-node-id="${escapeHtml(node.id)}">${inline(node.title)}${node.subtitle ? ` <span class="subtitle">${inline(node.subtitle)}</span>` : ""}</h2>`;
    case "paragraph": return `<p data-node-id="${escapeHtml(node.id)}">${inline(node.text)}</p>`;
    case "list": return `<${node.ordered ? "ol" : "ul"} data-node-id="${escapeHtml(node.id)}">${node.items.map((item) => `<li>${inline(item)}</li>`).join("")}</${node.ordered ? "ol" : "ul"}>`;
    case "quote": return `<blockquote data-node-id="${escapeHtml(node.id)}">${inline(node.text)}</blockquote>`;
    case "callout": return renderCallout(node);
    case "statblock": return renderStatBlock(node);
    case "table": return renderTable(node);
    case "pageBreak": return `<div class="page-break" data-node-id="${escapeHtml(node.id)}"></div>`;
    case "horizontalRule": return "<hr>";
    case "columns": return `<div class="nested-columns" style="column-count:${node.count}">${node.children.map(renderNode).join("")}</div>`;
    case "document": return node.children.map(renderNode).join("");
    case "image": return `<figure><img src="${escapeHtml(node.src)}" alt="${escapeHtml(node.alt)}"><figcaption>${node.caption ? inline(node.caption) : ""}</figcaption></figure>`;
    case "entityReference": return `<span class="entity-reference">${inline(node.displayName ?? node.reference)}</span>`;
  }
}

export const themeCss = `
@page { size: A4; margin: 26mm 20mm 22mm 20mm; }
* { box-sizing: border-box; }
html, body { background: white; }
body { margin: 0; color: #27221f; font-family: "Noto Serif SC", "Songti SC", "STSong", serif; font-size: 9.1pt; line-height: 1.54; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: 100%; }
.cover { min-height: 235mm; display: grid; align-content: center; text-align: center; break-after: page; padding: 18mm; }
.cover .kicker { color: #7a1e18; font: 600 11pt/1.2 Georgia, serif; letter-spacing: .18em; text-transform: uppercase; }
.cover h1 { margin: 18mm 0 3mm; color: #7a1e18; font-size: 27pt; line-height: 1.15; }
.cover .cover-rule { width: 75%; height: 2px; margin: 0 auto 6mm; background: #7a1e18; }
.cover .subtitle { font-size: 13pt; font-style: italic; }
.cover .meta { margin-top: 18mm; color: #6b625c; font-size: 9pt; }
.toc { break-after: page; padding-top: 4mm; }
.toc h2 { margin-bottom: 8mm; }
.toc-list { columns: 2; column-gap: 9mm; list-style: none; padding: 0; }
.toc-list li { break-inside: avoid; margin: 0 0 2.2mm; color: #7a1e18; font-weight: 600; }
.toc-list small { color: #514a45; font-weight: 400; }
.publication { column-count: 2; column-gap: 9mm; column-fill: balance; }
.module-section { break-inside: auto; margin: 0 0 4mm; }
.module-section.level-2 { break-inside: avoid; }
.module-section > h2, .publication > h2 { break-after: avoid; break-inside: avoid; margin: 0 0 3.2mm; padding: 0 0 1.3mm; border-bottom: 1px solid #8c8883; color: #7a1e18; font-size: 14pt; line-height: 1.25; font-weight: 600; }
.module-section.level-1 > h2 { font-size: 16pt; }
.section-number { font-variant-numeric: oldstyle-nums; }
.subtitle { font-size: .92em; font-weight: 600; }
p { margin: 0 0 3.3mm; text-align: justify; overflow-wrap: anywhere; orphans: 2; widows: 2; }
strong { font-weight: 600; }
em { font-style: italic; }
ul, ol { margin: 0 0 3.3mm; padding-left: 5mm; }
li { margin-bottom: 1.3mm; }
blockquote { margin: 3mm 0; padding-left: 4mm; border-left: 2px solid #7a1e18; font-style: italic; }
.callout, .statblock, .module-table, figure { break-inside: avoid; }
.callout { margin: 4mm 0; padding: 3.2mm 4mm; }
.callout h3 { margin: 0 0 2mm; font-size: 10.5pt; line-height: 1.25; }
.callout p { margin-bottom: 2mm; text-align: left; }
.callout-rule, .callout-development, .callout-treasure, .callout-experience { background: #f0efed; border: 1px solid #d3d0cc; }
.callout-rule h3, .callout-development h3, .callout-treasure h3, .callout-experience h3 { color: #4a443f; }
.callout-readaloud { background: #eef5f9; border-left: 2px solid #465862; border-right: 2px solid #465862; font-style: italic; }
.callout-readaloud h3 { color: #465862; font-style: normal; }
.statblock { margin: 5mm 0; padding: 4mm; border: 1.2px solid #7a1e18; border-top: 5px solid #7a1e18; background: #fffdfa; box-shadow: 0 1px 0 #d7d0ca; }
.statblock h3 { margin: 0; color: #7a1e18; font-size: 14pt; line-height: 1.15; }
.stat-subtitle { margin: 0 0 2mm; color: #5f5751; font-style: italic; font-size: 8.6pt; }
.stat-rule { border-top: 1px solid #7a1e18; margin: 2mm 0; }
.stat-summary { margin: 0; font-size: 8.3pt; }
.stat-summary div { display: flex; justify-content: space-between; gap: 2mm; }
.stat-summary dt { font-weight: 600; }
.stat-summary dd { margin: 0; text-align: right; }
.ability-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5mm; margin: 3mm 0; padding: 2mm 0; border-top: 1px solid #c7bdb5; border-bottom: 1px solid #c7bdb5; text-align: center; font-size: 7.8pt; }
.ability-grid div { display: grid; gap: .5mm; }
.ability-grid span { color: #5f5751; }
.statblock h4 { margin: 2.5mm 0 1mm; color: #7a1e18; font-size: 9.5pt; }
.statblock p { margin-bottom: 1.5mm; text-align: left; font-size: 8.4pt; line-height: 1.45; }
.module-table { width: 100%; margin: 4mm 0; border-collapse: collapse; font-size: 8pt; line-height: 1.35; }
.module-table th { background: #7a1e18; color: white; font-weight: 600; text-align: left; }
.module-table th, .module-table td { padding: 1.8mm 2mm; border: 1px solid #c9c3bd; vertical-align: top; }
.module-table tr:nth-child(even) td { background: #f5f3f1; }
figure { margin: 4mm 0; } figure img { display: block; width: 100%; max-height: 80mm; object-fit: contain; } figcaption { color: #6b625c; text-align: center; font-size: 8pt; }
.entity-reference { color: #7a1e18; font-weight: 600; }
.page-break { column-span: all; break-before: page; height: 0; }
.nested-columns { column-gap: 9mm; }
.nested-columns > * { break-inside: avoid; }
code { font-family: "SFMono-Regular", monospace; font-size: .9em; }
hr { border: 0; border-top: 1px solid #8c8883; margin: 4mm 0; }
`;

function tocItems(ir: ModuleIR): string {
  const items: string[] = [];
  for (const document of ir.documents) for (const node of document.children) if (node.nodeType === "section") items.push(`<li>${node.number ? `${escapeHtml(node.number)} ` : ""}${inline(node.title)}${node.subtitle ? ` <small>${inline(node.subtitle)}</small>` : ""}</li>`);
  return items.join("");
}

export interface RenderOptions {
  fontFaceCss?: string;
}

export function renderHtml(ir: ModuleIR, options: RenderOptions = {}): string {
  const title = escapeHtml(ir.project.title);
  const subtitle = ir.project.subtitle ? escapeHtml(ir.project.subtitle) : "";
  const body = ir.documents.flatMap((document) => document.children.map(renderNode)).join("");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${title}</title><style>${options.fontFaceCss ?? ""}${themeCss}</style></head><body><main class="page"><section class="cover"><div class="kicker">Classic Fantasy · Module Atelier</div><h1>${title}</h1><div class="cover-rule"></div><div class="subtitle">${subtitle}</div><div class="meta">原创出版技术 Spike · 中文排版测试版<br>${ir.project.author ? escapeHtml(ir.project.author) : "Module Atelier Publishing"}</div></section><section class="toc"><h2>目录 Contents</h2><ol class="toc-list">${tocItems(ir)}</ol></section><section class="publication">${body}</section></main></body></html>`;
}
