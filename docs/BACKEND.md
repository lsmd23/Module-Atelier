# Backend (apps/api, packages/db, packages/domain)

M0 backend for Module Atelier: Fastify REST API, Drizzle persistence on
PostgreSQL, domain services that own revision semantics. Delivered by BE-001.

> **Storage is changing.** `docs/STORAGE.md` describes the local-first target
> (SQLite, one database per project, user data directory). Until BE-003 lands,
> this document still describes the running PostgreSQL deployment accurately.

## Prerequisites

| Requirement | Version | Notes |
| --- | --- | --- |
| Node.js | 24.x | The API runs TypeScript directly, no build step (`node src/main.ts`) |
| pnpm | 10.15.0 | Pinned by `packageManager`; enable with `corepack enable` |
| PostgreSQL | 16+ | Local conda instance on port 5433 (`~/.module-atelier/pgctl`), or the Compose service below |

The machine's toolchain lives in the conda environment `module-atelier`
(see `~/.module-atelier/README.md`). Docker is optional for local development
and is the supported single-host deployment path below.

## Docker Compose deployment

The backend deployment contains only the M0 services that exist today: a
PostgreSQL 16 database, a one-shot migration service, and the Fastify API.
PostgreSQL is on an internal Compose network and is not published to the host.
The API is bound to `127.0.0.1:3000` by default so a reverse proxy can own the
public ports.

```bash
cp infra/backend.env.example infra/backend.env
# edit infra/backend.env and replace POSTGRES_PASSWORD
pnpm docker:backend:config   # validate interpolation before starting
pnpm docker:backend:up
curl http://127.0.0.1:3000/api/health
pnpm docker:backend:logs
pnpm docker:backend:down     # keeps the named PostgreSQL volume
```

`migrate` waits for PostgreSQL readiness and must complete successfully before
the API starts. Re-running `docker:backend:up` is safe: Drizzle records applied
migrations in `drizzle.__drizzle_migrations`. To remove the database volume in a
disposable local environment, use `docker compose --env-file infra/backend.env
-f infra/docker-compose.yml down -v`; do not use `-v` for a deployment you need
to preserve.

The image runs as the unprivileged `node` user, has a read-only root filesystem,
prevents gaining new privileges, and receives a Docker healthcheck based on
`/api/health`. The healthcheck is dependency-aware and returns failure when
PostgreSQL is unavailable. No database port is exposed by Compose.

The example password is intentionally not production-safe. Use a secret
manager or an equivalent deployment secret mechanism in production, and keep
the password URL-safe because the current M0 connection string is assembled by
Compose. Authentication, Caddy/HTTPS, backups, and worker containers are not
implemented in M0 and remain release blockers for a public production launch.

## First run

```bash
conda activate module-atelier
cd "/Users/lsmd/code/Module Atelier"

cp .env.example .env          # required once; .env is gitignored
~/.module-atelier/pgctl start # PostgreSQL must be running
pnpm install
pnpm db:migrate               # applies migrations, repeatable
pnpm dev                      # API on http://127.0.0.1:3000
```

`pnpm dev` watches `src/`. `pnpm --filter @module-atelier/api start` runs once
without watching. Both load the repository-root `.env` through
`--env-file-if-exists`.

Verify the server:

```bash
curl http://127.0.0.1:3000/api/health
# {"data":{"status":"ok","database":"up","contractVersion":"0.2.0"}}
```

## Environment variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | – | API and migration connection string |
| `API_HOST` | no | `127.0.0.1` | Listener host |
| `API_PORT` | no | `3000` | Listener port |
| `LOG_LEVEL` | no | `info` | pino level: `fatal`…`trace`, or `silent` |
| `DEFAULT_ACTOR_ID` | no | `local-author` | `authorId` recorded on revisions until Better Auth exists |
| `BETTER_AUTH_SECRET` | yes | – | Session signing secret, ≥32 chars (`openssl rand -base64 32`) |
| `BETTER_AUTH_URL` | no | `http://127.0.0.1:3000` | Public API URL; decides the cookie `secure` flag and is always trusted |
| `ALLOW_REGISTRATION` | no | `false` | Public sign-up; the first account is admitted either way |
| `AUTH_TRUSTED_ORIGINS` | no | – | Comma-separated extra origins allowed to send cookies (the Vite dev server) |
| `AUTH_DEV_EXPOSE_CODE` | no | `false` | Development only: return verification codes in the response |
| `TEST_DATABASE_URL` | tests only | – | Test database; the name must end with `_test` |

Invalid configuration fails fast with a readable message instead of starting a
half-configured server.

## Authentication

`better-auth` owns password hashing and session tokens; the API exposes its own
`/api/auth/*` routes on top of it (`apps/api/src/routes/auth.ts`) so every
response keeps the `{ data }` / `{ error }` envelope and the contract's error
codes. Better Auth's own HTTP handler is deliberately not mounted: one auth
surface is easier to keep aligned with `packages/contracts`.

**Accounts are local.** The first run creates the owner
(`POST /api/auth/setup`, refused afterwards with `REGISTRATION_DISABLED`), that
account signs in with its username, and nothing is ever emailed — there is no
verification step and no reset-by-mail flow. Further accounts are created by the
owner on this machine (BE-002 phase 2).

- **Naming.** Tables are declared in `packages/db/src/schema-auth.ts` with
  camelCase Drizzle properties and snake_case columns; Better Auth addresses
  columns by property name and Drizzle translates, so the repository convention
  needs no field-mapping configuration.
