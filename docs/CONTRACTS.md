# Contracts

Current contract version: **0.2.0**. Source of truth: `packages/contracts/src` —
`domain.ts` holds the cross-module model, `api.ts` holds the route-level shapes,
`index.ts` re-exports both. Version 0.2.0 is additive: no v0.1.0 type changed.

PatchSet operations are `update_document`, `create_entity`, `update_entity`, `create_relation`, and `delete_relation`. Applying a PatchSet must validate every base revision atomically. A mismatch yields `stale`/`conflict`; silent overwrite is forbidden.

Any change to shared types requires updating this file and `docs/INTEGRATION.md`.

## API (frozen for M0 by BE-001)

Base path `/api`. Collections are project-scoped; item routes use global UUIDs.

| Method | Path | Body / query | Success |
| --- | --- | --- | --- |
| GET | `/api/health` | – | 200 `{ data: { status, database, contractVersion } }` |
| GET | `/api/projects` | `limit`, `offset` | 200 list |
| POST | `/api/projects` | `{ name }` | 201 `{ data: Project }` |
| GET | `/api/projects/:projectId` | – | 200 `{ data: Project }` |
| PATCH | `/api/projects/:projectId` | `{ name }` | 200 `{ data: Project }` |
| GET | `/api/projects/:projectId/documents` | `limit`, `offset` | 200 list |
| POST | `/api/projects/:projectId/documents` | `{ title, content? }` | 201 `{ data: Document }` |
| GET | `/api/documents/:documentId` | – | 200 `{ data: Document }` |
| PATCH | `/api/documents/:documentId` | `{ baseRevision, title?, content? }` | 200 `{ data: Document }` |
| GET | `/api/documents/:documentId/revisions` | `limit`, `offset` | 200 list of `Revision` |
| GET | `/api/projects/:projectId/entities` | `limit`, `offset` | 200 list |
| POST | `/api/projects/:projectId/entities` | `{ type, name, aliases?, description?, structuredData?, status? }` | 201 `{ data: Entity }` |
| GET | `/api/entities/:entityId` | – | 200 `{ data: Entity }` |
| PATCH | `/api/entities/:entityId` | `{ baseRevision, name?, aliases?, description?, structuredData?, status? }` | 200 `{ data: Entity }` |
| GET | `/api/entities/:entityId/revisions` | `limit`, `offset` | 200 list of `Revision` |
| GET | `/api/entities/:entityId/relations` | `limit`, `offset`, `direction?` | 200 list of `{ direction, relation }` |
| GET | `/api/projects/:projectId/relations` | `limit`, `offset` | 200 list |
| POST | `/api/projects/:projectId/relations` | `{ fromEntityId, toEntityId, type, metadata? }` | 201 `{ data: Relation }` |
| DELETE | `/api/relations/:relationId` | – | 200 `{ data: { id } }` |

List responses are `{ data: { items, limit, offset, hasMore } }`. `limit`
defaults to 50 and is capped at 200. Resources are ordered by creation time
(`created_at`, then `id`); revision history is newest first.

### Envelope and errors

Success is always `{ "data": ... }`, failure always
`{ "error": { code, message, requestId, details? } }`. `requestId` is returned
in the `x-request-id` response header as well.

| Code | HTTP | Meaning |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Body, query or path parameter failed its contract schema (`details.issues`) |
| `NOT_FOUND` | 404 | Resource does not exist, or the requested entity is not part of the given project |
| `CONFLICT` | 409 | `baseRevision` is stale (`details.conflict` carries the `Conflict` object) |
| `DOMAIN_CONSTRAINT` | 422 | Stored invariant rejected the request (duplicate relation, cross-project edge) |
| `INTERNAL_ERROR` | 500 | Unexpected failure; details stay in the server log |
| `UNAUTHENTICATED`, `FORBIDDEN`, `RATE_LIMITED` | 401/403/429 | Reserved, not produced until authentication lands |

### Revision semantics (must not be weakened)

- Creating a document or entity stores revision `1` and a revision row with
  `baseRevision = 0`.
- `PATCH` requires `baseRevision`; the row is locked inside a transaction, and a
  mismatch returns 409 `CONFLICT` without writing anything. The backend never
  merges, auto-bumps or silently overwrites.
- A `PATCH` that changes nothing returns the current state **without** advancing
  the revision. Repeated autosaves therefore cannot inflate revision numbers and
  invalidate AI patches that are still fresh.
- `structuredData` is replaced wholesale, never deep-merged.
- Relations and projects carry no revision in the contract: project rename is
  last-write-wins on a label, relations are created or deleted.

### Unimplemented by design in M0

`Suggestion`, `PatchSet`, `AuthorQuestion`, assets, jobs/outbox and search exist
in the contract but have no routes yet. Auth is not implemented: every write is
attributed to `DEFAULT_ACTOR_ID`.