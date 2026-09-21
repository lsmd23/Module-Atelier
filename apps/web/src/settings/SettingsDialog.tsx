import { useCallback, useEffect, useState } from "react";
import { api, apiMode } from "../api";
import type { HealthStatus } from "../api/types";
import { deleteDraft, listDrafts } from "../drafts/draftStore";
import type { LocalDraft } from "../drafts/recovery";
import {
  autosaveDelayOptions,
  editorFontSizeOptions,
  interventionModeInfo,
  interventionModes,
  themeIds,
  themeInfo,
  useUiStore
} from "../state/uiStore";
import { contractVersion } from "@module-atelier/contracts";

/*
 * 设置中心（侧栏左下角 ⚙ 进入）。
 * 全部为真功能：界面主题、编辑器偏好（持久化并即时生效）、AI 干预模式、
 * 本地草稿管理、存储用量、健康检查（对齐 /api/health 形状）。
 * 账户与成员在右上角作者头像的下拉卡里（AccountPopover）。
 */

type SectionId = "appearance" | "editor" | "ai" | "data" | "about";

const sections: { id: SectionId; label: string }[] = [
  { id: "appearance", label: "外观" },
  { id: "editor", label: "编辑器" },
  { id: "ai", label: "AI 行为" },
  { id: "data", label: "本地数据" },
  { id: "about", label: "关于" }
];

function AppearanceSection() {
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  return (
    <div className="space-y-2.5" role="radiogroup" aria-label="界面主题">
      {themeIds.map((id) => {
        const t = themeInfo[id];
        const active = theme === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(id)}
            className={`flex w-full items-center gap-3 rounded-md border p-3 text-left ${
              active ? "border-oxblood/60 bg-oxblood/5" : "border-hairline bg-paper hover:border-brass/50"
            }`}
          >
            <span className="flex shrink-0 overflow-hidden rounded border border-hairline" aria-hidden>
              <span className="h-8 w-8" style={{ background: t.swatch[0] }} />
              <span className="h-8 w-8" style={{ background: t.swatch[1] }} />
              <span className="h-8 w-8" style={{ background: t.swatch[2] }} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">
                {t.label}
                {active && <span className="ml-2 text-[10px] font-normal text-oxblood">使用中</span>}
              </span>
              <span className="mt-0.5 block text-xs text-ink-soft">{t.description}</span>
            </span>
          </button>
        );
      })}
      <p className="pt-1 text-xs text-ink-faint">即时生效，记忆到本机。正文配色随主题联动，印刷对比度优先。</p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 py-1.5 text-sm">
      <span className="w-28 shrink-0 text-ink-faint">{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}

