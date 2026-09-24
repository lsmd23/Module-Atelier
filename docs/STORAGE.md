# Storage architecture (local-first)

Decision (2026-09-21): Module Atelier ships as a **locally installed, all-in-one
application**, not as a service deployed to a server. The reference shape is
FoundryVTT: the application and the user's data live apart, the data directory is
self-contained, assets are plain files, and a backup is a copy of one folder.

This document replaces the PostgreSQL-server assumptions of BE-001 for
everything storage related. It is the design of record until a later phase
supersedes it.

## Package shape

One application process (Node 24 + Fastify, with the built frontend served from
the same process) listening on `127.0.0.1`. No external database, no container,
no runtime for the user to install. The browser (or a bundled window) is the UI.

## Data directory

Platform defaults, overridable in `config/options.json` — FoundryVTT uses the
same two locations, and backing up means copying this folder:

```
~/Library/Application Support/Module Atelier/     # Windows: %APPDATA%\Module Atelier
                                                    # Linux: ~/.local/share/module-atelier
  config/options.json        port, data path, backup settings, mail settings
  data/
    app.db                   SQLite: users, sessions, app settings, project index
    projects/
      <projectId>/
        project.db           SQLite: this project's content, members and revisions
        project.json         title, display settings, schema version (readable outside the app)
        assets/              plain files, referenced by relative path
    backups/                 in-app backup archives (zip of a project or of everything)
  logs/
```

`app.db` is an **index, not the source of truth**: it lists projects by id, path
and last-opened time, but a project's identity lives inside its own directory.
Deleting `app.db` must therefore be recoverable by scanning `data/projects/*`,
and the app repairs the index on startup.

## Why per-project databases

Each project is one directory with its own database file (the equivalent of one
FoundryVTT world). This buys three things:

1. **Cross-project integrity is structural.** A relation inside a project
   database can only reference entities of that same database, so the composite
   foreign keys BE-001 used to prevent cross-project relations are no longer
   needed — the file boundary does the job.
2. **Portability and blast radius.** Copy one project directory to move it;
   corruption or a bad migration is contained to one project.
3. **Import/export becomes a file operation.** A project export is its directory
   plus its assets, zipped; an import is unzipping into `data/projects/`.

The cost is that anything shared across projects — accounts, sessions, the
project list, app settings — needs `app.db`, and the service layer must open and
cache a connection per project instead of holding one global handle.

## Engine and dialect

**SQLite** through Drizzle + `better-sqlite3` (prebuilt binaries, so packaging is
straightforward, and no cloud lineage: it is the embedded database desktop
applications ship). A single app process with a single writer matches the "one
author at a time" usage we are designing for; WAL mode allows concurrent reads
while a write is in flight.

better-sqlite3 is synchronous, and its Drizzle transaction callback therefore
returns the result directly — an `async` body would commit early and continue
outside the transaction, silently losing atomicity, with no type error to warn
anyone. Everything that writes more than one row goes through
`inTransaction` (`packages/db/src/transaction.ts`), which rejects a
promise-returning body at compile time and throws at runtime if a thenable slips
through a cast. Two alternatives were measured and rejected: `@libsql/client`
works and supports async transactions, but it is Turso's client, which is a
cloud-shaped dependency for a purely local product; `node:sqlite` is built into
the runtime (zero dependencies) but Drizzle has no driver for it, and a
`sqlite-proxy` adapter failed on the insert path when prototyped.

PostgreSQL features map as follows:

