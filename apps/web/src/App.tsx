import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Entity, EntityType } from "@module-atelier/contracts";
import { api } from "./api";
import { mockApi } from "./api/mock/mockApi"; // MOCK ONLY：建议推送订阅与原型场景开关
import type { SuggestionAction } from "./api/types";
import { ContextPanel } from "./components/ContextPanel";
import { CreateEntityDialog } from "./components/CreateEntityDialog";
import { EntityPanel } from "./components/EntityPanel";
import { ProjectSidebar } from "./components/ProjectSidebar";
import { QuestionPanel } from "./components/QuestionPanel";
import { RestoreDraftDialog } from "./components/RestoreDraftDialog";
import { TopBar } from "./components/TopBar";
import { saveDraft } from "./drafts/draftStore";
import { EditorToolbar } from "./editor/EditorToolbar";
import { MarkdownEditor, type MarkdownEditorHandle } from "./editor/MarkdownEditor";
import { MockPdfPreview } from "./preview/MockPdfPreview";
import { extractReferences } from "./preview/mockRenderer";
import { useDocumentSession } from "./state/useDocumentSession";
import { useUiStore } from "./state/uiStore";
import { SettingsDialog } from "./settings/SettingsDialog";
import { AccountDialog } from "./account/AccountDialog";
import { SuggestionDetail } from "./suggestions/SuggestionDetail";
import { SuggestionInbox } from "./suggestions/SuggestionInbox";
import { PatchReview } from "./suggestions/PatchReview";

const PROJECT_ID = "proj-veil";

