import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Document } from "@module-atelier/contracts";
import { api } from "../api";
import { deleteDraft, loadDraft, saveDraft } from "../drafts/draftStore";
import { evaluateRecovery, type LocalDraft, type RecoveryDecision } from "../drafts/recovery";
import type { MarkdownEditorHandle } from "../editor/MarkdownEditor";
import { initialSaveState, reduceSave, type SaveState } from "./saveMachine";

const AUTOSAVE_DELAY_MS = 1500;
const DRAFT_DELAY_MS = 800;
const PREVIEW_DELAY_MS = 500;

export interface DocumentSession {
  status: "loading" | "ready";
  document: Document | null;
  saveState: SaveState;
  /** 打开文档时检测到的草稿恢复决策 */
  recovery: RecoveryDecision | null;
  /** 预览用内容（防抖后，composition 期间冻结） */
  previewContent: string;
  editorKey: string;
  initialContent: string;
  bindEditor(view: MarkdownEditorHandle | null): void;
  handleDocChanged(content: string): void;
  flushSave(): void;
  resolveRecovery(choice: "restore-draft" | "use-server" | "keep-draft"): void;
  reloadFromServer(): void;
  /** 冲突处理用：本地内容已存入草稿后，强制以服务端版本重建编辑器（跳过草稿提示） */
  forceReloadFromServer(): void;
}

/**
 * 文档会话：编辑器的「打开中的文档」生命周期。
 * 负责 autosave、保存状态机、IndexedDB 草稿、恢复决策。
 * 编辑器挂载期间内容是唯一事实来源；外部变更（如 Patch 应用）
 * 只能通过重建编辑器（editorKey）进入。
 */
