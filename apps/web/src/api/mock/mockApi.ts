import type {
  AccountSession,
  AccountUser,
  AuthSession,
  AuthorQuestion,
  Document,
  Entity,
  PatchSet,
  Project,
  Suggestion
} from "@module-atelier/contracts";
import { contractVersion } from "@module-atelier/contracts";
import type {
  AtelierApi,
  CreateEntityRequest,
  MockScenarioControl,
  SaveDocumentRequest,
  SaveDocumentResult,
  SetupRequest,
  SuggestionAction
} from "../types";
import {
  mockDocuments,
  mockEntities,
  mockPatchSet,
  mockProject,
  mockQuestions,
  mockSuggestions
} from "./data";

/*
 * MOCK ONLY —— 内存版 AtelierApi。
 * 模拟：本地账户（首次运行设置管理者、用户名登录、无邮箱验证）、
 * 项目作用域数据、网络延迟、revision 乐观并发、CONFLICT、离线、保存失败、
 * Ambient Muse 静默到达。仅服务前端原型；httpApi 对接真实后端。
 */

const latency = () => new Promise((r) => setTimeout(r, 180 + Math.random() * 220));
const now = () => new Date().toISOString();
const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

class MockApi implements AtelierApi {
  /* 项目作用域数据 */
  private projects: Project[] = [structuredClone(mockProject)];
  private documents = new Map<string, Document[]>([[mockProject.id, structuredClone(mockDocuments)]]);
  private entities = new Map<string, Entity[]>([[mockProject.id, structuredClone(mockEntities)]]);
  private suggestions = new Map<string, Suggestion[]>([[mockProject.id, structuredClone(mockSuggestions)]]);
  private questions = new Map<string, AuthorQuestion[]>([[mockProject.id, structuredClone(mockQuestions)]]);
  private patchSets = new Map<string, PatchSet>([[mockPatchSet.id, structuredClone(mockPatchSet)]]);

  /* 本地账户 */
  private owner: (AccountUser & { password: string }) | null = null;
  private sessions: AccountSession[] = [];
  private suggestionListeners = new Set<() => void>();

  flags = {
    simulateOffline: false,
    simulateSaveFailure: false,
    simulateConflict: false
  };

  onSuggestionsChanged(listener: () => void): () => void {
    this.suggestionListeners.add(listener);
    return () => this.suggestionListeners.delete(listener);
  }

  private emitSuggestions() {
    for (const l of this.suggestionListeners) l();
  }

  private checkOffline() {
    if (this.flags.simulateOffline) throw new Error("OFFLINE");
  }

  private docsOf(projectId: string): Document[] {
    let list = this.documents.get(projectId);
    if (!list) {
      list = [];
      this.documents.set(projectId, list);
    }
    return list;
  }

  /* ── 认证（契约 0.4.0 形状）── */

  async getSetupStatus() {
    await latency();
    return { needsSetup: this.owner === null };
  }

  async setup(req: SetupRequest): Promise<AuthSession> {
    await latency();
    if (this.owner) throw new Error("REGISTRATION_DISABLED");
    const user: AccountUser = {
      id: uid("u"),
      username: req.username,
      email: null,
      displayName: req.displayName,
      role: "author",
      emailVerified: false,
      status: "active",
      plan: "creator",
      createdAt: now(),
      lastLoginAt: now()
    };
    this.owner = { ...user, password: req.password };
    const session = this.newSession(user);
    return { user, sessionId: session.id };
  }

  private newSession(user: AccountUser): AccountSession {
    const s: AccountSession = {
      id: uid("sess"),
      createdAt: now(),
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      ipAddress: null,
      userAgent: "本机（演示）",
      current: true
    };
    for (const x of this.sessions) x.current = false;
    this.sessions.push(s);
    return s;
  }

  async login(username: string, password: string): Promise<AuthSession> {
    await latency();
    if (!this.owner || this.owner.username !== username || this.owner.password !== password) {
      throw new Error("INVALID_CREDENTIALS");
    }
    this.owner.lastLoginAt = now();
    const session = this.newSession(this.owner);
    const { password: _pw, ...user } = this.owner;
    void _pw;
    return { user: structuredClone(user), sessionId: session.id };
  }

  async logout(): Promise<void> {
    await latency();
    for (const s of this.sessions) s.current = false;
  }

  async me(): Promise<AccountUser> {
    await latency();
    if (!this.owner) throw new Error("UNAUTHENTICATED");
    const { password: _pw, ...user } = this.owner;
    void _pw;
    return structuredClone(user);
  }

