import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { chromium } from "playwright";
import { parsePublishSnapshot } from "../src/parser.js";
import { renderHtml } from "../src/render.js";
import type { PublishSnapshot } from "../src/ir.js";

const root = resolve(import.meta.dirname, "../../..");
const markdown = await readFile(resolve(root, "packages/publisher/fixtures/fogbell.md"), "utf8");
const mapSvg = await readFile(resolve(root, "packages/publisher/fixtures/fogbell-map.svg"), "utf8");
const snapshot: PublishSnapshot = { schemaVersion: "publish-snapshot@0.1", project: { title: "雾钟镇", subtitle: "Fogbell Hamlet", author: "Module Atelier", language: "zh-CN", theme: "classic-fantasy@1" }, documents: [{ id: "fogbell-chapter", title: "雾钟镇", content: markdown }], assets: [{ id: "fogbell-map", mimeType: "image/svg+xml", width: 1200, height: 720, safeLocation: `data:image/svg+xml;base64,${Buffer.from(mapSvg).toString("base64")}`, caption: "雾钟镇旧地图 · Fogbell Hamlet" }] };
const ir = parsePublishSnapshot(snapshot);
const fontRoot = resolve(import.meta.dirname, "../node_modules/@fontsource/noto-serif-sc/files");
const font400 = (await readFile(resolve(fontRoot, "noto-serif-sc-chinese-simplified-400-normal.woff2"))).toString("base64");
const font600 = (await readFile(resolve(fontRoot, "noto-serif-sc-chinese-simplified-600-normal.woff2"))).toString("base64");
const fontFaceCss = `@font-face{font-family:'Noto Serif SC';font-style:normal;font-weight:400;font-display:block;src:url(data:font/woff2;base64,${font400}) format('woff2');}@font-face{font-family:'Noto Serif SC';font-style:normal;font-weight:600;font-display:block;src:url(data:font/woff2;base64,${font600}) format('woff2');}`;
const html = renderHtml(ir, { fontFaceCss });
const htmlPath = resolve(root, "output/pdf/fogbell.html");
const pdfPath = resolve(root, "output/pdf/fogbell-classic-fantasy.pdf");
const diagnosticsPath = resolve(root, "output/pdf/fogbell-diagnostics.json");
await mkdir(dirname(htmlPath), { recursive: true });
await writeFile(htmlPath, html, "utf8");
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ locale: "zh-CN" });
  const page = await context.newPage();
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all(Array.from(document.images).map((image) => image.complete ? Promise.resolve() : new Promise<void>((resolve) => { image.addEventListener("load", () => resolve(), { once: true }); image.addEventListener("error", () => resolve(), { once: true }); }))); });
  const fontCheck = await page.evaluate(() => document.fonts.check('9pt "Noto Serif SC"'));
  if (!fontCheck) ir.diagnostics.push({ code: "FONT_MISSING", severity: "warning", message: "Noto Serif SC 未被浏览器确认，可能回退到系统中文衬线字体。", details: { requested: "Noto Serif SC" } });
  await page.pdf({ path: pdfPath, format: "A4", printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true, headerTemplate: `<div style="width:100%;font:8px Georgia,serif;color:#7a1e18;padding:0 20mm;text-align:center;">${snapshot.project.title} · ${snapshot.project.subtitle}</div>`, footerTemplate: `<div style="width:100%;font:8px Georgia,serif;color:#6b625c;text-align:center;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>`, margin: { top: "26mm", bottom: "22mm", left: "20mm", right: "20mm" } });
  await context.close();
} finally { await browser.close(); }
await writeFile(diagnosticsPath, JSON.stringify({ schemaVersion: ir.schemaVersion, diagnostics: ir.diagnostics }, null, 2), "utf8");
console.log(JSON.stringify({ pdfPath, htmlPath, diagnosticsPath, diagnostics: ir.diagnostics }, null, 2));
