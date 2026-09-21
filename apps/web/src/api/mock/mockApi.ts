import type { AuthorQuestion, Document, Entity, PatchSet, Suggestion } from "@module-atelier/contracts";
import { contractVersion } from "@module-atelier/contracts";
import type {
  AccountUser,
  AtelierApi,
  AuthResult,
  CreateEntityRequest,
  MockScenarioControl,
  RegisterRequest,
  SaveDocumentRequest,
  SaveDocumentResult,
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
 * 模拟：网络延迟、revision 乐观并发、CONFLICT、离线、保存失败、
 * Ambient Muse 静默到达。仅服务前端原型；httpApi 对接真实后端。
 */

const latency = () => new Promise((r) => setTimeout(r, 180 + Math.random() * 220));
const now = () => new Date().toISOString();

class MockApi implements AtelierApi {
  private documents = structuredClone(mockDocuments);
  private entities = structuredClone(mockEntities);
  private suggestions = structuredClone(mockSuggestions);
  private patchSets = new Map<string, PatchSet>([[mockPatchSet.id, structuredClone(mockPatchSet)]]);
  private questions = structuredClone(mockQuestions);
  private suggestionListeners = new Set<() => void>();
  /** MOCK ONLY：演示用账户。验证码固定 246810。 */
  private accountUser: AccountUser | null = null;

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

  async getProject(_projectId: string) {
    await latency();
    return structuredClone(mockProject);
  }

  async getHealth() {
    await latency();
    return { status: "ok" as const, database: "up" as const, contractVersion };
  }

  /** MOCK ONLY：成员与权限契约未冻结（M0 单租户），以下为演示数据。 */
  async listMembers(_projectId: string) {
    await latency();
    return [
      { id: "u-author", name: "陆离", role: "author" as const, you: true, note: "本机作者 · 所有写入归于 DEFAULT_ACTOR_ID" },
      { id: "u-scribe", name: "见习誊写员", role: "collaborator" as const, you: false, note: "Agent 协作者席位（演示）" },
      { id: "u-reader", name: "雾中读者", role: "reader" as const, you: false, note: "只读席位（演示）" }
    ];
  }

  async listDocuments(_projectId: string) {
    await latency();
    return structuredClone(this.documents);
  }

  async getDocument(documentId: string) {
    await latency();
    const doc = this.documents.find((d) => d.id === documentId);
    if (!doc) throw new Error("NOT_FOUND");
    return structuredClone(doc);
  }

  async createDocument(_projectId: string, title: string): Promise<Document> {
    this.checkOffline();
    await latency();
    const doc: Document = {
      id: `doc-${Math.random().toString(36).slice(2, 8)}`,
      projectId: mockProject.id,
      title,
      content: `# ${title}\n\n`,
      revision: 1,
      createdAt: now(),
      updatedAt: now()
    };
    this.documents.push(doc);
    return structuredClone(doc);
  }

  async saveDocument(documentId: string, req: SaveDocumentRequest): Promise<SaveDocumentResult> {
    this.checkOffline();
    if (this.flags.simulateSaveFailure) throw new Error("SAVE_FAILED");
    await latency();
    const doc = this.documents.find((d) => d.id === documentId);
    if (!doc) throw new Error("NOT_FOUND");
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

  async listEntities(_projectId: string) {
    await latency();
    return structuredClone(this.entities);
  }

  async createEntity(_projectId: string, req: CreateEntityRequest): Promise<Entity> {
    this.checkOffline();
    await latency();
    const entity: Entity = {
      id: `ent-${Math.random().toString(36).slice(2, 8)}`,
      projectId: mockProject.id,
      type: req.type,
      name: req.name,
      aliases: [],
      description: req.description ?? "",
      structuredData: {},
      // 与冻结的 revision 语义一致：创建即 revision 1
      revision: 1,
      status: "draft"
    };
    this.entities.push(entity);
    return structuredClone(entity);
  }

  async listSuggestions(_projectId: string) {
    await latency();
    return structuredClone(this.suggestions);
  }

  async getPatchSet(patchSetId: string) {
    await latency();
    const ps = this.patchSets.get(patchSetId);
    return ps ? structuredClone(ps) : null;
  }

  async respondToSuggestion(suggestionId: string, action: SuggestionAction): Promise<Suggestion> {
    this.checkOffline();
    await latency();
    const sug = this.suggestions.find((s) => s.id === suggestionId);
    if (!sug) throw new Error("NOT_FOUND");
    if (sug.status === "stale" && action === "accept") throw new Error("SUGGESTION_STALE");

    if (action === "accept" && sug.patchSetId) {
      const ps = this.patchSets.get(sug.patchSetId);
      if (ps) {
        if (ps.status !== "pending") throw new Error("PATCHSET_NOT_PENDING");
        for (const op of ps.operations) {
          if (op.op === "create_entity") {
            this.entities.push(structuredClone(op.entity) as Entity);
          } else if (op.op === "update_document") {
            const doc = this.documents.find((d) => d.id === op.documentId);
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

  private currentRevisionOf(resourceId: string): number {
    return (
      this.documents.find((d) => d.id === resourceId)?.revision ??
      this.entities.find((e) => e.id === resourceId)?.revision ??
      0
    );
  }

  async listQuestions(_projectId: string) {
    await latency();
    return structuredClone(this.questions);
  }

  async createQuestion(_projectId: string, text: string, documentId: string): Promise<AuthorQuestion> {
    await latency();
    const q: AuthorQuestion = {
      id: `q-${Math.random().toString(36).slice(2, 8)}`,
      projectId: mockProject.id,
      documentId,
      text,
      helpMode: "any",
      status: "watching",
      sourceRevision: this.currentRevisionOf(documentId)
    };
    this.questions.push(q);
    return structuredClone(q);
  }

  async setQuestionStatus(questionId: string, status: AuthorQuestion["status"]): Promise<AuthorQuestion> {
    await latency();
    const q = this.questions.find((x) => x.id === questionId);
    if (!q) throw new Error("NOT_FOUND");
    q.status = status;
    return structuredClone(q);
  }

  /* ── MOCK ONLY：认证。契约未冻结前的演示实现 ─────────────────── */

  async login(email: string, password: string): Promise<AuthResult> {
    await latency();
    if (password.length < 8) throw new Error("INVALID_CREDENTIALS");
    const user: AccountUser = {
      id: "u-author",
      username: email.split("@")[0] ?? "author",
      email,
      displayName: "陆离",
      role: "author",
      emailVerified: true,
      status: "active",
      plan: "creator",
      createdAt: "2026-09-01T08:00:00Z",
      lastLoginAt: now()
    };
    this.accountUser = user;
    return { session: { user: structuredClone(user), sessionId: `sess-${Date.now()}` } };
  }

  async register(req: RegisterRequest): Promise<AuthResult> {
    await latency();
    this.accountUser = {
      id: `u-${Math.random().toString(36).slice(2, 8)}`,
      username: req.email.split("@")[0] ?? "author",
      email: req.email,
      displayName: req.displayName,
      role: "author",
      emailVerified: false,
      status: "active",
      plan: "free",
      createdAt: now(),
      lastLoginAt: now()
    };
    return { session: null, requiresVerification: true };
  }

  async sendVerificationCode(_email: string): Promise<void> {
    await latency();
    // MOCK：验证码固定 246810
  }

  async verifyEmail(email: string, code: string): Promise<AccountUser> {
    await latency();
    if (code !== "246810") throw new Error("INVALID_CODE");
    if (!this.accountUser || this.accountUser.email !== email) {
      this.accountUser = {
        id: `u-${Math.random().toString(36).slice(2, 8)}`,
        username: email.split("@")[0] ?? "author",
        email,
        displayName: email.split("@")[0] ?? "author",
        role: "author",
        emailVerified: true,
        status: "active",
        plan: "free",
        createdAt: now(),
        lastLoginAt: now()
      };
    }
    this.accountUser.emailVerified = true;
    this.accountUser.lastLoginAt = now();
    return structuredClone(this.accountUser);
  }

  async logout(): Promise<void> {
    await latency();
  }

  async updateProfile(_userId: string, patch: { displayName?: string }): Promise<AccountUser> {
    await latency();
    if (!this.accountUser) throw new Error("UNAUTHENTICATED");
    if (patch.displayName !== undefined) this.accountUser.displayName = patch.displayName;
    return structuredClone(this.accountUser);
  }

  async changePassword(_userId: string, current: string, next: string): Promise<void> {
    await latency();
    if (current.length < 8) throw new Error("INVALID_CREDENTIALS");
    if (next.length < 8) throw new Error("WEAK_PASSWORD");
  }

  /** MOCK ONLY：模拟 Ambient Muse 静默推送一条新建议（只更新角标，不打扰作者）。 */
  pushAmbientSuggestion() {
    const sug: Suggestion = {
      id: `sug-live-${Math.random().toString(36).slice(2, 8)}`,
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
    this.suggestions.push(sug);
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
