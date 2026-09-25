# Integration

## Status after BE-003 storage integration and FE-001

Route-level API contracts now exist and are listed in `docs/CONTRACTS.md`;
`packages/contracts` is at 0.4.0. Local account/session routes and the
local-first SQLite runtime are implemented; project ownership and role
enforcement are still BE-002 phase 2 work. See `docs/BACKEND.md` to run the API.

Both sides must import `@module-atelier/contracts`; they must not duplicate
PatchSet or revision types.

## Frontend

The frontend workbench exists, but its next integration step is to use the live
0.4.0 local-account contract end to end. What exists:

- `/api/health` returns `{ status, database, contractVersion }`, so the shell can
  assert it is talking to contract 0.4.0.
- Project, document, entity and relation CRUD plus revision history.
- Uniform envelopes, structured errors, `x-request-id` on every response.

What the frontend must provide or know:

- **Dev proxy**: the API sends no CORS headers. Proxy `/api` to
  `http://127.0.0.1:3000` from the Vite dev server instead of requesting
  cross-origin.
- **`baseRevision` on every document/entity PATCH**, and handling of 409
  `CONFLICT` using `error.details.conflict` (`expectedRevision`,
  `actualRevision`) for merge/reload UX.
- **Authentication is live, and it is local** (`/api/auth/*`, contract 0.4.0).
  The launcher uses the setup/login boundary. Sign-in is by `username`; there
  is no verification screen. Sessions are httpOnly cookies, so requests send
  credentials and a 401 must clear local auth state.
- **Errors the auth UI should branch on**: `INVALID_CREDENTIALS`,
  `WEAK_PASSWORD`, `REGISTRATION_DISABLED`, `RATE_LIMITED`.
- **Project routes are not role-guarded yet** (phase 2): being signed in does
  not yet imply access control, so do not rely on the API to hide other
  projects' data.
- **No timestamps on entity/relation payloads.** `entitySchema` and
  `relationSchema` carry no `createdAt`/`updatedAt`; the database stores them.
  Sorting entities by recency needs either the revision number or a contract
  change (see the BE-001 handoff, CCR-1).
- **No delete** for projects, documents or entities; relations can be deleted.

## Agent Systems

Agent work depends on Entity, Document, Suggestion, AuthorQuestion, and PatchSet schemas. M0 exposes documents, entities, relations and their revision
history through the API and domain services; `Suggestion`, `AuthorQuestion` and
`PatchSet` have schema but no persistence or routes yet.

Agents must not receive SQL or database access. Reads belong to the domain
services; accepted AI changes must come back through the same revision-checked
write path (a PatchSet apply is an M3 task and must reuse it, not bypass it).

## Publisher

Publisher now has a local, database-independent `module-ir@0.1` prototype for PUB-001. It is not a shared/frozen contract yet; Backend/Lead Architect review is required before moving the types into `packages/contracts`.

The database-independent boundary Backend guarantees today:

- The API speaks `@module-atelier/contracts` types only. Drizzle rows never leave
  `packages/domain`; `packages/publisher` must not import `@module-atelier/db`.
- `Document.content` is Markdown source and nothing else. No rendered HTML, no
  layout, no theme is stored, so typography and pagination stay Publisher-side.
- `Entity.structuredData` carries factual/mechanical structure (never
  presentation), and `Entity.status` distinguishes canon from draft/rumor, so the
  Publisher can decide what it renders as settled text.
- Relations are readable in both directions for reference resolution, keyed by
  stable UUIDs rather than display names.

Open items Backend must settle with Publishing (see the BE-001 handoff message
packet): document ordering, an assets story, and a versioned `PublishSnapshot`
that carries revisions plus a schema/build version. Until that contract is
approved, the Publisher snapshot remains a local prototype.

## Blockers

- Project-level authorization is not implemented yet (BE-002 phase 2); authentication itself is.
- Shared PublishSnapshot/Module IR contract and worker integration are not yet frozen.
- Assets, outbox/pg-boss jobs and search are not implemented.
