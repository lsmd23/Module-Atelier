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

export interface AtelierApi {
  getProject(projectId: string): Promise<Project>;
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
