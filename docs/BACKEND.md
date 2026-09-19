# Backend (apps/api, packages/db, packages/domain)

M0 backend for Module Atelier: Fastify REST API, Drizzle persistence on
PostgreSQL, domain services that own revision semantics. Delivered by BE-001.

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
| `TEST_DATABASE_URL` | tests only | – | Test database; the name must end with `_test` |

Invalid configuration fails fast with a readable message instead of starting a
half-configured server.

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

Migrations must contain every invariant the application relies on. The M0
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

- **No authentication or authorization.** Single-tenant M0: every request acts
  as `DEFAULT_ACTOR_ID`. Project scoping is structural (foreign keys, project
  checks) but there is no user boundary yet.
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
