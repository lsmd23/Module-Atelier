import { describe, expect, it } from "vitest";
import { evaluateRecovery, type LocalDraft, type ServerSnapshot } from "./recovery";

const server: ServerSnapshot = {
  content: "# 第一章\n服务端内容",
  revision: 7,
  updatedAt: "2026-09-19T18:30:00Z"
};

const draftOf = (over: Partial<LocalDraft>): LocalDraft => ({
  documentId: "doc-ch1",
  projectId: "proj-veil",
  content: "# 第一章\n本地草稿内容",
  baseRevision: 7,
  updatedAt: "2026-09-19T19:00:00Z",
  ...over
});

describe("evaluateRecovery", () => {
  it("无草稿 → 直接用服务端", () => {
    expect(evaluateRecovery(server, null).action).toBe("use-server");
  });

  it("草稿与服务端内容一致 → 丢弃草稿，用服务端", () => {
    expect(evaluateRecovery(server, draftOf({ content: server.content })).action).toBe("use-server");
  });

  it("草稿比服务端新且内容不同 → 提示恢复，绝不自动覆盖", () => {
    const d = evaluateRecovery(server, draftOf({}));
    expect(d.action).toBe("prompt-restore");
  });

  it("服务端较新（另一设备已保存）→ 以服务端为准", () => {
    const d = evaluateRecovery(server, draftOf({ updatedAt: "2026-09-19T10:00:00Z" }));
    expect(d.action).toBe("use-server");
  });
});
