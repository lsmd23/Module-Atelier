import type {
  AuthorQuestion,
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
 * 注意：docs/CONTRACTS.md 已冻结 M0 路由（projects/documents/entities），
 * suggestions/patchsets/questions/preview 尚无路由。此接口表达前端需要的
 * 能力面；mockApi 全量实现，httpApi 只实现已冻结部分（其余抛
 * ROUTE_NOT_IN_CONTRACT）。组件只依赖本接口。
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
 * 临时视图模型（MOCK ONLY）：contracts 0.2.0 没有 User/Member 模型，
 * M0 为单租户（写入归于 DEFAULT_ACTOR_ID）。此类型只为设置中心演示，
 * 正式模型待契约冻结后替换。见本轮 handoff 的 Contract Request。
 */
export interface ProjectMember {
  id: string;
  name: string;
  role: "author" | "collaborator" | "reader";
  you: boolean;
  note?: string;
}

/**
 * 临时用户视图模型（MOCK ONLY）。字段按商用账户系统的常见面设计，
 * 契约冻结后以 packages/contracts 为准。
 */
export interface AccountUser {
  id: string;
  /** 登录用唯一名 */
  username: string;
  email: string;
  displayName: string;
  role: "author" | "collaborator" | "reader";
  emailVerified: boolean;
  status: "active" | "suspended";
  plan: "free" | "creator" | "studio";
  createdAt: string;
  lastLoginAt: string;
}

export interface AuthSession {
  user: AccountUser;
  /** MOCK：会话标识；真实实现应为 httpOnly cookie 或短时 token */
  sessionId: string;
}

export interface RegisterRequest {
  displayName: string;
  email: string;
  password: string;
}

export interface AuthResult {
  session: AuthSession | null;
  /** 注册后需邮箱验证 */
  requiresVerification?: boolean;
}

export interface AtelierApi {
  getProject(projectId: string): Promise<Project>;
  getHealth(): Promise<HealthStatus>;
  /** MOCK ONLY：成员/权限路由不存在于 contracts 0.2.0。 */
  listMembers(projectId: string): Promise<ProjectMember[]>;

  /** MOCK ONLY：认证路由不存在于 contracts 0.2.0（M0 无 auth）。 */
  login(email: string, password: string): Promise<AuthResult>;
  register(req: RegisterRequest): Promise<AuthResult>;
  sendVerificationCode(email: string): Promise<void>;
  verifyEmail(email: string, code: string): Promise<AccountUser>;
  logout(): Promise<void>;
  updateProfile(userId: string, patch: { displayName?: string }): Promise<AccountUser>;
  changePassword(userId: string, current: string, next: string): Promise<void>;

  listDocuments(projectId: string): Promise<Document[]>;
  getDocument(documentId: string): Promise<Document>;
  createDocument(projectId: string, title: string): Promise<Document>;
  saveDocument(documentId: string, req: SaveDocumentRequest): Promise<SaveDocumentResult>;

  listEntities(projectId: string): Promise<Entity[]>;
  createEntity(projectId: string, req: CreateEntityRequest): Promise<Entity>;

  listSuggestions(projectId: string): Promise<Suggestion[]>;
  getPatchSet(patchSetId: string): Promise<PatchSet | null>;
  respondToSuggestion(suggestionId: string, action: SuggestionAction): Promise<Suggestion>;

  listQuestions(projectId: string): Promise<AuthorQuestion[]>;
  createQuestion(projectId: string, text: string, documentId: string): Promise<AuthorQuestion>;
  setQuestionStatus(
    questionId: string,
    status: AuthorQuestion["status"]
  ): Promise<AuthorQuestion>;
}

/** MOCK ONLY：开发场景开关，用于演示各保存状态与建议到达。 */
export interface MockScenarioControl {
  simulateOffline: boolean;
  simulateSaveFailure: boolean;
  simulateConflict: boolean;
  setFlag(flag: keyof Omit<MockScenarioControl, "setFlag" | "pushAmbientSuggestion">, value: boolean): void;
  pushAmbientSuggestion(): void;
}
