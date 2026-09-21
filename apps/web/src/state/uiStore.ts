import { create } from "zustand";

/** AI 干预模式。OFF = 不进行任何后台 AI 分析（不只是隐藏通知）。 */
export const interventionModes = ["OFF", "MECHANICS", "GUARDIAN", "MUSE", "COAUTHOR"] as const;
export type InterventionMode = (typeof interventionModes)[number];

export const interventionModeInfo: Record<InterventionMode, { label: string; description: string }> = {
  OFF: { label: "关闭", description: "不进行任何后台 AI 分析（不只是隐藏通知）。" },
  MECHANICS: { label: "机制校对", description: "仅检查引用完整性、数据与机械问题。" },
  GUARDIAN: { label: "正典守护", description: "机制检查之外，额外看守设定一致性。" },
  MUSE: { label: "灵感", description: "以上全部，偶尔提供安静的创意建议。" },
  COAUTHOR: { label: "协作", description: "深度参与，可生成草稿与补丁（仍需作者审阅）。" }
};

export type ViewMode = "editor" | "split" | "preview";
export type ContextTab = "entity" | "suggestions" | "questions" | "references";

interface UiState {
  viewMode: ViewMode;
  sidebarOpen: boolean;
  contextOpen: boolean;
  contextTab: ContextTab;
  currentDocumentId: string;
  selectedEntityId: string | null;
  selectedSuggestionId: string | null;
  reviewingSuggestionId: string | null;
  interventionMode: InterventionMode;

  setViewMode(mode: ViewMode): void;
  toggleSidebar(): void;
  toggleContext(): void;
  openContext(tab: ContextTab): void;
  openDocument(documentId: string): void;
  selectEntity(entityId: string | null): void;
  openSuggestion(suggestionId: string): void;
  closeSuggestion(): void;
  setReviewingSuggestion(id: string | null): void;
  setInterventionMode(mode: InterventionMode): void;
}

export const useUiStore = create<UiState>((set) => ({
  viewMode: "split",
  sidebarOpen: true,
  contextOpen: true,
  contextTab: "suggestions",
  currentDocumentId: "doc-ch1",
  selectedEntityId: null,
  selectedSuggestionId: null,
  reviewingSuggestionId: null,
  interventionMode: "GUARDIAN",

  setViewMode: (viewMode) => set({ viewMode }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleContext: () => set((s) => ({ contextOpen: !s.contextOpen })),
  openContext: (contextTab) => set({ contextOpen: true, contextTab }),
  openDocument: (currentDocumentId) => set({ currentDocumentId }),
  selectEntity: (selectedEntityId) =>
    set(selectedEntityId ? { selectedEntityId, contextOpen: true, contextTab: "entity" } : { selectedEntityId }),
  openSuggestion: (selectedSuggestionId) =>
    set({ selectedSuggestionId, contextOpen: true, contextTab: "suggestions" }),
  closeSuggestion: () => set({ selectedSuggestionId: null }),
  setReviewingSuggestion: (reviewingSuggestionId) => set({ reviewingSuggestionId }),
  setInterventionMode: (interventionMode) => set({ interventionMode })
}));