  async updateProfile(displayName: string): Promise<AccountUser> {
    await latency();
    if (!this.owner) throw new Error("UNAUTHENTICATED");
    this.owner.displayName = displayName;
    return this.me();
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await latency();
    if (!this.owner) throw new Error("UNAUTHENTICATED");
    if (this.owner.password !== currentPassword) throw new Error("INVALID_CREDENTIALS");
    if (newPassword.length < 8) throw new Error("WEAK_PASSWORD");
    this.owner.password = newPassword;
  }

  async listSessions(): Promise<AccountSession[]> {
    await latency();
    return structuredClone(this.sessions);
  }

  async revokeSession(sessionId: string): Promise<void> {
    await latency();
    this.sessions = this.sessions.filter((s) => s.id !== sessionId);
  }

  /* ── 项目库 ── */

  async listProjects() {
    await latency();
    return structuredClone(this.projects);
  }

  async getProject(projectId: string) {
    await latency();
    const p = this.projects.find((x) => x.id === projectId);
    if (!p) throw new Error("NOT_FOUND");
    return structuredClone(p);
  }

  async createProject(name: string): Promise<Project> {
    this.checkOffline();
    await latency();
    const p: Project = { id: uid("proj"), name, createdAt: now(), updatedAt: now() };
    this.projects.push(p);
    return structuredClone(p);
  }

  async renameProject(projectId: string, name: string): Promise<Project> {
    this.checkOffline();
    await latency();
    const p = this.projects.find((x) => x.id === projectId);
    if (!p) throw new Error("NOT_FOUND");
    p.name = name;
    p.updatedAt = now();
    return structuredClone(p);
  }

  async getHealth() {
    await latency();
    return { status: "ok" as const, database: "up" as const, contractVersion };
  }

  /** MOCK ONLY：成员与权限契约未冻结（BE-002 phase 2），以下为演示数据。 */
  async listMembers(_projectId: string) {
    await latency();
    const meName = this.owner?.displayName ?? "本机作者";
    return [
      { id: "u-author", name: meName, role: "author" as const, you: true, note: "项目创建者 · 本机" },
      { id: "u-scribe", name: "见习誊写员", role: "collaborator" as const, you: false, note: "协作者席位（演示）" },
      { id: "u-reader", name: "雾中读者", role: "reader" as const, you: false, note: "只读席位（演示）" }
    ];
  }

  /* ── 文档 ── */

  async listDocuments(projectId: string) {
    await latency();
    return structuredClone(this.docsOf(projectId));
  }

  async getDocument(documentId: string) {
    await latency();
    for (const list of this.documents.values()) {
      const doc = list.find((d) => d.id === documentId);
      if (doc) return structuredClone(doc);
    }
    throw new Error("NOT_FOUND");
  }

  async createDocument(projectId: string, title: string): Promise<Document> {
    this.checkOffline();
    await latency();
    const doc: Document = {
      id: uid("doc"),
      projectId,
      title,
      content: `# ${title}\n\n`,
      revision: 1,
      createdAt: now(),
      updatedAt: now()
    };
    this.docsOf(projectId).push(doc);
    return structuredClone(doc);
  }

  async saveDocument(documentId: string, req: SaveDocumentRequest): Promise<SaveDocumentResult> {
    this.checkOffline();
    if (this.flags.simulateSaveFailure) throw new Error("SAVE_FAILED");
    await latency();
    for (const list of this.documents.values()) {
      const doc = list.find((d) => d.id === documentId);
      if (!doc) continue;
      if (this.flags.simulateConflict || req.baseRevision !== doc.revision) {
        return {
          ok: false,
          conflict: {
            code: "CONFLICT",
            resourceType: "document",
            resourceId: documentId,
            expectedRevision: req.baseRevision,
            actualRevision: doc.revision
          }
        };
      }
      doc.content = req.content;
      doc.revision += 1;
      doc.updatedAt = now();
      return { ok: true, document: structuredClone(doc) };
    }
    throw new Error("NOT_FOUND");
  }

  /* ── 实体 ── */

  async listEntities(projectId: string) {
    await latency();
    return structuredClone(this.entities.get(projectId) ?? []);
  }

  async createEntity(projectId: string, req: CreateEntityRequest): Promise<Entity> {
    this.checkOffline();
    await latency();
    const entity: Entity = {
      id: uid("ent"),
      projectId,
      type: req.type,
      name: req.name,
      aliases: [],
      description: req.description ?? "",
      structuredData: {},
      revision: 1,
      status: "draft"
    };
    const list = this.entities.get(projectId) ?? [];
    list.push(entity);
    this.entities.set(projectId, list);
    return structuredClone(entity);
  }

  /* ── 建议（无路由，mock 演示）── */

  async listSuggestions(projectId: string) {
    await latency();
    return structuredClone(this.suggestions.get(projectId) ?? []);
  }

