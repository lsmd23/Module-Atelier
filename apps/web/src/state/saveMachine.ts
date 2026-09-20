/**
 * 保存状态机（纯函数，供单元测试）。
 *
 * 规则（来自任务约束）：
 * - 只有服务端确认后才允许显示「已保存」；
 * - 服务端 revision 是正式事实；
 * - CONFLICT 必须显式呈现，禁止静默覆盖。
 */
export type SaveState =
  | { kind: "saved"; revision: number }
  | { kind: "dirty"; baseRevision: number }
  | { kind: "saving"; baseRevision: number }
  | { kind: "failed"; baseRevision: number; reason: "offline" | "error" }
  | { kind: "conflict"; baseRevision: number; actualRevision: number };

export type SaveEvent =
  | { type: "EDIT" }
  | { type: "SAVE_START" }
  | { type: "SAVE_OK"; revision: number }
  | { type: "SAVE_FAILED"; reason: "offline" | "error" }
  | { type: "SAVE_CONFLICT"; actualRevision: number };

export function initialSaveState(revision: number): SaveState {
  return { kind: "saved", revision };
}

function baseRevisionOf(state: SaveState): number {
  return state.kind === "saved" ? state.revision : state.baseRevision;
}

export function reduceSave(state: SaveState, event: SaveEvent): SaveState {
  switch (event.type) {
    case "EDIT":
      // 保存进行中来了新编辑：保持 saving 外观，但完成后必须再次保存。
      // 由调用方（autosave 调度器）负责在 SAVE_OK 后检查内容是否又变脏。
      if (state.kind === "saving") return state;
      return { kind: "dirty", baseRevision: baseRevisionOf(state) };
    case "SAVE_START":
      return { kind: "saving", baseRevision: baseRevisionOf(state) };
    case "SAVE_OK":
      return { kind: "saved", revision: event.revision };
    case "SAVE_FAILED":
      return { kind: "failed", baseRevision: baseRevisionOf(state), reason: event.reason };
    case "SAVE_CONFLICT":
      return { kind: "conflict", baseRevision: baseRevisionOf(state), actualRevision: event.actualRevision };
  }
}

export function saveStateLabel(state: SaveState): string {
  switch (state.kind) {
    case "saved":
      return "已保存";
    case "dirty":
      return "未保存";
    case "saving":
      return "保存中…";
    case "failed":
      return state.reason === "offline" ? "离线" : "保存失败";
    case "conflict":
      return "保存冲突";
  }
}
