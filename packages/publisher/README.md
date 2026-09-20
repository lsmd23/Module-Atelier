# `@module-atelier/publisher` publishing spike

This package is an intentionally small, database-independent compiler loop:

```text
Markdown + structured directives
  -> Module IR (`module-ir@0.1`)
  -> shared HTML/CSS theme
  -> Playwright Chromium A4 PDF
```

The prototype is not a frozen cross-module contract. `PublishSnapshot` and `ModuleIR` live here until the Lead Architect accepts a shared contract in `packages/contracts`.

## Run the fixture

```sh
pnpm install --frozen-lockfile
pnpm --dir packages/publisher exec tsc -p tsconfig.json --noEmit
pnpm --dir packages/publisher exec vitest run src/render.test.ts
pnpm --dir packages/publisher exec playwright install chromium
pnpm --dir packages/publisher exec tsx scripts/render-fixture.ts
```

The script writes `output/pdf/fogbell-classic-fantasy.pdf`, a self-contained HTML artifact, and a diagnostics JSON file. The fixture uses Noto Serif SC from `@fontsource/noto-serif-sc` (SIL OFL 1.1) and embeds the simplified-Chinese weights into the HTML for deterministic worker output.

Supported prototype directives: `readaloud`, `rule`, `development`, `treasure`, `experience`, `statblock`, `image`, `columns`, and `pagebreak`. Markdown images must use `asset:<assetId>` and resolve through the snapshot's controlled assets; arbitrary network/file URLs are rejected. Raw HTML is treated as text and escaped. Arbitrary CSS, database reads, editor APIs, and Paged.js are intentionally out of scope for this spike.