export function useDocumentSession(documentId: string, opts?: { autosaveDelayMs?: number }): DocumentSession {
  const queryClient = useQueryClient();
  const autosaveDelayRef = useRef(opts?.autosaveDelayMs ?? AUTOSAVE_DELAY_MS);
  autosaveDelayRef.current = opts?.autosaveDelayMs ?? AUTOSAVE_DELAY_MS;
  const [saveState, setSaveState] = useState<SaveState>({ kind: "saved", revision: 0 });
  const [recovery, setRecovery] = useState<RecoveryDecision | null>(null);
  // 强制重载计数器：React Query 结构共享会让"内容相同"的 refetch 不产生新引用，
  // 冲突重载（服务端内容未变）必须靠它驱动重建 effect
  const [reloadNonce, setReloadNonce] = useState(0);
  const [editorKey, setEditorKey] = useState("");
  const [previewContent, setPreviewContent] = useState("");
  const [readyContent, setReadyContent] = useState<string | null>(null);

  const editorRef = useRef<MarkdownEditorHandle | null>(null);
  const composingGuard = useRef<(() => boolean) | null>(null);
  const pendingContentRef = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveStateRef = useRef(saveState);
  saveStateRef.current = saveState;
  const documentRef = useRef<Document | null>(null);
  const skipNextRecoveryRef = useRef(false);

  const query = useQuery({
    queryKey: ["document", documentId],
    queryFn: () => api.getDocument(documentId),
    enabled: documentId !== ""
  });

  // 文档加载后：与服务端快照比对本地草稿
  useEffect(() => {
    const doc = query.data;
    if (!doc) return;
    // 有未落盘的本地编辑时，绝不因后台 refetch 重置编辑器（防丢稿护栏）
    if (pendingContentRef.current !== null && readyContent !== null) return;
    documentRef.current = doc;
    let cancelled = false;
    void (async () => {
      const draft = await loadDraft(documentId).catch(() => null);
      if (cancelled) return;
      const decision = skipNextRecoveryRef.current
        ? ({ action: "use-server" } as const)
        : evaluateRecovery(
            { content: doc.content, revision: doc.revision, updatedAt: doc.updatedAt },
            draft
          );
      skipNextRecoveryRef.current = false;
      if (decision.action === "prompt-restore") {
        setRecovery(decision);
        setReadyContent(doc.content); // 先用服务端内容打开，等用户决定
      } else {
        if (draft) void deleteDraft(documentId).catch(() => undefined);
        setReadyContent(doc.content);
      }
      setSaveState(initialSaveState(doc.revision));
      setPreviewContent(doc.content);
      setEditorKey(`${documentId}:${doc.revision}:${Date.now()}`);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, query.data, reloadNonce]);

  const clearTimers = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (draftTimer.current) clearTimeout(draftTimer.current);
    if (previewTimer.current) clearTimeout(previewTimer.current);
  };

  const doSave = useCallback(async () => {
    const doc = documentRef.current;
    const content = pendingContentRef.current;
    if (!doc || content === null) return;
    const state = saveStateRef.current;
    const baseRevision = state.kind === "saved" ? state.revision : state.baseRevision;
    setSaveState(reduceSave(state, { type: "SAVE_START" }));
    try {
      const result = await api.saveDocument(doc.id, { content, baseRevision });
      if (result.ok) {
        documentRef.current = result.document;
        pendingContentRef.current = null;
        void queryClient.invalidateQueries({ queryKey: ["documents"] });
        const current = editorRef.current?.getContent();
        const after = reduceSave(saveStateRef.current, { type: "SAVE_OK", revision: result.document.revision });
        if (current !== undefined && current !== result.document.content) {
          // 保存期间作者又改了：标记 dirty 并安排下一轮
          setSaveState(reduceSave(after, { type: "EDIT" }));
          pendingContentRef.current = current ?? null;
          saveTimer.current = setTimeout(() => void doSave(), autosaveDelayRef.current);
        } else {
          setSaveState(after);
          void deleteDraft(doc.id).catch(() => undefined);
        }
      } else {
        setSaveState(
          reduceSave(saveStateRef.current, {
            type: "SAVE_CONFLICT",
            actualRevision: result.conflict.actualRevision
          })
        );
      }
    } catch (err) {
      const offline = err instanceof Error && err.message === "OFFLINE";
      setSaveState(reduceSave(saveStateRef.current, { type: "SAVE_FAILED", reason: offline ? "offline" : "error" }));
    }
  }, [queryClient]);

  const handleDocChanged = useCallback(
    (content: string) => {
      pendingContentRef.current = content;
      setSaveState((s) => reduceSave(s, { type: "EDIT" }));
      clearTimers();
      // composition 期间不排程（compositionend 会补发一次 onDocChanged）
      if (composingGuard.current?.()) return;
      saveTimer.current = setTimeout(() => void doSave(), autosaveDelayRef.current);
      previewTimer.current = setTimeout(() => setPreviewContent(content), PREVIEW_DELAY_MS);
      draftTimer.current = setTimeout(() => {
        const doc = documentRef.current;
        if (!doc) return;
        const state = saveStateRef.current;
        const draft: LocalDraft = {
          documentId: doc.id,
          projectId: doc.projectId,
          content,
          baseRevision: state.kind === "saved" ? state.revision : state.baseRevision,
          updatedAt: new Date().toISOString()
        };
        void saveDraft(draft).catch(() => undefined);
      }, DRAFT_DELAY_MS);
    },
    [doSave]
  );

  // 卸载/切文档前尽力落草稿
  useEffect(() => {
    return () => {
      clearTimers();
      const content = pendingContentRef.current;
      const doc = documentRef.current;
      const state = saveStateRef.current;
      if (content !== null && doc) {
        void saveDraft({
          documentId: doc.id,
          projectId: doc.projectId,
          content,
          baseRevision: state.kind === "saved" ? state.revision : state.baseRevision,
          updatedAt: new Date().toISOString()
        }).catch(() => undefined);
      }
      pendingContentRef.current = null;
      documentRef.current = null;
    };
  }, [documentId]);

  const bindEditor = useCallback((handle: MarkdownEditorHandle | null) => {
    editorRef.current = handle;
    composingGuard.current = handle ? () => handle.isComposing() : null;
  }, []);

  const flushSave = useCallback(() => {
    if (pendingContentRef.current === null) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    void doSave();
  }, [doSave]);

  const resolveRecovery = useCallback(
    (choice: "restore-draft" | "use-server" | "keep-draft") => {
      if (!recovery || recovery.action !== "prompt-restore") return;
      if (choice === "restore-draft") {
        // 用草稿内容重建编辑器，并标为未保存。故意不触发自动保存：
        // 等作者下一次编辑才真正写回服务端（与对话框文案一致）。
        setReadyContent(recovery.draft.content);
        pendingContentRef.current = recovery.draft.content;
        setPreviewContent(recovery.draft.content);
        setSaveState({ kind: "dirty", baseRevision: recovery.draft.baseRevision });
        setEditorKey(`${documentId}:restore:${Date.now()}`);
      } else if (choice === "use-server") {
        void deleteDraft(documentId).catch(() => undefined);
        setReadyContent(recovery.server.content);
        setEditorKey(`${documentId}:server:${Date.now()}`);
      }
      // keep-draft：继续看服务端版本，草稿保留在本地，下次打开仍会询问
      setRecovery(null);
    },
    [recovery, documentId]
  );

  const reloadFromServer = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["document", documentId] });
  }, [documentId, queryClient]);

  const forceReloadFromServer = useCallback(() => {
    clearTimers();
    pendingContentRef.current = null;
    skipNextRecoveryRef.current = true;
    setReloadNonce((n) => n + 1);
    void queryClient.invalidateQueries({ queryKey: ["document", documentId] });
  }, [documentId, queryClient]);

  return useMemo(
    () => ({
      status: readyContent === null ? ("loading" as const) : ("ready" as const),
      document: documentRef.current,
      saveState,
      recovery,
      previewContent,
      editorKey,
      initialContent: readyContent ?? "",
      bindEditor,
      handleDocChanged,
      flushSave,
      resolveRecovery,
      reloadFromServer,
      forceReloadFromServer
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [readyContent, saveState, recovery, previewContent, editorKey]
  );
}