| BE-001 (PostgreSQL) | Local-first (SQLite) | Note |
| --- | --- | --- |
| `uuid` primary keys | `TEXT` with UUID values | Generated in the application (`crypto.randomUUID()`), still a UUID |
| `timestamptz` | `INTEGER` epoch milliseconds | Drizzle `integer({ mode: "timestamp_ms" })`; UTC by construction |
| `jsonb` | `TEXT` + `json_valid()` and `json_type()` checks | Still constrained, never a free-form dump |
| `text[]` (entity aliases) | `TEXT` JSON array + `json_type(...) = 'array'` | Loses array operators; our usage is simple lists |
| Postgres enums | `TEXT` + `CHECK (col in (...))` | Easier to evolve than an enum type |
| `SELECT ... FOR UPDATE` | not needed | Single writer per database; the revision check runs inside one write transaction |
| `jsonb` equality probe for no-op saves | canonical JSON comparison in the service | Simpler, dialect-independent, avoids SQLite key-order differences |
| `gen_random_uuid()` default | application-generated ids | Explicit and portable |
| `pg_trgm` / `to_tsvector` | FTS5 with the `trigram` tokenizer (M1 search) | Better default behaviour for Chinese text than the Postgres defaults |
| `PRAGMA foreign_keys` | must be enabled per connection | Set by the connection factory; tests assert it |

Everything the domain depends on survives: `CHECK` constraints, `UNIQUE`
constraints (including composite ones), foreign keys with `ON DELETE CASCADE`,
and transactional writes. Optimistic concurrency keeps its exact semantics: read
the row, compare `baseRevision`, write only if it matches, record the revision
row in the same transaction.

## Connections

`packages/db` gains a registry instead of a single client:

- one connection to `app.db`
- one cached connection per open project, opened lazily, closed on idle and on
  shutdown (an LRU with a small cap, so a large library does not exhaust file
  handles)

Routes that operate on a project resolve the project first, then run inside that
project's connection. Routes that list or open projects stay on `app.db`.

## Assets

Files on disk, metadata in the project database: `filename`, `mime_type`,
`size_bytes`, `sha256`, `relative_path`, optional `width`/`height`. Writing bytes
into the database was the earlier plan; keeping them as files is what the
reference application does and keeps a project database small enough to copy
quickly.

Safety rules stay: an asset is addressed by UUID, the path is derived by the
application (never from user input), the file name is only displayed, uploads
are checked for size, declared MIME type and magic bytes, and downloads are
served with the stored type plus `X-Content-Type-Options: nosniff`.

## Backup, export and recovery

- Backup = copy (or zip) the data directory; the app can also write an archive
  into `data/backups/`.
- Export a project = its directory (database + assets + `project.json`).
- Import = unzip into `data/projects/`; the index is rebuilt by scanning.
- `project.json` carries a schema version so a future importer can tell which
  migration set a directory needs.

## What this changes in the repository

Kept: revision semantics (baseRevision, no silent overwrite, no-op saves not
bumping the revision), the `{ data }` / `{ error }` envelope and error codes,
`packages/contracts` as the single model source, the domain/API layering, the
route and test conventions.

Reworked: the Drizzle schemas and migrations (SQLite dialect, new files), the
database client (registry instead of one Postgres pool), the test baseline
(SQLite files instead of a PostgreSQL server, which also removes PostgreSQL from
the development prerequisites), asset storage (files + metadata), and the
deployment story (`Docker Compose` from `infra/` describes a server deployment
that no longer matches the product; it is Platform/QA ownership, so it is flagged
rather than removed here).

Kept from BE-002 phase 1: the account model, Better Auth wiring, email
verification codes and the session cookie. A service mailbox will be provided for
delivery, so the log-only transport becomes an SMTP transport with configuration
in `config/options.json` / environment variables; `AUTH_DEV_EXPOSE_CODE` remains
a development aid only.

## Phases

- **Phase 0 — storage switch**: SQLite schemas for `app.db` and a project
  database, the connection registry, migrations and tests running on SQLite, the
  data-directory bootstrap (`config/options.json`, `data/`, `logs/`), and the
  project index rebuild. Nothing else changes behaviour.
- **Phase 1 — accounts** (merged): accounts, sessions, verification, account API.
- **Phase 2 — ownership and roles**: first-run owner setup, local user
  management, project members, and authorization on every project route.
- **Phase 3 — document tree**: folders, fractional ordering, archive/restore,
  restore-from-revision.
- **Phase 4 — assets**: upload/download against the project's `assets/` folder.
- **Phase 5 — frontend wiring**: `httpApi` against the real API, dev proxy, 401
  handling, data-directory and account settings UI.
- **Phase 6 — packaging**: single-process distribution for macOS/Windows/Linux,
  coordinated with Platform/QA.