export default function App() {
  const queryClient = useQueryClient();
  const viewMode = useUiStore((s) => s.viewMode);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const contextOpen = useUiStore((s) => s.contextOpen);
  const currentDocumentId = useUiStore((s) => s.currentDocumentId);
  const selectedEntityId = useUiStore((s) => s.selectedEntityId);
  const selectedSuggestionId = useUiStore((s) => s.selectedSuggestionId);
  const reviewingSuggestionId = useUiStore((s) => s.reviewingSuggestionId);
  const setReviewingSuggestion = useUiStore((s) => s.setReviewingSuggestion);
  const selectEntity = useUiStore((s) => s.selectEntity);
  const interventionMode = useUiStore((s) => s.interventionMode);
  const settingsOpen = useUiStore((s) => s.settingsOpen);
  const accountOpen = useUiStore((s) => s.accountOpen);
  const editorFontSize = useUiStore((s) => s.editorFontSize);
  const autosaveDelayMs = useUiStore((s) => s.autosaveDelayMs);
  const theme = useUiStore((s) => s.theme);

  // 主题应用到 <html data-theme>，样式全部由 CSS 变量跟随
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const session = useDocumentSession(currentDocumentId, { autosaveDelayMs });
  const [editorHandle, setEditorHandle] = useState<MarkdownEditorHandle | null>(null);
  const bindEditor = useCallback(
    (h: MarkdownEditorHandle | null) => {
      setEditorHandle(h);
      session.bindEditor(h);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const documentsQuery = useQuery({
    queryKey: ["documents", PROJECT_ID],
    queryFn: () => api.listDocuments(PROJECT_ID)
  });
  const entitiesQuery = useQuery({
    queryKey: ["entities", PROJECT_ID],
    queryFn: () => api.listEntities(PROJECT_ID)
  });
  const suggestionsQuery = useQuery({
    queryKey: ["suggestions", PROJECT_ID],
    queryFn: () => api.listSuggestions(PROJECT_ID)
  });
  const questionsQuery = useQuery({
    queryKey: ["questions", PROJECT_ID],
    queryFn: () => api.listQuestions(PROJECT_ID)
  });

  const documents = useMemo(() => documentsQuery.data ?? [], [documentsQuery.data]);
  const entities = useMemo(() => entitiesQuery.data ?? [], [entitiesQuery.data]);
  const suggestions = useMemo(() => suggestionsQuery.data ?? [], [suggestionsQuery.data]);
  const questions = useMemo(() => questionsQuery.data ?? [], [questionsQuery.data]);

  // Agent 建议静默推送 → 只刷新数据与角标，不打断作者
  useEffect(() => {
    return mockApi.onSuggestionsChanged(() => {
      void queryClient.invalidateQueries({ queryKey: ["suggestions"] });
    });
  }, [queryClient]);

  // MOCK ONLY：Ambient Muse 演示——非 OFF 模式下 25 秒后静默到达一条建议。
  // OFF = 不进行任何后台分析，定时器根本不启动。
  useEffect(() => {
    if (interventionMode === "OFF") return;
    const t = setTimeout(() => mockApi.pushAmbientSuggestion(), 25_000);
    return () => clearTimeout(t);
  }, [interventionMode]);

  const entityNames = useMemo(() => new Set(entities.map((e) => e.name)), [entities]);
  const currentRevisions = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of documents) m.set(d.id, d.revision);
    for (const e of entities) m.set(e.id, e.revision);
    return m;
  }, [documents, entities]);

  const selectedEntity = entities.find((e) => e.id === selectedEntityId) ?? null;
  const selectedSuggestion = suggestions.find((s) => s.id === selectedSuggestionId) ?? null;
  const reviewingSuggestion = suggestions.find((s) => s.id === reviewingSuggestionId) ?? null;
  const pendingCount = suggestions.filter((s) => s.status === "pending").length;

  // 被引用于：在全部文档正文中搜索 [[实体名]]
  const referencedBy = useMemo(() => {
    if (!selectedEntity) return [];
    return documents
      .filter((d) => extractReferences(d.content).includes(selectedEntity.name))
      .map((d) => d.title);
  }, [selectedEntity, documents]);

  // 引用页：当前文档的引用清单 + 存在性
  const docReferences = useMemo(() => {
    const names = [...new Set(extractReferences(session.previewContent))];
    return names.map((name) => ({ name, known: entityNames.has(name) }));
  }, [session.previewContent, entityNames]);

  const [createEntityDraft, setCreateEntityDraft] = useState<{ name: string; type: EntityType | null } | null>(null);

  const createEntityMutation = useMutation({
    mutationFn: (req: { type: EntityType; name: string }) => api.createEntity(PROJECT_ID, req),
    onSuccess: (entity: Entity) => {
      void queryClient.invalidateQueries({ queryKey: ["entities"] });
      setCreateEntityDraft(null);
      selectEntity(entity.id);
    }
  });

  const createDocumentMutation = useMutation({
    mutationFn: () => api.createDocument(PROJECT_ID, `第${"一二三四五六七八九十"[documents.length] ?? ""}章 未命名`),
    onSuccess: (doc) => {
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
      useUiStore.getState().openDocument(doc.id);
    }
  });

  const suggestionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: SuggestionAction }) => api.respondToSuggestion(id, action),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: ["suggestions"] });
      void queryClient.invalidateQueries({ queryKey: ["entities"] });
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
      setReviewingSuggestion(null);
      if (updated.status === "accepted" && updated.patchSetId) {
        // 补丁可能改动了打开中的文档 → 重新载入（编辑器整棵重建，内容以服务端为准）
        session.reloadFromServer();
      }
    }
  });

  const questionMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "watching" | "paused" | "resolved" }) =>
      api.setQuestionStatus(id, status),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["questions"] })
  });
  const createQuestionMutation = useMutation({
    mutationFn: (text: string) => api.createQuestion(PROJECT_ID, text, currentDocumentId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["questions"] })
  });

  // 补丁应用护栏：目标文档保存中/失败/冲突时禁止应用
  const applyBlockedReason = useMemo(() => {
    if (!reviewingSuggestion?.patchSetId) return null;
    if (session.saveState.kind === "conflict") return "当前文档存在保存冲突，请先解决。";
    if (session.saveState.kind === "failed") return "当前文档保存失败，请先恢复。";
    if (session.saveState.kind === "saving") return "正在保存，请稍候。";
    return null;
  }, [reviewingSuggestion, session.saveState]);

  // 冲突处理：本地内容存入草稿 → 服务端版本重建编辑器
  const handleConflictReload = useCallback(() => {
    const content = editorHandle?.getContent();
    const doc = session.document;
    if (content != null && doc) {
      void saveDraft({
        documentId: doc.id,
        projectId: doc.projectId,
        content,
        baseRevision: session.saveState.kind === "saved" ? session.saveState.revision : 0,
        updatedAt: new Date().toISOString()
      }).catch(() => undefined);
    }
    session.forceReloadFromServer();
  }, [editorHandle, session]);

  const showEditor = viewMode !== "preview";
  const showPreview = viewMode !== "editor";

  return (
    <div className="flex h-full flex-col">
      <TopBar saveState={session.saveState} pendingCount={pendingCount} />

      <div className="flex min-h-0 flex-1">
        {sidebarOpen && (
          <ProjectSidebar
            documents={documents}
            entities={entities}
            onCreateEntity={(type) => setCreateEntityDraft({ name: "", type })}
            onCreateDocument={() => createDocumentMutation.mutate()}
          />
        )}

        <main className="flex min-w-0 flex-1">
          {showEditor && (
            <div
              className="flex min-w-0 flex-1 flex-col bg-paper"
              style={{ ["--editor-font-size" as string]: editorFontSize }}
            >
              <EditorToolbar
                editorHandle={editorHandle}
                onCreateEntityFromSelection={(name) => setCreateEntityDraft({ name, type: null })}
              />
              {session.saveState.kind === "conflict" && (
                <div
                  role="alert"
                  className="flex items-center gap-3 border-b border-oxblood/40 bg-oxblood/10 px-4 py-2 text-sm text-oxblood"
                >
                  <span>
                    保存冲突：服务端已是 r{session.saveState.actualRevision}，你的内容基于 r
                    {session.saveState.baseRevision}。不会自动覆盖任何一方。
                  </span>
                  <button
                    type="button"
                    onClick={handleConflictReload}
                    className="shrink-0 rounded border border-oxblood/50 px-2.5 py-1 text-xs hover:bg-oxblood/10"
                  >
                    本地内容存入草稿，载入服务端版本
                  </button>
                </div>
              )}
              {session.saveState.kind === "failed" && (
                <div
                  role="alert"
                  className="flex items-center gap-3 border-b border-brass/40 bg-brass/10 px-4 py-2 text-sm text-brass"
                >
                  <span>
                    {session.saveState.reason === "offline"
                      ? "当前离线。内容已保存在本地草稿，恢复网络后自动重试。"
                      : "保存失败。内容在本地草稿中安全。"}
                  </span>
                  <button
                    type="button"
                    onClick={() => session.flushSave()}
                    className="shrink-0 rounded border border-brass/60 px-2.5 py-1 text-xs hover:bg-brass/10"
                  >
                    立即重试
                  </button>
                </div>
              )}
              <div className="min-h-0 flex-1">
                {session.status === "ready" ? (
                  <MarkdownEditor
                    key={session.editorKey}
                    ref={bindEditor}
                    documentId={currentDocumentId}
                    initialContent={session.initialContent}
                    entityNames={entityNames}
                    onDocChanged={session.handleDocChanged}
                    onOpenEntityByName={(name) => {
                      const entity = entities.find((e) => e.name === name);
                      if (entity) selectEntity(entity.id);
                      else setCreateEntityDraft({ name, type: null });
                    }}
                  />
                ) : (
                  <p className="p-10 text-center text-sm text-ink-faint">正在展开羊皮纸…</p>
                )}
              </div>
            </div>
          )}

          {showPreview && (
            <div className="min-w-0 flex-1">
              <MockPdfPreview
                content={session.previewContent}
                title={documents.find((d) => d.id === currentDocumentId)?.title ?? ""}
              />
            </div>
          )}
        </main>

        {contextOpen && (
          <ContextPanel>
            {(tab) => {
              if (tab === "entity") return <EntityPanel entity={selectedEntity} referencedBy={referencedBy} />;
              if (tab === "suggestions") {
                return selectedSuggestion ? (
                  <SuggestionDetail
                    suggestion={selectedSuggestion}
                    currentRevisions={currentRevisions}
                    busy={suggestionMutation.isPending}
                    onAction={(action) => suggestionMutation.mutate({ id: selectedSuggestion.id, action })}
                    onOpenPatchReview={() => setReviewingSuggestion(selectedSuggestion.id)}
                    onBack={() => useUiStore.getState().closeSuggestion()}
                  />
                ) : (
                  <SuggestionInbox suggestions={suggestions} />
                );
              }
              if (tab === "questions") {
                return (
                  <QuestionPanel
                    questions={questions}
                    busy={questionMutation.isPending || createQuestionMutation.isPending}
                    onCreate={(text) => createQuestionMutation.mutate(text)}
                    onSetStatus={(id, status) => questionMutation.mutate({ id, status })}
                  />
                );
              }
              // references
              return (
                <div className="text-sm">
                  <p className="label-caps mb-2 text-[11px] text-ink-faint">当前文档中的引用</p>
                  {docReferences.length === 0 ? (
                    <p className="text-xs text-ink-faint">（正文中还没有 [[引用]]）</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {docReferences.map((r) => (
                        <li
                          key={r.name}
                          className="flex items-center gap-2 rounded border border-hairline bg-paper px-2 py-1.5"
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${r.known ? "bg-forest" : "bg-oxblood"}`} />
                          <span className="text-[13px]">{r.name}</span>
                          {!r.known && (
                            <button
                              type="button"
                              className="ml-auto text-xs text-oxblood hover:underline"
                              onClick={() => setCreateEntityDraft({ name: r.name, type: null })}
                            >
                              创建实体
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            }}
          </ContextPanel>
        )}
      </div>

      {session.recovery && <RestoreDraftDialog decision={session.recovery} onResolve={session.resolveRecovery} />}

      {settingsOpen && <SettingsDialog />}

      {accountOpen && <AccountDialog />}

      {createEntityDraft && (
        <CreateEntityDialog
          initialName={createEntityDraft.name}
          initialType={createEntityDraft.type}
          busy={createEntityMutation.isPending}
          onClose={() => setCreateEntityDraft(null)}
          onSubmit={(type, name) => createEntityMutation.mutate({ type, name })}
        />
      )}

      {reviewingSuggestion && (
        <PatchReview
          suggestion={reviewingSuggestion}
          documents={documents}
          applyBlockedReason={applyBlockedReason}
          busy={suggestionMutation.isPending}
          onClose={() => setReviewingSuggestion(null)}
          onApply={() => suggestionMutation.mutate({ id: reviewingSuggestion.id, action: "accept" })}
          onReject={() => suggestionMutation.mutate({ id: reviewingSuggestion.id, action: "reject" })}
        />
      )}
    </div>
  );
}
