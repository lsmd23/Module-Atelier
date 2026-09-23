import { useState } from "react";
import { saveStateLabel, type SaveState } from "../state/saveMachine";
import {
  interventionModeInfo,
  interventionModes,
  useUiStore,
  type InterventionMode,
  type ViewMode
} from "../state/uiStore";
import { mockScenarioControl } from "../api/mock/mockApi";
import { apiMode } from "../api";
import { AccountPopover } from "./AccountPopover";

const viewModes: { id: ViewMode; label: string }[] = [
  { id: "editor", label: "写作" },
  { id: "split", label: "分栏" },
  { id: "preview", label: "预览" }
];

function SaveChip({ state }: { state: SaveState }) {
  const color =
    state.kind === "saved"
      ? "text-forest border-forest/40"
      : state.kind === "saving" || state.kind === "dirty"
        ? "text-brass border-brass/40"
        : "text-oxblood border-oxblood/50";
  const dot =
    state.kind === "saved"
      ? "bg-forest"
      : state.kind === "saving" || state.kind === "dirty"
        ? "bg-brass"
        : "bg-oxblood";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${color}`}
      role="status"
      aria-live="polite"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {saveStateLabel(state)}
      {state.kind === "saved" && <span className="text-ink-faint">r{state.revision}</span>}
    </span>
  );
}

function InterventionMenu() {
  const mode = useUiStore((s) => s.interventionMode);
  const setMode = useUiStore((s) => s.setInterventionMode);
  const [open, setOpen] = useState(false);
  const info = interventionModeInfo[mode];
  return (
    <div className="relative">
      <button
        type="button"
        className="rounded-md border border-hairline bg-paper px-2.5 py-1 text-xs text-ink-soft hover:border-brass"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`AI 干预模式：${info.label}`}
      >
        AI · {info.label} ▾
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-1 w-72 rounded-md border border-hairline bg-paper p-1 shadow-lg"
        >
          {interventionModes.map((m: InterventionMode) => (
            <button
              key={m}
              type="button"
              role="menuitemradio"
              aria-checked={m === mode}
              className={`block w-full rounded px-2.5 py-2 text-left hover:bg-parchment ${
                m === mode ? "bg-parchment" : ""
              }`}
              onClick={() => {
                setMode(m);
                setOpen(false);
              }}
            >
              <span className="flex items-center justify-between text-sm">
                <span className="font-semibold">{interventionModeInfo[m].label}</span>
                <span className="text-[10px] text-ink-faint">{m}</span>
              </span>
              <span className="mt-0.5 block text-xs leading-snug text-ink-soft">
                {interventionModeInfo[m].description}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** MOCK ONLY：原型演示用的场景开关。正式版删除。 */
function DevMenu() {
  const [, force] = useState(0);
  const flags = [
    { key: "simulateOffline" as const, label: "模拟离线" },
    { key: "simulateSaveFailure" as const, label: "模拟保存失败" },
    { key: "simulateConflict" as const, label: "模拟保存冲突" }
  ];
  return (
    <details className="relative">
      <summary className="cursor-pointer list-none rounded-md border border-dashed border-brass/60 px-2.5 py-1 text-xs text-brass hover:bg-parchment">
        原型
      </summary>
      <div className="absolute right-0 z-40 mt-1 w-56 rounded-md border border-hairline bg-paper p-2 shadow-lg">
        <p className="label-caps mb-1 text-[10px] text-ink-faint">Mock 场景（MOCK ONLY）</p>
        {flags.map((f) => (
          <label key={f.key} className="flex cursor-pointer items-center gap-2 px-1 py-1 text-xs text-ink-soft">
            <input
              type="checkbox"
              checked={mockScenarioControl[f.key]}
              onChange={(e) => {
                mockScenarioControl.setFlag(f.key, e.target.checked);
                force((v) => v + 1);
              }}
            />
            {f.label}
          </label>
        ))}
        <button
          type="button"
          className="mt-1 w-full rounded border border-hairline px-2 py-1 text-xs text-ink-soft hover:bg-parchment"
          onClick={() => mockScenarioControl.pushAmbientSuggestion()}
        >
          ✦ 模拟 Muse 静默推送建议
        </button>
      </div>
    </details>
  );
}

export function TopBar({
  saveState,
  pendingCount,
  projectName
}: {
  saveState: SaveState;
  pendingCount: number;
  projectName: string;
}) {
  const viewMode = useUiStore((s) => s.viewMode);
  const setViewMode = useUiStore((s) => s.setViewMode);
  const openContext = useUiStore((s) => s.openContext);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const toggleContext = useUiStore((s) => s.toggleContext);
  const closeProject = useUiStore((s) => s.closeProject);
  const hasOpenDocument = useUiStore((s) => s.currentDocumentId) !== "";

  return (
    <header className="flex h-12 items-center gap-3 border-b border-hairline bg-parchment px-3">
      <button
        type="button"
        onClick={toggleSidebar}
        className="rounded px-1.5 py-1 text-ink-soft hover:bg-parchment-deep"
        aria-label="切换项目导航"
      >
        ☰
      </button>
      <div className="flex min-w-0 items-baseline gap-2">
        <button
          type="button"
          onClick={closeProject}
          className="whitespace-nowrap text-sm font-semibold tracking-wide text-oxblood hover:underline"
          title="返回项目库"
        >
          ❦ Module Atelier
        </button>
        <span className="truncate text-sm text-ink-soft">{projectName}</span>
      </div>

      <div
        className="mx-auto flex rounded-md border border-hairline bg-paper p-0.5"
        role="tablist"
        aria-label="视图模式"
      >
        {viewModes.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={viewMode === m.id}
            onClick={() => setViewMode(m.id)}
            className={`rounded px-3 py-0.5 text-xs ${
              viewMode === m.id ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* 没有打开文档时不显示保存状态（无内容可保存） */}
      {hasOpenDocument && <SaveChip state={saveState} />}

      <button
        type="button"
        onClick={() => openContext("suggestions")}
        className={`relative rounded-md border px-2.5 py-1 text-sm ${
          pendingCount > 0 ? "border-arcane/50 text-arcane" : "border-hairline text-ink-faint"
        } hover:bg-paper`}
        aria-label={`建议收件箱，${pendingCount} 条待处理`}
        title="建议收件箱（建议静默到达，不会打断写作）"
      >
        ✦{pendingCount > 0 && <span className="ml-1 text-xs font-semibold">{pendingCount}</span>}
      </button>

      <InterventionMenu />
      {apiMode === "mock" && <DevMenu />}
      <AccountPopover />

      <button
        type="button"
        onClick={toggleContext}
        className="rounded px-1.5 py-1 text-ink-soft hover:bg-parchment-deep"
        aria-label="切换上下文面板"
      >
        ⊟
      </button>
    </header>
  );
}
