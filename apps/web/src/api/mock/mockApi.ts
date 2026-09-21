import type { AuthorQuestion, Document, Entity, PatchSet, Suggestion } from "@module-atelier/contracts";
import type {
  AtelierApi,
  CreateEntityRequest,
  MockScenarioControl,
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
