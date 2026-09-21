import {
  apiRoutes,
  documentListResponseSchema,
  documentResponseSchema,
  entityListResponseSchema,
  entityResponseSchema,
  healthResponseSchema,
  projectResponseSchema,
  type Conflict
} from "@module-atelier/contracts";
import type {
  AtelierApi,
  CreateEntityRequest,
  SaveDocumentRequest,
  SaveDocumentResult
} from "./types";

/**
 * 真实 HTTP 实现（对接 BE-001 冻结的 M0 路由）。
 *
 * 覆盖：projects / documents / entities。
 * 未覆盖（contracts 0.2.0 尚无路由，M3/M4 才会冻结）：suggestions / patchsets /
 * questions / preview —— 调用会抛 ROUTE_NOT_IN_CONTRACT，不要假装它们存在。
 *
 * 启用方式：VITE_API_MODE=http（默认 mock）。尚未对运行中的后端联调过。
 */

const BASE = import.meta.env.VITE_API_BASE ?? "";

class ApiRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly conflict?: Conflict
  ) {
    super(message);
  }
}

async function request<T>(
  method: string,
  path: string,
  body: unknown,
  parse: (data: unknown) => T
): Promise<T> {
  let res: Response;
  try {
    const init: RequestInit =
      body === undefined
        ? { method }
        : { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
    res = await fetch(`${BASE}${path}`, init);
  } catch {
    throw new Error("OFFLINE");
  }
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (json as { error?: { code?: string; message?: string; details?: { conflict?: Conflict } } })?.error;
    throw new ApiRequestError(
      err?.code ?? "INTERNAL_ERROR",
      err?.message ?? `HTTP ${res.status}`,
      err?.details?.conflict
    );
  }
  return parse((json as { data: unknown })?.data);
}

const route = (template: string, params: Record<string, string>) =>
  Object.entries(params).reduce((p, [k, v]) => p.replace(`:${k}`, encodeURIComponent(v)), template);

export const httpApi: AtelierApi = {
  getProject(projectId) {
    return request("GET", route(apiRoutes.project, { projectId }), undefined, (d) =>
      projectResponseSchema.parse({ data: d }).data
    );
  },

  getHealth() {
    return request("GET", apiRoutes.health, undefined, (d) => healthResponseSchema.parse({ data: d }).data);
  },

  listMembers(): Promise<never> {
    // contracts 0.2.0 无成员/权限路由（M0 单租户）
    return Promise.reject(new Error("ROUTE_NOT_IN_CONTRACT"));
  },

  /* auth：contracts 0.2.0 无认证路由（M0 无 auth），全部抛 ROUTE_NOT_IN_CONTRACT */
  login(): Promise<never> {
    return Promise.reject(new Error("ROUTE_NOT_IN_CONTRACT"));
  },
  register(): Promise<never> {
    return Promise.reject(new Error("ROUTE_NOT_IN_CONTRACT"));
  },
  sendVerificationCode(): Promise<never> {
    return Promise.reject(new Error("ROUTE_NOT_IN_CONTRACT"));
  },
  verifyEmail(): Promise<never> {
    return Promise.reject(new Error("ROUTE_NOT_IN_CONTRACT"));
  },
  logout(): Promise<never> {
    return Promise.reject(new Error("ROUTE_NOT_IN_CONTRACT"));
  },
  updateProfile(): Promise<never> {
    return Promise.reject(new Error("ROUTE_NOT_IN_CONTRACT"));
  },
  changePassword(): Promise<never> {
    return Promise.reject(new Error("ROUTE_NOT_IN_CONTRACT"));
  },

  async listDocuments(projectId) {
    const page = await request("GET", route(apiRoutes.projectDocuments, { projectId }), undefined, (d) =>
      documentListResponseSchema.parse({ data: d }).data
    );
    return page.items;
  },

  getDocument(documentId) {
    return request("GET", route(apiRoutes.document, { documentId }), undefined, (d) =>
      documentResponseSchema.parse({ data: d }).data
    );
  },

  createDocument(projectId, title: string) {
    return request("POST", route(apiRoutes.projectDocuments, { projectId }), { title }, (d) =>
      documentResponseSchema.parse({ data: d }).data
    );
  },

  async saveDocument(documentId, req: SaveDocumentRequest): Promise<SaveDocumentResult> {
    try {
      const document = await request("PATCH", route(apiRoutes.document, { documentId }), req, (d) =>
        documentResponseSchema.parse({ data: d }).data
      );
      return { ok: true, document };
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === "CONFLICT" && err.conflict) {
        return { ok: false, conflict: err.conflict };
      }
      throw err;
    }
  },

  async listEntities(projectId) {
    const page = await request("GET", route(apiRoutes.projectEntities, { projectId }), undefined, (d) =>
      entityListResponseSchema.parse({ data: d }).data
    );
    return page.items;
  },

  createEntity(projectId, req: CreateEntityRequest) {
    return request("POST", route(apiRoutes.projectEntities, { projectId }), req, (d) =>
      entityResponseSchema.parse({ data: d }).data
    );
  },

  listSuggestions(): Promise<never> {
    return Promise.reject(new Error("ROUTE_NOT_IN_CONTRACT"));
  },
  getPatchSet(): Promise<never> {
    return Promise.reject(new Error("ROUTE_NOT_IN_CONTRACT"));
  },
  respondToSuggestion(): Promise<never> {
    return Promise.reject(new Error("ROUTE_NOT_IN_CONTRACT"));
  },
  listQuestions(): Promise<never> {
    return Promise.reject(new Error("ROUTE_NOT_IN_CONTRACT"));
  },
  createQuestion(): Promise<never> {
    return Promise.reject(new Error("ROUTE_NOT_IN_CONTRACT"));
  },
  setQuestionStatus(): Promise<never> {
    return Promise.reject(new Error("ROUTE_NOT_IN_CONTRACT"));
  }
};
