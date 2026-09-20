/**
 * 本地草稿与服务端版本的比对（纯函数）。
 * 最高原则：不丢作者内容、不静默覆盖服务端较新版本。
 */
export interface LocalDraft {
  documentId: string;
  projectId: string;
  content: string;
  baseRevision: number;
  updatedAt: string; // ISO
}

export interface ServerSnapshot {
  content: string;
  revision: number;
  updatedAt: string; // ISO
}

export type RecoveryDecision =
  | { action: "use-server" }
  | { action: "prompt-restore"; draft: LocalDraft; server: ServerSnapshot };

export function evaluateRecovery(server: ServerSnapshot, draft: LocalDraft | null): RecoveryDecision {
  if (!draft) return { action: "use-server" };
  if (draft.content === server.content) return { action: "use-server" };
  // 草稿与服务端内容不一致：只有草稿明确更新时才提示恢复；
  // 服务端较新（例如另一台设备已保存）则以服务端为准，草稿留待用户手动处理。
  if (Date.parse(draft.updatedAt) > Date.parse(server.updatedAt)) {
    return { action: "prompt-restore", draft, server };
  }
  return { action: "use-server" };
}
