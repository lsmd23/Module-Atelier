# Contracts

Current contract version: **0.3.0**. Source of truth: `packages/contracts/src` —
`domain.ts` holds the cross-module model, `auth.ts` the account/session model,
`api.ts` the route-level shapes, `index.ts` re-exports all three. Versions 0.2.0
and 0.3.0 are additive: no earlier type was changed.

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

### Account and session API (BE-002 phase 1)

Sessions live in an httpOnly, SameSite=Lax cookie (`secure` when `BETTER_AUTH_URL`
is https), so clients send no credential with a request. `sessionId` is returned
only so the UI can list and revoke sessions.

| Method | Path | Body / query | Success |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | `{ displayName, email, password }` | 201 `{ data: { session: null, requiresVerification: true } }` |
| POST | `/api/auth/login` | `{ email, password }` | 200 `{ data: { session: { user, sessionId } } }` |
| POST | `/api/auth/verification-code` | `{ email }` | 200 `{ data: { delivered, expiresInSeconds, devCode? } }` |
| POST | `/api/auth/verify-email` | `{ email, code }` | 200 `{ data: { session } }` — verification signs the account in |
| POST | `/api/auth/logout` | – | 200 `{ data: { signedOut: true } }` (idempotent) |
| GET | `/api/auth/me` | – | 200 `{ data: AccountUser }` |
| PATCH | `/api/auth/profile` | `{ displayName }` | 200 `{ data: AccountUser }` |
| POST | `/api/auth/password` | `{ currentPassword, newPassword }` | 200 `{ data: { updated: true } }`, revokes other sessions and rotates the current cookie |
| POST | `/api/auth/password-reset/request` | `{ email }` | 200 `{ data: { delivered, expiresInSeconds, devCode? } }` |
| POST | `/api/auth/password-reset/confirm` | `{ email, code, newPassword }` | 200 `{ data: { updated: true } }` |
| GET | `/api/auth/sessions` | `limit`, `offset` | 200 list of `AccountSession` (`current` marks the caller's session) |
| DELETE | `/api/auth/sessions/:sessionId` | – | 200 `{ data: { id } }` |

`AccountUser` carries `id, username, email, displayName, role (author |
collaborator | reader), emailVerified, status (active | suspended), plan (free |
creator | studio), createdAt, lastLoginAt`. Role and plan are stored but not yet
enforced: project-level authorization is BE-002 phase 2.

Behaviour worth knowing:

- **Registration is closed by default.** `ALLOW_REGISTRATION=false` admits only
  the first account (bootstrap) and then answers 403 `REGISTRATION_DISABLED`.
- **Duplicate registration is deliberately indistinguishable.** Signing up an
  existing address returns the same 201 as a new one and creates nothing, so the
  endpoint cannot be used to enumerate accounts.
- **Verification is the sign-in step** for a new account; a password is not
  required at that point. The code is 6 digits, single-use, expires after 300s,
  allows 3 attempts, and is stored hashed.
- **Code delivery has no transport yet.** Phase 1 logs the code instead of
  sending mail (see `docs/BACKEND.md`); `AUTH_DEV_EXPOSE_CODE=true` additionally
  returns it as `devCode` and must never be enabled in a deployment.
- **Rate limits are enforced in this API**, not by the auth library: 3 codes per
  address per minute, 10 sign-in attempts per address+IP per minute, 3 reset
  requests per address per minute → 429 `RATE_LIMITED`.

### Envelope and errors

Success is always `{ "data": ... }`, failure always
`{ "error": { code, message, requestId, details? } }`. `requestId` is returned
in the `x-request-id` response header as well.

| Code | HTTP | Meaning |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Body, query or path parameter failed its contract schema (`details.issues`) |
| `INVALID_CREDENTIALS` | 401 | Wrong email/password, or a wrong current password on change |
| `INVALID_CODE` | 400 | Wrong, expired or already-used verification code |
| `WEAK_PASSWORD` | 400 | Password outside the accepted length range |
| `EMAIL_NOT_VERIFIED` | 403 | Sign-in attempted before the address was verified |
| `REGISTRATION_DISABLED` | 403 | Public sign-up is off and the instance already has an account |
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