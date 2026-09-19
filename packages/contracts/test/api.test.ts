import { describe, expect, it } from "vitest";
import {
  apiErrorSchema,
  apiLimits,
  boundedJsonObjectSchema,
  createRelationRequestSchema,
  documentContentSchema,
  documentResponseSchema,
  entityResponseSchema,
  envelope,
  jsonObjectSchema,
  paginated,
  projectSchema,
  relationListResponseSchema,
  updateDocumentRequestSchema,
  updateEntityRequestSchema,
  apiErrorStatus
} from "../src/index.ts";

const isoNow = new Date().toISOString();

describe("envelopes", () => {
  it("accepts a success envelope and rejects a bare payload", () => {
    const envelopeSchema = envelope(projectSchema);
    const listSchema = envelope(paginated(projectSchema));

    expect(
      envelopeSchema.safeParse({ data: { id: "p1", name: "Sunless Citadel", createdAt: isoNow, updatedAt: isoNow } }).success
    ).toBe(true);
    expect(envelopeSchema.safeParse({ id: "p1", name: "Sunless Citadel", createdAt: isoNow, updatedAt: isoNow }).success).toBe(false);
    expect(listSchema.safeParse({ data: { items: [], limit: 50, offset: 0, hasMore: false } }).success).toBe(true);
    expect(listSchema.safeParse({ data: { items: [] } }).success).toBe(false);
  });

  it("requires a structured error with code, message and requestId", () => {
    const result = apiErrorSchema.safeParse({
      error: {
        code: "CONFLICT",
        message: "expected revision 12",
        requestId: "req-1",
        details: {
          conflict: {
            code: "CONFLICT",
            resourceType: "document",
            resourceId: "doc-1",
            expectedRevision: 12,
            actualRevision: 13
          }
        }
      }
    });

    expect(result.success).toBe(true);
    expect(apiErrorSchema.safeParse({ error: { code: "NOPE", message: "x", requestId: "r" } }).success).toBe(false);
    expect(apiErrorSchema.safeParse({ error: { code: "CONFLICT", message: "x" } }).success).toBe(false);
  });

  it("maps every error code to a documented HTTP status", () => {
    expect(apiErrorStatus.CONFLICT).toBe(409);
    expect(apiErrorStatus.VALIDATION_ERROR).toBe(400);
    expect(apiErrorStatus.NOT_FOUND).toBe(404);
    expect(apiErrorStatus.DOMAIN_CONSTRAINT).toBe(422);
  });
});

describe("json object input", () => {
  it("accepts plain nested objects", () => {
    expect(jsonObjectSchema.safeParse({ ac: 15, saves: { dex: 2 } }).success).toBe(true);
  });

  it("rejects arrays", () => {
    expect(jsonObjectSchema.safeParse([1, 2, 3]).success).toBe(false);
  });

  it("rejects prototype keys anywhere in the tree", () => {
    // `__proto__` only becomes an own key through JSON parsing, not object literals.
    expect(jsonObjectSchema.safeParse(JSON.parse('{"nested": {"__proto__": {"polluted": true}}}')).success).toBe(false);
    expect(jsonObjectSchema.safeParse(JSON.parse('{"constructor": {}}')).success).toBe(false);
    expect(jsonObjectSchema.safeParse(JSON.parse('{"prototype": 1}')).success).toBe(false);
  });

  it("rejects values nested deeper than the limit", () => {
    // `levels` counts the object itself as the first level.
    const nested = (levels: number): Record<string, unknown> => {
      let node: Record<string, unknown> = { leaf: true };
      for (let index = 1; index < levels; index += 1) node = { child: node };
      return node;
    };

    expect(jsonObjectSchema.safeParse(nested(apiLimits.maxStructuredDataDepth)).success).toBe(true);
    expect(jsonObjectSchema.safeParse(nested(apiLimits.maxStructuredDataDepth + 1)).success).toBe(false);
  });

  it("enforces the byte budget of the caller", () => {
    const small = boundedJsonObjectSchema(32);
    expect(small.safeParse({ note: "矮人矿坑" }).success).toBe(true);
    expect(small.safeParse({ note: "矮人矿坑".repeat(20) }).success).toBe(false);
  });
});

describe("document input", () => {
  it("counts UTF-8 bytes, not characters", () => {
    const content = documentContentSchema;
    const limit = apiLimits.maxDocumentContentBytes;

    expect(content.safeParse("村".repeat(limit / 3)).success).toBe(true);
    expect(content.safeParse("村".repeat(limit)).success).toBe(false);
  });

  it("requires baseRevision and at least one mutable field", () => {
    expect(updateDocumentRequestSchema.safeParse({ baseRevision: 3, content: "new" }).success).toBe(true);
    expect(updateDocumentRequestSchema.safeParse({ baseRevision: 3 }).success).toBe(false);
    expect(updateDocumentRequestSchema.safeParse({ content: "new" }).success).toBe(false);
    expect(updateDocumentRequestSchema.safeParse({ baseRevision: 0, content: "new" }).success).toBe(false);
  });

  it("requires baseRevision on entity updates too", () => {
    expect(updateEntityRequestSchema.safeParse({ baseRevision: 2, status: "confirmed" }).success).toBe(true);
    expect(updateEntityRequestSchema.safeParse({ status: "confirmed" }).success).toBe(false);
  });
});

describe("response schemas match serialized payloads", () => {
  it("accepts a document payload", () => {
    const result = documentResponseSchema.safeParse({
      data: {
        id: "d1",
        projectId: "p1",
        title: "Chapter 1",
        content: "# 开场\n村长说自己从未进入森林。",
        revision: 4,
        createdAt: isoNow,
        updatedAt: isoNow
      }
    });

    expect(result.success).toBe(true);
  });

  it("accepts an entity payload without timestamps", () => {
    const result = entityResponseSchema.safeParse({
      data: {
        id: "e1",
        projectId: "p1",
        type: "npc",
        name: "村长",
        aliases: ["Mayor"],
        description: "",
        structuredData: {},
        revision: 1,
        status: "draft"
      }
    });

    expect(result.success).toBe(true);
  });

  it("accepts a relation list payload", () => {
    const result = relationListResponseSchema.safeParse({
      data: {
        items: [{ id: "r1", projectId: "p1", fromEntityId: "e1", toEntityId: "e2", type: "member_of" }],
        limit: 50,
        offset: 0,
        hasMore: false
      }
    });

    expect(result.success).toBe(true);
  });
});

describe("relation input", () => {
  it("requires UUID endpoints and a non-empty type", () => {
    const valid = {
      fromEntityId: "6f1c3b2e-6a2f-4c2e-9d5a-1b2c3d4e5f60",
      toEntityId: "0b2f4c6e-8a1d-4f3b-9c7e-2d4f6a8b0c1e",
      type: "member_of"
    };

    expect(createRelationRequestSchema.safeParse(valid).success).toBe(true);
    expect(createRelationRequestSchema.safeParse({ ...valid, fromEntityId: "not-a-uuid" }).success).toBe(false);
    expect(createRelationRequestSchema.safeParse({ ...valid, type: "  " }).success).toBe(false);
  });
});