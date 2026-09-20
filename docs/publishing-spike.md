# Publishing technical spike report

## Scope

PUB-001 establishes a minimal, database-independent publishing loop. It deliberately does not add an API, worker queue, editor, database adapter, or shared contract migration.

## Implemented

- `packages/publisher/src/ir.ts`: source-aware `ModuleIR` prototype with `Document`, `Section`, `Heading`, `Paragraph`, `List`, `Callout`, `StatBlock`, `Table`, `Columns`, `PageBreak`, `Image`, `EntityReference`, and diagnostics.
- `packages/publisher/src/parser.ts`: small Markdown/block parser for headings, paragraphs, lists, tables, and controlled `:::` directives. It keeps document ID, offset, line, and column on parsed nodes and diagnoses unsupported/unclosed directives.
- `packages/publisher/src/render.ts`: HTML renderer and Classic Fantasy CSS theme shared by browser preview and PDF generation. User text is HTML-escaped; no raw HTML execution path exists.
- `packages/publisher/scripts/render-fixture.ts`: Playwright Chromium render, `document.fonts.ready`, image readiness, font check, A4 PDF generation, page-number footer, project header, diagnostics output, and isolated browser context cleanup.
- `packages/publisher/fixtures/fogbell.md`: original Chinese fixture covering bilingual headings, two-column paragraphs, read-aloud, rule/development/treasure/experience boxes, table, statblock, glossary, long URL, and explicit page break.
- `docs/layout-spec.md`: reference-derived measurements and typography/layout rules without copying reference branding, illustration, font, text, or page artwork.

## Actual verification

- TypeScript strict check: passed with `./node_modules/.bin/tsc -p packages/publisher/tsconfig.json --noEmit`.
- Vitest: 3 tests passed (`render.test.ts`), including source mapping, invalid directive diagnostics, and escaped untrusted HTML.
- Playwright Chromium: installed and ran `scripts/render-fixture.ts` successfully.
- PDF: generated at `output/pdf/fogbell-classic-fantasy.pdf`; 6 A4 pages, 189,799 bytes at the final render.
- PDF text check: PyMuPDF confirmed selectable text and required strings including `雾钟守望者`, `朗读 Read Aloud`, `规则 Rule`, `发展 Development`, `宝藏 Treasure`, `经验奖励 Experience`, `术语表 Glossary`, and the appendix.
- PDF font check: embedded Type0 fonts include Noto Serif SC regular/semibold plus system fallback STSongti SC and Georgia. The browser font check produced no `FONT_MISSING` diagnostic.
- Visual QA: pages rendered to `output/png/fogbell-01.png` through `output/png/fogbell-06.png` with PyMuPDF and inspected. The added long Chinese section crosses a page boundary without clipping; no black glyph blocks, broken tables, or unsafe raw HTML execution was observed.
- Performance benchmark: **NOT BENCHMARKED**. This is a small fixture, not the planned 50-page/50k-character benchmark.
- Full workspace `pnpm typecheck`: **PASS** on the final branch state (contracts, db, domain, api, and publisher).

## Font/material licensing

The fixture is original and contains no reference-PDF prose, logos, illustrations, or proprietary page art. The generated theme uses only CSS shapes and colors. Noto Serif SC is consumed from `@fontsource/noto-serif-sc@5.3.0`, authored by Google and licensed under SIL Open Font License 1.1; its license is included in the npm package. The spike embeds only the required font subsets into the generated HTML. A production distribution should retain the license notice in the published package and pin/record the exact font package version.

## Differences from the reference sample

- No third-party brand marks, official logos, illustrations, proprietary fonts, or translated source text.
- Original `雾钟镇 / Fogbell Hamlet` cover with a plain deep-red rule instead of artwork.
- A more explicit diagnostic/source-map model and HTML escaping boundary.
- Header/footer are Playwright PDF templates rather than undocumented Word/PDF artifacts.
- The prototype uses a deliberately small, neutral statblock and callout vocabulary; it does not imitate the sample's exact page geometry or ornamental details.

## Contract recommendation

Promote a reviewed `PublishSnapshot` into `packages/contracts` only after Backend/Lead Architect review. Proposed minimum fields:

```ts
type PublishSnapshot = {
  schemaVersion: string;
  project: { id: string; title: string; subtitle?: string; language: "zh-CN" | "en" };
  documents: Array<{ id: string; revision: number; title: string; content: string; order: number }>;
  entities: Array<{ id: string; type: string; displayName: string; resolvedData: Record<string, unknown> }>;
  assets: Array<{ id: string; mimeType: string; width: number; height: number; safeLocation: string; caption?: string }>;
  theme: { id: string; version: string };
};
```

`ModuleIR` should remain renderer-facing and preserve `sourceLocation` on every author-derived node. Diagnostics should be shared later with fields `code`, `severity`, `message`, `documentId`, `sourceLocation`, `nodeType`, and `details`. Entity and asset resolution must happen before publishing; the publisher must not query tables or guess entity identity from display text.

## Known limitations

- This is a pure TypeScript prototype, not yet wired to `apps/worker` or a job contract.
- No Paged.js integration; Playwright CSS columns provide the current pagination engine.
- The fixture's explicit page break intentionally creates a mostly empty glossary page before the appendix; this demonstrates deterministic author control but is not a final editorial policy.
- Very long statblocks and callouts are kept together when possible; safe split diagnostics and overflow measurement are not yet complete.
- TOC entries are IR-derived but do not yet contain computed page numbers or clickable anchors.
- Image and entity nodes exist in IR/renderer but do not yet have an approved asset/entity resolver contract.
- Network/`file:`/SSRF blocking belongs in the future worker browser context policy; the current fixture has no external assets, and raw HTML is escaped.
