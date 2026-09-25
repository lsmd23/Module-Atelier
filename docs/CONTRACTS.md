# Contracts

Current contract version: **0.4.0**. Source of truth: `packages/contracts/src` —
`domain.ts` holds the cross-module model, `auth.ts` the account/session model,
`api.ts` the route-level shapes, `index.ts` re-exports all three.

Versions 0.2.0 and 0.3.0 were additive. **0.4.0 is a deliberate breaking
change**: the application is installed locally and has no mail channel, so email
verification was removed — the register/verification-code/verify-email and
password-reset routes are gone, sign-in uses `username`, and `AccountUser.email`
is nullable. `INVALID_CODE` and `EMAIL_NOT_VERIFIED` were dropped from the error
codes with the flows that produced them.

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

### Account API (contract 0.4.0)

Local accounts: one installation, one owner created on first run, further
accounts created by the owner on the same machine. Sessions live in an httpOnly,
SameSite=Lax cookie (`secure` when the base URL is https), so clients send no
credential with a request; `sessionId` is returned only so the UI can list and
revoke sessions.

| Method | Path | Body / query | Success |
| --- | --- | --- | --- |
| GET | `/api/auth/setup-status` | – | 200 `{ data: { needsSetup } }` |
| POST | `/api/auth/setup` | `{ displayName, username, password, email? }` | 201 with a session, 201 with `session: null`, or 403 `REGISTRATION_DISABLED` when an owner exists |
| POST | `/api/auth/login` | `{ username, password }` | 200 `{ data: { session } }` |
| POST | `/api/auth/logout` | – | 200 `{ data: { signedOut: true } }` (idempotent) |
| GET | `/api/auth/me` | – | 200 `{ data: AccountUser }` |
| PATCH | `/api/auth/profile` | `{ displayName }` | 200 `{ data: AccountUser }` |
| POST | `/api/auth/password` | `{ currentPassword, newPassword }` | 200 `{ data: { updated: true } }`, revokes other sessions and rotates the current cookie |
| GET | `/api/auth/sessions` | `limit`, `offset` | 200 list of `AccountSession` (`current` marks the caller's session) |
| DELETE | `/api/auth/sessions/:sessionId` | – | 200 `{ data: { id } }` |

`AccountUser` carries `id, username, email (nullable), displayName, role (author
| collaborator | reader), emailVerified, status (active | suspended), plan (free |
creator | studio), createdAt, lastLoginAt`.

Behaviour worth knowing:

- **Nothing is emailed.** No verification step, no password reset by mail; an
  account whose owner forgets its password is reset on this machine by the
  installation owner (BE-002 phase 2 tooling).
- **`email` is optional and usually absent.** Better Auth requires a unique
  address on its user model, so accounts created without one store a placeholder
  under the reserved `.invalid` domain; the API reports `email: null` for those
  and never exposes the placeholder.
- **Setup closes after the first account.** `POST /api/auth/setup` answers 403
  once any account exists, so a client that sees 403 must route to sign-in, not
  retry. It answers **201 in both success shapes**: with a session when the owner
  is also signed in, and with `session: null` on the rare occasion where the
  account was created but the session could not be opened - in that case the
  account exists and the client signs in with the credentials it just sent.
  Status 200 is not produced by this route.
- **Sign-in is rate limited** in this API (10 attempts per address+username per
  minute, 429 `RATE_LIMITED`), because Better Auth's limiter only guards its own
  HTTP handler, which this API does not mount.

### Envelope and errors

Success is always `{ "data": ... }`, failure always
`{ "error": { code, message, requestId, details? } }`. `requestId` is returned
in the `x-request-id` response header as well.

| Code | HTTP | Meaning |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Body, query or path parameter failed its contract schema (`details.issues`) |
| `INVALID_CREDENTIALS` | 401 | Wrong username/password, or a wrong current password on change |
| `WEAK_PASSWORD` | 400 | Password outside the accepted length range |
| `REGISTRATION_DISABLED` | 403 | Setup was attempted after the owner already exists |
| `NOT_FOUND` | 404 | Resource does not exist, or the requested entity is not part of the given project |
| `CONFLICT` | 409 | `baseRevision` is stale (`details.conflict` carries the `Conflict` object) |
| `DOMAIN_CONSTRAINT` | 422 | Stored invariant rejected the request (duplicate relation, cross-project edge) |
| `INTERNAL_ERROR` | 500 | Unexpected failure; details stay in the server log |
| `UNAUTHENTICATED` | 401 | The auth routes produce it when no session cookie is present |
| `FORBIDDEN` | 403 | Reserved for BE-002 phase 2 (project roles) |
| `RATE_LIMITED` | 429 | Auth rate limits; see the limits above |

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

### Unimplemented by design

`Suggestion`, `PatchSet`, `AuthorQuestion`, folders, assets, jobs/outbox and
search have no routes yet. Project routes are still unauthenticated: phase 1
attributes writes to the signed-in user when a session exists and to
`DEFAULT_ACTOR_ID` otherwise; **phase 2 makes a session mandatory and enforces
project roles** (which is when `FORBIDDEN` starts being produced).