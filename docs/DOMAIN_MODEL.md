# Domain model

The canonical cross-module model is defined in `packages/contracts/src/domain.ts`
(re-exported from `packages/contracts/src/index.ts`): Project, Document, Entity,
Relation, Revision, PatchSet, Suggestion, AuthorQuestion, and Conflict. Documents
and entities are revisioned resources. A write carries `baseRevision`; mismatches
return `CONFLICT` and never overwrite newer data.

Entity status distinguishes confirmed canon, draft, rumor, character belief, conditional fact, and intentional ambiguity.

## Persistence mapping (BE-001)

`packages/db/src/schema.ts` implements Project, Document, Entity, Relation and
Revision. Table columns are `snake_case`, TypeScript and JSON are `camelCase`;
`packages/domain/src/mappers.ts` is the only conversion point.

| Contract | Table | Notes |
| --- | --- | --- |
| Project | `projects` | Isolation boundary; every other row references it |
| Document | `documents` | `content` is Markdown source; `revision` is the current version |
| Entity | `entities` | `structured_data` JSONB, `status`, `revision`, `aliases` as `text[]` |
| Relation | `relations` | Directed edge; composite FKs keep both endpoints in one project |
| Revision | `revisions` | Append-only history; polymorphic `resource_type`/`resource_id` |

Invariants enforced by the database, not only by TypeScript:

- Every row hangs off `project_id` with `ON DELETE CASCADE`.
- A relation can only join two entities of its own project (composite foreign
  keys on `(entity_id, project_id)`).
- `revision > 0`; `base_revision >= 0`.
- `(resource_type, resource_id, revision)` is unique, so a revision number can
  never be written twice.
- An edge is unique per `(project, from, type, to)`; duplicate edges are rejected
  instead of accumulating.
- JSONB columns must be JSON objects (`jsonb_typeof(...) = 'object'`).

`Revision.snapshot` stores the full resource state after each accepted write. It
is internal: it exists so a future restore/recovery feature has something to
restore from, and `revisionSchema` does not expose it. Revision rows are not
foreign-keyed to their resource, so history survives a resource deletion.

Relations and projects carry no revision: the contract defines no revision for
them, so an edge is created or deleted, and renaming a project is
last-write-wins on a label.

## Author content vs publication

The database stores author content and structured facts, never presentation:

- `Document.content` — Markdown source; rendered HTML is never persisted.
- `Entity.structuredData` — factual/mechanical structure for one entity type.
- `Relation` — the graph of how entities relate, with optional metadata.

Layout, theme, page composition and Chinese typography belong to the Publisher
layer, which consumes contract types (or a future `PublishSnapshot`), never these
tables or Drizzle row shapes. Any field that would only be meaningful to a
renderer must not be added here.