- **Identifiers.** `advanced.database.generateId` returns a UUID, matching every
  other table.
- **Email.** Better Auth requires a unique address on its user model, so an
  account created without one stores a placeholder under the reserved `.invalid`
  domain (RFC 2606) and the API reports `email: null`. `verifications` stays in
  the adapter even though nothing is emailed: Better Auth uses that table
  internally and refuses to start without it.
- **Rate limits** live in `apps/api/src/auth/rate-limit.ts`, because Better
  Auth's limiter guards its own HTTP handler and these routes call `auth.api.*`
  directly. Ten sign-in attempts per address+username per minute → 429.
- **Error codes** are translated from Better Auth's vocabulary to the
  contract's. A bare 401 is not translated blindly: the route decides whether it
  means wrong credentials or no session.

## Migrations

Production schema changes only ever go through Drizzle migrations. `push` is
not used.

```bash
# 1. edit packages/db/src/schema.ts
pnpm db:generate     # writes packages/db/migrations/000N_*.sql + meta
# 2. read the generated SQL (checks, constraints, indexes) before applying
pnpm db:migrate      # applies everything not yet recorded in drizzle.__drizzle_migrations
```

`pnpm db:migrate` is repeatable: applied migrations are recorded in
`drizzle.__drizzle_migrations` and skipped on later runs. It is intentionally
*not* run automatically by the API on boot — deployment order stays explicit.

Migrations must contain every invariant the application relies on. The domain
schema carries: UUID primary keys, `timestamptz` columns, `CHECK` constraints on
revision numbers and JSONB shape, `UNIQUE` constraints on revision identity and
relation edges, and composite foreign keys that make cross-project relations
impossible at the database level.

## Tests

Tests need a real PostgreSQL server. SQLite is not an acceptable substitute for
the constraint, locking and JSONB behaviour this project depends on.

```bash
~/.module-atelier/pgctl start
pnpm -r test                      # every package
pnpm --filter @module-atelier/domain test
pnpm --filter @module-atelier/api test
pnpm --filter @module-atelier/db test
pnpm -r typecheck
```

The suites create `TEST_DATABASE_URL` if missing, apply migrations, and truncate
the domain tables between cases. The helper refuses to run when the database
name does not end with `_test`, so a misconfigured `.env` cannot wipe the
development database. Test files run serially because they share one database.

## Conventions

- **Identifiers**: UUID v4 (`gen_random_uuid()`), generated by the database.
- **Time**: `timestamptz` in PostgreSQL, always serialized as UTC ISO-8601 (`Z`).
- **Naming**: `snake_case` columns, `camelCase` in TypeScript and JSON.
- **JSON**: JSONB columns with a `jsonb_typeof(...) = 'object'` check; entity
  `structuredData` and relation `metadata` are never stored as bare strings.
- **Types**: the API speaks `@module-atelier/contracts` types. Rows are mapped
  to contract objects in `packages/domain/src/mappers.ts`; no other module sees
  persistence shapes.
- **Logging**: request ids only. Bodies are never logged, so author content
  stays out of logs.

## Error handling

Failures return `{ "error": { code, message, requestId, details? } }` with the
statuses documented in `docs/CONTRACTS.md`. Unexpected failures become a generic
500 while the full error is logged server-side; SQL text and stack traces never
reach clients.

## Known gaps (deliberate, see the BE-001 handoff)

- **Project routes are not yet role-guarded.** Accounts, sessions and OTP
  verification exist (BE-002 phase 1), and writes are attributed to the
  signed-in user when a session is present, but a request without a session is
  still served and attributed to `DEFAULT_ACTOR_ID`. Making a session mandatory
  and enforcing project roles is phase 2, which is also when `FORBIDDEN` starts
  being produced.
- **No mail at all, by design.** Accounts are local; see the Authentication
  section.
- **No CORS.** In development the frontend should proxy `/api` to
  `http://127.0.0.1:3000` (Vite `server.proxy`), which keeps the API
  same-origin and avoids a wildcard CORS policy.
- **No delete endpoints for projects, documents or entities.** The contract has
  no archive/restore field, so those would be irreversible. Relations can be
  deleted.
- **No assets, no pg-boss/outbox, no PatchSet apply, no search.** Those belong
  to M1+ milestones.
- **Revision snapshots are stored but not exposed.** They are the future
  recovery path; `revisionSchema` has no snapshot field.
- **Offset pagination only.** Fine for M0 list sizes; revisit before large
  projects.

## Layout

```
apps/api/src
  config.ts        environment parsing (Zod)
  http.ts          input parsing, error -> envelope mapping
  server.ts        Fastify instance, hooks, error handlers
  routes/*.ts      one module per resource
  main.ts          process entry: pool, shutdown, listen
packages/db/src
  schema.ts        Drizzle tables, enums, checks, indexes
  client.ts        pool + Drizzle client, DbExecutor types
  migrate.ts       migrator (repeatable)
  migrate-cli.ts   `pnpm db:migrate` entry point
  testing.ts       test database helpers (separate export)
  pg-errors.ts     driver error-code inspection
packages/domain/src
  projects|documents|entities|relations.ts   services
  errors.ts        NotFound / RevisionConflict / DomainConstraint
  mappers.ts       row -> contract mapping
  query.ts         pagination helpers
```
