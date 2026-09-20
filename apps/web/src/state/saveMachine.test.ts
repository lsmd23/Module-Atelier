import { describe, expect, it } from "vitest";
import { initialSaveState, reduceSave, saveStateLabel, type SaveState } from "./saveMachine";

describe("saveMachine", () => {
  it("编辑后进入未保存，绝不提前显示已保存", () => {
    let s: SaveState = initialSaveState(3);
    s = reduceSave(s, { type: "EDIT" });
    expect(s).toEqual({ kind: "dirty", baseRevision: 3 });
    expect(saveStateLabel(s)).toBe("未保存");
  });

  it("完整保存周期：dirty → saving → saved（服务端确认后才显示已保存）", () => {
    let s: SaveState = initialSaveState(3);
    s = reduceSave(s, { type: "EDIT" });
    s = reduceSave(s, { type: "SAVE_START" });
    expect(s).toEqual({ kind: "saving", baseRevision: 3 });
    s = reduceSave(s, { type: "SAVE_OK", revision: 4 });
    expect(s).toEqual({ kind: "saved", revision: 4 });
    expect(saveStateLabel(s)).toBe("已保存");
  });

  it("保存期间继续编辑：saving 外观保持，内容仍被视为待保存", () => {
    let s: SaveState = initialSaveState(3);
    s = reduceSave(s, { type: "EDIT" });
    s = reduceSave(s, { type: "SAVE_START" });
    s = reduceSave(s, { type: "EDIT" });
    expect(s.kind).toBe("saving"); // 由调度器在 SAVE_OK 后再次置脏
  });

  it("离线失败与保存失败", () => {
    let s: SaveState = initialSaveState(3);
    s = reduceSave(s, { type: "EDIT" });
    s = reduceSave(s, { type: "SAVE_START" });
    s = reduceSave(s, { type: "SAVE_FAILED", reason: "offline" });
    expect(saveStateLabel(s)).toBe("离线");
    s = reduceSave(s, { type: "SAVE_FAILED", reason: "error" });
    expect(saveStateLabel(s)).toBe("保存失败");
  });

  it("冲突携带双方 revision，且不会退回 saved", () => {
    let s: SaveState = initialSaveState(3);
    s = reduceSave(s, { type: "EDIT" });
    s = reduceSave(s, { type: "SAVE_START" });
    s = reduceSave(s, { type: "SAVE_CONFLICT", actualRevision: 5 });
    expect(s).toEqual({ kind: "conflict", baseRevision: 3, actualRevision: 5 });
    expect(saveStateLabel(s)).toBe("保存冲突");
  });

  it("失败后可重试并回到已保存", () => {
    let s: SaveState = { kind: "failed", baseRevision: 3, reason: "error" };
    s = reduceSave(s, { type: "SAVE_START" });
    s = reduceSave(s, { type: "SAVE_OK", revision: 4 });
    expect(s).toEqual({ kind: "saved", revision: 4 });
  });
});
