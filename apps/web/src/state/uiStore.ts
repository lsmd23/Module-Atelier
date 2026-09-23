import { create } from "zustand";
import { persist } from "zustand/middleware";

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

/** 三套界面主题：手稿羊皮纸（默认亮色）/ 烛夜（暖暗）/ 雾灰（冷灰蓝亮色）。 */
export const themeIds = ["parchment", "candlelight", "mistgray"] as const;
export type ThemeId = (typeof themeIds)[number];

export const themeInfo: Record<ThemeId, { label: string; description: string; swatch: [string, string, string] }> = {
  parchment: {
    label: "手稿羊皮纸",
    description: "默认。暖纸色，适合白天长时间写作。",
    swatch: ["#f1e9d6", "#2b2118", "#7c2d2d"]
  },
  candlelight: {
    label: "烛夜",
    description: "暖暗色。烛光般的夜间模式，低刺激。",
    swatch: ["#231b12", "#eadfc6", "#d08068"]
  },
  mistgray: {
    label: "雾灰",
    description: "冷灰蓝亮色，低饱和，适合强光环境。",
    swatch: ["#e7e9ec", "#24292f", "#456178"]
  }
};

export const editorFontSizeOptions = [
  { id: "0.95rem", label: "紧凑" },
  { id: "1.05rem", label: "标准" },
  { id: "1.2rem", label: "宽松" }
] as const;

export const autosaveDelayOptions = [
  { ms: 1000, label: "1 秒（积极）" },
  { ms: 1500, label: "1.5 秒（默认）" },
  { ms: 3000, label: "3 秒（从容）" },
  { ms: 5000, label: "5 秒（慢速网络）" }
] as const;

interface UiState {
  // ── 会话态（不持久化）──
  /** null = 启动器（项目库）；打开项目后进入工作台 */
  currentProjectId: string | null;
  sidebarOpen: boolean;
  contextOpen: boolean;
  contextTab: ContextTab;
  currentDocumentId: string;
  selectedEntityId: string | null;
  selectedSuggestionId: string | null;
  reviewingSuggestionId: string | null;
  settingsOpen: boolean;
  accountOpen: boolean;
  // ── 偏好（persist 持久化）──
  viewMode: ViewMode;
  interventionMode: InterventionMode;
  editorFontSize: string;
  autosaveDelayMs: number;
  theme: ThemeId;

  setViewMode(mode: ViewMode): void;
  openProject(projectId: string): void;
  closeProject(): void;
  toggleSidebar(): void;
  toggleContext(): void;
  openContext(tab: ContextTab): void;
  openDocument(documentId: string): void;
  selectEntity(entityId: string | null): void;
  openSuggestion(suggestionId: string): void;
  closeSuggestion(): void;
  setReviewingSuggestion(id: string | null): void;
  setInterventionMode(mode: InterventionMode): void;
  setEditorFontSize(size: string): void;
  setAutosaveDelayMs(ms: number): void;
  setTheme(theme: ThemeId): void;
  setSettingsOpen(open: boolean): void;
  setAccountOpen(open: boolean): void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      // 会话态
      currentProjectId: null,
      sidebarOpen: true,
      contextOpen: true,
      contextTab: "suggestions",
      currentDocumentId: "doc-ch1",
      selectedEntityId: null,
      selectedSuggestionId: null,
      reviewingSuggestionId: null,
      settingsOpen: false,
      accountOpen: false,
      // 偏好
      viewMode: "split",
      interventionMode: "GUARDIAN",
      editorFontSize: "1.05rem",
      autosaveDelayMs: 1500,
      theme: "parchment",

      setViewMode: (viewMode) => set({ viewMode }),
      openProject: (currentProjectId) =>
        set({ currentProjectId, currentDocumentId: "", selectedEntityId: null, selectedSuggestionId: null }),
      closeProject: () => set({ currentProjectId: null, currentDocumentId: "" }),
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
      setInterventionMode: (interventionMode) => set({ interventionMode }),
      setEditorFontSize: (editorFontSize) => set({ editorFontSize }),
      setAutosaveDelayMs: (autosaveDelayMs) => set({ autosaveDelayMs }),
      setTheme: (theme) => set({ theme }),
      setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
      setAccountOpen: (accountOpen) => set({ accountOpen })
    }),
    {
      name: "module-atelier-ui-prefs",
      // 只有偏好落地；会话态（当前文档、面板开合、选中项）每次启动重来
      partialize: (s) => ({
        viewMode: s.viewMode,
        interventionMode: s.interventionMode,
        editorFontSize: s.editorFontSize,
        autosaveDelayMs: s.autosaveDelayMs,
        theme: s.theme
      })
    }
  )
);