  async getPatchSet(patchSetId: string) {
    await latency();
    const ps = this.patchSets.get(patchSetId);
    return ps ? structuredClone(ps) : null;
  }

  async respondToSuggestion(suggestionId: string, action: SuggestionAction): Promise<Suggestion> {
    this.checkOffline();
    await latency();
    for (const list of this.suggestions.values()) {
      const sug = list.find((s) => s.id === suggestionId);
      if (!sug) continue;
      if (sug.status === "stale" && action === "accept") throw new Error("SUGGESTION_STALE");

      if (action === "accept" && sug.patchSetId) {
        const ps = this.patchSets.get(sug.patchSetId);
        if (ps) {
          if (ps.status !== "pending") throw new Error("PATCHSET_NOT_PENDING");
          for (const op of ps.operations) {
            if (op.op === "create_entity") {
              const list2 = this.entities.get(ps.projectId) ?? [];
              list2.push(structuredClone(op.entity) as Entity);
              this.entities.set(ps.projectId, list2);
            } else if (op.op === "update_document") {
              const doc = this.docsOf(ps.projectId).find((d) => d.id === op.documentId);
              if (!doc) throw new Error("NOT_FOUND");
              if (doc.revision !== op.baseRevision) throw new Error("CONFLICT");
              doc.content = op.content;
              doc.revision += 1;
              doc.updatedAt = now();
            }
          }
          ps.status = "applied";
        }
      }

      sug.status =
        action === "accept" ? "accepted" : action === "reject" ? "rejected" : action === "later" ? "later" : "pending";
      if (action === "regenerate") {
        sug.relevantRevisionMap = Object.fromEntries(
          Object.entries(sug.relevantRevisionMap).map(([k]) => [k, this.currentRevisionOf(k)])
        );
        sug.status = "pending";
      }
      this.emitSuggestions();
      return structuredClone(sug);
    }
    throw new Error("NOT_FOUND");
  }

  private currentRevisionOf(resourceId: string): number {
    for (const list of this.documents.values()) {
      const d = list.find((x) => x.id === resourceId);
      if (d) return d.revision;
    }
    for (const list of this.entities.values()) {
      const e = list.find((x) => x.id === resourceId);
      if (e) return e.revision;
    }
    return 0;
  }

  /* ── 作者提问（无路由，mock 演示）── */

  async listQuestions(projectId: string) {
    await latency();
    return structuredClone(this.questions.get(projectId) ?? []);
  }

  async createQuestion(projectId: string, text: string, documentId: string): Promise<AuthorQuestion> {
    await latency();
    const q: AuthorQuestion = {
      id: uid("q"),
      projectId,
      documentId,
      text,
      helpMode: "any",
      status: "watching",
      sourceRevision: this.currentRevisionOf(documentId)
    };
    const list = this.questions.get(projectId) ?? [];
    list.push(q);
    this.questions.set(projectId, list);
    return structuredClone(q);
  }

  async setQuestionStatus(questionId: string, status: AuthorQuestion["status"]): Promise<AuthorQuestion> {
    await latency();
    for (const list of this.questions.values()) {
      const q = list.find((x) => x.id === questionId);
      if (q) {
        q.status = status;
        return structuredClone(q);
      }
    }
    throw new Error("NOT_FOUND");
  }

  /** MOCK ONLY：模拟 Ambient Muse 静默推送一条新建议（只更新角标，不打扰作者）。 */
  pushAmbientSuggestion() {
    const list = this.suggestions.get(mockProject.id);
    if (!list) return;
    const sug: Suggestion = {
      id: uid("sug-live"),
      projectId: mockProject.id,
      kind: "idea",
      triggerReason: "Ambient Muse：后台阅读最新章节",
      sourceReferences: ["doc-ch1"],
      relevantRevisionMap: { "doc-ch1": this.currentRevisionOf("doc-ch1") },
      title: "绞架与「没用过的绞索」值得一个细节",
      observation:
        "镇口的绞架出现过两次却从未被使用。一个容易被注意到的细节：绞索是新的、定期更换的——说明有人在维护它。维护者是谁，可能本身就是一条线索。",
      status: "pending",
      createdAt: now()
    };
    list.push(sug);
    this.emitSuggestions();
  }
}

export const mockApi = new MockApi();

export const mockScenarioControl: MockScenarioControl = {
  get simulateOffline() {
    return mockApi.flags.simulateOffline;
  },
  get simulateSaveFailure() {
    return mockApi.flags.simulateSaveFailure;
  },
  get simulateConflict() {
    return mockApi.flags.simulateConflict;
  },
  setFlag(flag, value) {
    mockApi.flags[flag] = value;
  },
  pushAmbientSuggestion() {
    mockApi.pushAmbientSuggestion();
  }
};
