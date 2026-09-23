import type {
  AccountSession,
  AccountUser,
  AuthSession,
  Conflict,
  Document,
  Entity,
  EntityType,
  PatchSet,
  Project,
  Suggestion
} from "@module-atelier/contracts";

/**
 * 前端数据访问层接口。
 *
 * 账户/会话/项目/文档/实体走 contracts 0.4.0 已冻结的形状（httpApi 已实现）；
 * suggestions/patchsets/questions/preview 尚无路由，只有 mock 实现。
 */

export interface SaveDocumentRequest {
  content: string;
  baseRevision: number;
}

export type SaveDocumentResult =
  | { ok: true; document: Document }
  | { ok: false; conflict: Conflict };

export interface CreateEntityRequest {
  type: EntityType;
  name: string;
  description?: string;
}

export type SuggestionAction = "accept" | "reject" | "later" | "regenerate";

/** 健康检查，形状对齐已冻结的 GET /api/health。 */
export interface HealthStatus {
  status: "ok" | "degraded";
  database: "up" | "down";
  contractVersion: string;
}

/**
 * 临时视图模型（MOCK ONLY）：contracts 尚无项目成员模型，
 * 此类型只为演示位服务，待 BE-002 phase 2 落地后替换。
 */
export interface ProjectMember {
  id: string;
  name: string;
  role: "author" | "collaborator" | "reader";
  you: boolean;
  note?: string;
}

/** 本地账户首次运行设置（契约 setupRequestSchema；email 在本地形态下省略）。 */
export interface SetupRequest {
  displayName: string;
  username: string;
  password: string;
}

export interface AtelierApi {
  /* ── 认证（契约 0.4.0 已冻结，本地账户，无邮箱验证）── */
  getSetupStatus(): Promise<{ needsSetup: boolean }>;
  setup(req: SetupRequest): Promise<AuthSession>;
  login(username: string, password: string): Promise<AuthSession>;
  logout(): Promise<void>;
  me(): Promise<AccountUser>;
  updateProfile(displayName: string): Promise<AccountUser>;
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
  listSessions(): Promise<AccountSession[]>;
  revokeSession(sessionId: string): Promise<void>;

  /* ── 项目库（路由已冻结）── */
  listProjects(): Promise<Project[]>;
  getProject(projectId: string): Promise<Project>;
  createProject(name: string): Promise<Project>;
  renameProject(projectId: string, name: string): Promise<Project>;
  getHealth(): Promise<HealthStatus>;

  /* ── 文档与实体（路由已冻结）── */
  listDocuments(projectId: string): Promise<Document[]>;
  getDocument(documentId: string): Promise<Document>;
  createDocument(projectId: string, title: string): Promise<Document>;
  saveDocument(documentId: string, req: SaveDocumentRequest): Promise<SaveDocumentResult>;
  listEntities(projectId: string): Promise<Entity[]>;
  createEntity(projectId: string, req: CreateEntityRequest): Promise<Entity>;

  /** MOCK ONLY：成员/权限路由不存在于 contracts（BE-002 phase 2 待落地）。 */
  listMembers(projectId: string): Promise<ProjectMember[]>;

  /* ── 以下在 contracts 中尚无路由（M3/M4），仅 mock 实现 ── */
  listSuggestions(projectId: string): Promise<Suggestion[]>;
  getPatchSet(patchSetId: string): Promise<PatchSet | null>;
  respondToSuggestion(suggestionId: string, action: SuggestionAction): Promise<Suggestion>;
  listQuestions(projectId: string): Promise<import("@module-atelier/contracts").AuthorQuestion[]>;
  createQuestion(
    projectId: string,
    text: string,
    documentId: string
  ): Promise<import("@module-atelier/contracts").AuthorQuestion>;
  setQuestionStatus(
    questionId: string,
    status: import("@module-atelier/contracts").AuthorQuestion["status"]
  ): Promise<import("@module-atelier/contracts").AuthorQuestion>;
}

/** MOCK ONLY：开发场景开关，用于演示各保存状态与建议到达。 */
export interface MockScenarioControl {
  simulateOffline: boolean;
  simulateSaveFailure: boolean;
  simulateConflict: boolean;
  setFlag(
    flag: keyof Omit<MockScenarioControl, "setFlag" | "pushAmbientSuggestion">,
    value: boolean
  ): void;
  pushAmbientSuggestion(): void;
}