function EditorSection() {
  const fontSize = useUiStore((s) => s.editorFontSize);
  const setFontSize = useUiStore((s) => s.setEditorFontSize);
  const delay = useUiStore((s) => s.autosaveDelayMs);
  const setDelay = useUiStore((s) => s.setAutosaveDelayMs);
  const viewMode = useUiStore((s) => s.viewMode);
  const setViewMode = useUiStore((s) => s.setViewMode);

  return (
    <div className="space-y-5 text-sm">
      <section>
        <h4 className="label-caps mb-2 text-[11px] text-ink-faint">正文字号</h4>
        <div className="flex gap-1.5" role="radiogroup" aria-label="正文字号">
          {editorFontSizeOptions.map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={fontSize === o.id}
              onClick={() => setFontSize(o.id)}
              className={`rounded-md border px-3 py-1.5 ${
                fontSize === o.id
                  ? "border-oxblood bg-oxblood text-paper"
                  : "border-hairline text-ink-soft hover:border-brass"
              }`}
            >
              {o.label}
              <span className="ml-1 text-[10px] opacity-70">{o.id}</span>
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-ink-faint">即时生效，并记忆到本机。</p>
      </section>

      <section>
        <h4 className="label-caps mb-2 text-[11px] text-ink-faint">自动保存停顿</h4>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="自动保存停顿">
          {autosaveDelayOptions.map((o) => (
            <button
              key={o.ms}
              type="button"
              role="radio"
              aria-checked={delay === o.ms}
              onClick={() => setDelay(o.ms)}
              className={`rounded-md border px-3 py-1.5 ${
                delay === o.ms
                  ? "border-oxblood bg-oxblood text-paper"
                  : "border-hairline text-ink-soft hover:border-brass"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-ink-faint">停止输入多久后写回服务端。本地草稿始终每秒左右落 IndexedDB。</p>
      </section>

      <section>
        <h4 className="label-caps mb-2 text-[11px] text-ink-faint">默认视图</h4>
        <div className="flex gap-1.5" role="radiogroup" aria-label="默认视图">
          {(
            [
              { id: "editor", label: "写作" },
              { id: "split", label: "分栏" },
              { id: "preview", label: "预览" }
            ] as const
          ).map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={viewMode === m.id}
              onClick={() => setViewMode(m.id)}
              className={`rounded-md border px-3 py-1.5 ${
                viewMode === m.id
                  ? "border-oxblood bg-oxblood text-paper"
                  : "border-hairline text-ink-soft hover:border-brass"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function AiSection() {
  const mode = useUiStore((s) => s.interventionMode);
  const setMode = useUiStore((s) => s.setInterventionMode);
  return (
    <div className="space-y-2 text-sm" role="radiogroup" aria-label="AI 干预模式">
      {interventionModes.map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          onClick={() => setMode(m)}
          className={`block w-full rounded-md border px-3 py-2 text-left ${
            mode === m ? "border-arcane/60 bg-arcane/10" : "border-hairline bg-paper hover:border-brass/50"
          }`}
        >
          <span className="flex items-center justify-between">
            <span className="font-semibold">{interventionModeInfo[m].label}</span>
            <span className="text-[10px] text-ink-faint">{m}</span>
          </span>
          <span className="mt-0.5 block text-xs leading-snug text-ink-soft">
            {interventionModeInfo[m].description}
          </span>
        </button>
      ))}
      <p className="pt-1 text-xs leading-relaxed text-ink-faint">
        无论哪种模式，Agent 永远不能未经审阅修改作品；「关闭」会连后台分析一起停止。
      </p>
    </div>
  );
}

function DataSection() {
  const [drafts, setDrafts] = useState<LocalDraft[] | null>(null);
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);

  const reload = useCallback(() => {
    void listDrafts()
      .then(setDrafts)
      .catch(() => setDrafts([]));
    void navigator.storage
      ?.estimate()
      .then((e) => setUsage({ usage: e.usage ?? 0, quota: e.quota ?? 0 }))
      .catch(() => setUsage(null));
  }, []);

  useEffect(reload, [reload]);

  const fmt = (bytes: number) =>
    bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`;

  return (
    <div className="space-y-4 text-sm">
      <section>
        <h4 className="label-caps mb-2 text-[11px] text-ink-faint">本地草稿（IndexedDB）</h4>
        {drafts === null ? (
          <p className="text-xs text-ink-faint">读取中…</p>
        ) : drafts.length === 0 ? (
          <p className="text-xs text-ink-faint">没有未落盘的草稿。所有内容均已保存到服务端。</p>
        ) : (
          <ul className="space-y-1.5">
            {drafts.map((d) => (
              <li
                key={d.documentId}
                className="flex items-center gap-2 rounded border border-hairline bg-paper px-2.5 py-1.5 text-xs"
              >
                <span className="font-medium">{d.documentId}</span>
                <span className="text-ink-faint">
                  基于 r{d.baseRevision} · {new Date(d.updatedAt).toLocaleString("zh-CN")}
                </span>
                <button
                  type="button"
                  className="ml-auto rounded border border-oxblood/40 px-2 py-0.5 text-oxblood hover:bg-oxblood/10"
                  onClick={() => {
                    void deleteDraft(d.documentId).then(reload);
                  }}
                >
                  删除
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1.5 text-xs leading-relaxed text-ink-faint">
          草稿只是崩溃/离线时的恢复机制；服务端 revision 才是正式事实。删除草稿不影响服务端内容。
        </p>
      </section>

      <section>
        <h4 className="label-caps mb-2 text-[11px] text-ink-faint">浏览器存储</h4>
        {usage ? (
          <p className="text-xs text-ink-soft">
            已用 {fmt(usage.usage)} / 配额约 {fmt(usage.quota)}
          </p>
        ) : (
          <p className="text-xs text-ink-faint">（此环境不支持存储估算）</p>
        )}
      </section>
    </div>
  );
}

function AboutSection() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const check = () => {
    setChecking(true);
    setHealthError(null);
    api
      .getHealth()
      .then(setHealth)
      .catch((e: Error) => setHealthError(e.message))
      .finally(() => setChecking(false));
  };

  return (
    <div className="text-sm">
      <div className="rule-ornament mb-3">
        <span className="text-xs">❦</span>
      </div>
      <Row label="应用">Module Atelier（创作工作台原型）</Row>
      <Row label="前端包">@module-atelier/web 0.0.0</Row>
      <Row label="共享契约">v{contractVersion}</Row>
      <Row label="数据模式">
        {apiMode === "mock" ? "MOCK（内存数据，刷新重置）" : "HTTP（连接 apps/api）"}
      </Row>
      <Row label="构建">{import.meta.env.DEV ? "开发模式（Vite dev server）" : "生产构建"}</Row>
      <div className="mt-3 border-t border-hairline pt-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={check}
            disabled={checking}
            className="rounded-md border border-hairline bg-paper px-3 py-1.5 text-sm text-ink-soft hover:border-brass disabled:opacity-40"
          >
            {checking ? "检查中…" : "检查服务连接"}
          </button>
          {health && (
            <span className="text-xs text-forest">
              ● {health.status === "ok" ? "服务正常" : "服务降级"} · 数据库 {health.database === "up" ? "在线" : "离线"} ·
              契约 v{health.contractVersion}
            </span>
          )}
          {healthError && <span className="text-xs text-oxblood">连接失败：{healthError}</span>}
        </div>
        <p className="mt-1.5 text-xs text-ink-faint">对齐 GET /api/health 的响应形状；mock 模式下返回本地契约版本。</p>
      </div>
    </div>
  );
}

export function SettingsDialog() {
  const setOpen = useUiStore((s) => s.setSettingsOpen);
  const [section, setSection] = useState<SectionId>("appearance");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="设置"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-6"
      onClick={() => setOpen(false)}
    >
      <div
        className="flex h-[32rem] w-full max-w-3xl overflow-hidden rounded-lg border border-hairline bg-parchment shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <nav className="flex w-44 shrink-0 flex-col border-r border-hairline bg-parchment-deep/50 p-2" aria-label="设置分区">
          <p className="label-caps mb-2 px-2 pt-1 text-[11px] text-ink-faint">设置</p>
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              aria-current={section === s.id ? "page" : undefined}
              className={`rounded px-2.5 py-1.5 text-left text-sm ${
                section === s.id ? "bg-ink/8 font-semibold text-ink" : "text-ink-soft hover:bg-parchment-deep"
              }`}
            >
              {s.label}
            </button>
          ))}
          <p className="mt-auto px-2 text-[10px] leading-relaxed text-ink-faint">
            偏好记忆在本机 localStorage。
          </p>
        </nav>
        <div className="min-w-0 flex-1 overflow-y-auto p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">{sections.find((s) => s.id === section)?.label}</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded px-2 py-0.5 text-ink-faint hover:bg-parchment-deep hover:text-ink"
              aria-label="关闭设置"
            >
              ×
            </button>
          </div>
          {section === "appearance" && <AppearanceSection />}
          {section === "editor" && <EditorSection />}
          {section === "ai" && <AiSection />}
          {section === "data" && <DataSection />}
          {section === "about" && <AboutSection />}
        </div>
      </div>
    </div>
  );
}
