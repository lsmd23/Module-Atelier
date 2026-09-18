import { z } from "zod";

export const entityTypes = ["npc", "location", "faction", "monster", "encounter", "item", "clue"] as const;
export type EntityType = (typeof entityTypes)[number];

export const suggestionKinds = ["mechanical", "canon", "question", "idea", "draft"] as const;
export type SuggestionKind = (typeof suggestionKinds)[number];
export const suggestionStatuses = ["pending", "accepted", "rejected", "later", "stale", "failed"] as const;
export type SuggestionStatus = (typeof suggestionStatuses)[number];

export const projectSchema = z.object({
  id: z.string(), name: z.string().min(1), createdAt: z.string().datetime(), updatedAt: z.string().datetime()
});
export type Project = z.infer<typeof projectSchema>;

export const documentSchema = z.object({
  id: z.string(), projectId: z.string(), title: z.string(), content: z.string(), revision: z.number().int().nonnegative(),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime()
});
export type Document = z.infer<typeof documentSchema>;

export const entitySchema = z.object({
  id: z.string(), projectId: z.string(), type: z.enum(entityTypes), name: z.string().min(1), aliases: z.array(z.string()),
  description: z.string(), structuredData: z.record(z.unknown()), revision: z.number().int().nonnegative(),
  status: z.enum(["confirmed", "draft", "rumor", "belief", "conditional", "ambiguous"])
});
export type Entity = z.infer<typeof entitySchema>;

export const relationSchema = z.object({
  id: z.string(), projectId: z.string(), fromEntityId: z.string(), toEntityId: z.string(), type: z.string(), metadata: z.record(z.unknown()).optional()
});
export type Relation = z.infer<typeof relationSchema>;

export const revisionSchema = z.object({ id: z.string(), resourceType: z.enum(["document", "entity"]), resourceId: z.string(), revision: z.number().int().nonnegative(), baseRevision: z.number().int().nonnegative(), authorId: z.string(), createdAt: z.string().datetime() });
export type Revision = z.infer<typeof revisionSchema>;

export const patchOperationSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("update_document"), documentId: z.string(), baseRevision: z.number().int().nonnegative(), content: z.string(), title: z.string().optional() }),
  z.object({ op: z.literal("create_entity"), entity: entitySchema.omit({ revision: true }) }),
  z.object({ op: z.literal("update_entity"), entityId: z.string(), baseRevision: z.number().int().nonnegative(), changes: z.record(z.unknown()) }),
  z.object({ op: z.literal("create_relation"), relation: relationSchema.omit({ id: true }) }),
  z.object({ op: z.literal("delete_relation"), relationId: z.string() })
]);
export type PatchOperation = z.infer<typeof patchOperationSchema>;

export const patchSetSchema = z.object({ id: z.string(), projectId: z.string(), baseRevisions: z.record(z.number().int().nonnegative()), operations: z.array(patchOperationSchema).min(1), dependencies: z.array(z.string()), source: z.enum(["author", "agent"]), status: z.enum(["pending", "applied", "rejected", "stale", "conflict"]) });
export type PatchSet = z.infer<typeof patchSetSchema>;

export const suggestionSchema = z.object({ id: z.string(), projectId: z.string(), kind: z.enum(suggestionKinds), triggerReason: z.string(), sourceReferences: z.array(z.string()), relevantRevisionMap: z.record(z.number().int().nonnegative()), title: z.string(), observation: z.string(), question: z.string().optional(), options: z.array(z.string()).optional(), patchSetId: z.string().optional(), status: z.enum(suggestionStatuses), createdAt: z.string().datetime() });
export type Suggestion = z.infer<typeof suggestionSchema>;

export const authorQuestionSchema = z.object({ id: z.string(), projectId: z.string(), documentId: z.string(), text: z.string().min(1), helpMode: z.enum(["canon", "muse", "mechanic", "any"]), status: z.enum(["watching", "paused", "resolved"]), sourceRevision: z.number().int().nonnegative() });
export type AuthorQuestion = z.infer<typeof authorQuestionSchema>;

export const conflictSchema = z.object({ code: z.literal("CONFLICT"), resourceType: z.enum(["document", "entity"]), resourceId: z.string(), expectedRevision: z.number(), actualRevision: z.number() });
export type Conflict = z.infer<typeof conflictSchema>;

export const contractVersion = "0.1.0" as const;
