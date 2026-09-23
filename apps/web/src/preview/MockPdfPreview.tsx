import { useEffect, useMemo, useState } from "react";
import { parseDocument, type Block, type Span } from "./mockRenderer";

/**
 * MOCK ONLY —— 本地模拟书页预览。
 * 正式版：请求 Publisher 编译（Module IR → 渲染产物），此处仅演示排版效果。
 * 防打扰规则：预览在输入停顿后才重排；composition 期间由会话层冻结内容。
 */

function RenderSpans({ spans }: { spans: Span[] }) {
  return (
    <>
      {spans.map((s, i) => {
        if (s.ref) {
          return (
            <span key={i} className="font-semibold text-forest" title={`实体引用：${s.ref}`}>
              {s.text}
            </span>
          );
        }
        if (s.bold) return <strong key={i}>{s.text}</strong>;
        if (s.italic) return <em key={i}>{s.text}</em>;
        return <span key={i}>{s.text}</span>;
      })}
    </>
  );
}

function StatBlock({ block }: { block: Extract<Block, { type: "monster" }> }) {
  const stats = block.rows.find((r) => r.includes("|"))?.split("|").map((s) => s.trim());
  return (
    <figure className="statblock my-3 py-2 text-[13px] leading-relaxed" aria-label={`怪物资料卡：${block.title}`}>
      <figcaption className="mb-1 text-base font-bold tracking-wide text-oxblood">{block.title}</figcaption>
      {block.rows
        .filter((r) => !r.includes("|"))
        .map((r, i) => {
          const [k, ...rest] = r.split(":");
          return (
            <p key={i}>
              <span className="font-semibold text-oxblood-deep">{k}：</span>
              {rest.join(":")}
            </p>
          );
        })}
      {stats && (
        <table className="my-1 w-full border-y border-oxblood/30 text-center text-[12px]">
          <tbody>
            <tr className="font-semibold text-oxblood-deep">
              {stats.map((s) => (
                <td key={s} className="px-1 pt-1">
                  {s.split(" ")[0]}
                </td>
              ))}
            </tr>
            <tr>
              {stats.map((s) => (
                <td key={s} className="px-1 pb-1">
                  {s.split(" ").slice(1).join(" ")}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      )}
    </figure>
  );
}

function LoreBox({ title, lines, variant }: { title: string; lines: string[]; variant: "info" | "background" }) {
  return (
    <aside
      className="lorebox my-3 p-3 text-[13px] leading-relaxed"
      aria-label={`${variant === "info" ? "信息框" : "背景框"}：${title}`}
    >
      <p className="label-caps mb-1 text-[13px] font-semibold text-brass">
        {variant === "info" ? "ℹ " : "📜 "}
        {title}
      </p>
      {lines.map((l, i) => (
        <p key={i} className="mt-1">
          {l}
        </p>
      ))}
    </aside>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case "chapter":
      return (
        <header className="mb-4 mt-1 break-after-avoid">
          <p className="rule-ornament mb-2">
            <span className="text-xs">❦</span>
          </p>
          <h1 className="text-center text-2xl font-bold tracking-widest text-oxblood-deep">{block.text}</h1>
          <p className="rule-ornament mt-2">
            <span className="text-xs">❦</span>
          </p>
        </header>
      );
    case "heading":
      return (
        <h2 className="mb-2 mt-4 break-after-avoid border-b border-hairline pb-0.5 text-lg font-bold text-ink">
          {block.text}
        </h2>
      );
    case "paragraph":
      return (
        <p className={`mb-2 text-justify text-[13.5px] leading-relaxed ${block.dropCap ? "drop-cap" : ""}`}>
          <RenderSpans spans={block.spans} />
        </p>
      );
    case "quote":
      return (
        <blockquote className="my-2 border-l-2 border-brass/50 pl-3 text-[13px] text-ink-soft">
          <RenderSpans spans={block.spans} />
        </blockquote>
      );
    case "list":
      return (
        <ul className="mb-2 list-disc pl-5 text-[13.5px]">
          {block.items.map((item, i) => (
            <li key={i}>
              <RenderSpans spans={item} />
            </li>
          ))}
        </ul>
      );
    case "monster":
      return <StatBlock block={block} />;
    case "info":
      return <LoreBox title={block.title} lines={block.lines} variant="info" />;
    case "background":
      return <LoreBox title={block.title} lines={block.lines} variant="background" />;
    case "readaloud":
      return (
        <aside className="readaloud my-3 p-3 text-[13.5px] leading-relaxed text-ink-soft" aria-label="朗读框">
          {block.lines.map((l, i) => (
            <p key={i}>{l}</p>
          ))}
        </aside>
      );
    case "hr":
      return (
        <p className="rule-ornament my-4">
          <span className="text-xs">❦</span>
        </p>
      );
  }
}

export function MockPdfPreview({
  content,
  title,
  projectName
}: {
  content: string;
  title: string;
  projectName: string;
}) {
  const [phase, setPhase] = useState<"idle" | "compiling" | "done">("idle");
  const [shown, setShown] = useState(content);

  // 模拟编译延迟：内容变化 → 短暂「编译中」→ 更新。
  // 真正的阻塞只有这一次状态切换；编辑器输入完全不受影响。
  useEffect(() => {
    if (content === shown) return;
    setPhase("compiling");
    const t = setTimeout(() => {
      setShown(content);
      setPhase("done");
    }, 350);
    return () => clearTimeout(t);
  }, [content, shown]);

  const blocks = useMemo(() => parseDocument(shown), [shown]);

  return (
    <section className="flex h-full flex-col bg-parchment-deep/60" aria-label="书页预览（MOCK）">
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-hairline px-3 text-xs text-ink-faint">
        <span className="label-caps truncate">Preview · MOCK ONLY（正式渲染由 Publisher 提供）</span>
        <span role="status" className="shrink-0">
          {phase === "compiling" ? "编译中…" : phase === "done" ? "已更新" : ""}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="book-page mx-auto w-full max-w-[44rem] px-10 py-10">
          <p className="mb-6 text-center text-[11px] tracking-[0.3em] text-ink-faint">
            {projectName}
            {title ? ` · ${title}` : ""}
          </p>
          <div className="book-columns">
            {blocks.map((b, i) => (
              <BlockView key={i} block={b} />
            ))}
          </div>
          <p className="mt-8 border-t border-hairline pt-2 text-center text-[11px] text-ink-faint">— 1 —</p>
        </div>
      </div>
    </section>
  );
}
