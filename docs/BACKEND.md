# Backend runbook

Module Atelier is a local-first application. The current runtime is one Fastify
process backed by SQLite: `app.db` stores accounts and the project index, and
each project owns a separate `project.db` under the data directory. See
`docs/STORAGE.md` for the storage model.

## Local development

```bash
cp .env.example .env
# set BETTER_AUTH_SECRET to a random value of at least 32 characters
pnpm install
pnpm dev                    # API on http://127.0.0.1:30017
```

Leave `MODULE_ATELIER_DATA_DIR` empty to use the platform default, or set it to
a disposable directory for testing. The API creates and migrates the app and
project databases during startup.

The frontend runs separately:

```bash
pnpm --filter @module-atelier/web dev
```

Vite proxies `/api` to `http://127.0.0.1:30017`, and the HTTP client sends
session cookies with `credentials: "include"`.

## Tests and checks

```bash
pnpm typecheck
pnpm test
pnpm web:build
```

The test suites use temporary SQLite databases and do not require PostgreSQL.
`better-sqlite3` must be allowed to run its native install/build step.

## Current boundaries

- Authentication is local username/password setup with httpOnly sessions.
- Project ownership and role enforcement are not complete yet.
- Suggestion, PatchSet, AuthorQuestion, asset, worker and search routes are
  not implemented.
- The frontend's suggestion and PDF preview surfaces remain `MOCK ONLY`.
