# Tasks

- ARCH-001 (Lead): establish repository and contracts — done in this initialization.
- BE-001: implement M0 API/domain/database skeleton against contracts — done (`apps/api`, `packages/db`, `packages/domain`; routes frozen in `docs/CONTRACTS.md`, startup in `docs/BACKEND.md`). Open follow-ups are listed in the BE-001 handoff (document ordering, entity timestamps, auth boundary).
- FE-001: implement M0 web shell and contract-aware workspace boundary — after BE-001 route shapes are accepted.
- PUB-001: run isolated 中文/A4/two-column PDF technical spike — spike done in `packages/publisher`; shared Module IR / PublishSnapshot contract still under review.
- BE-003 (Backend, next): storage switch to the local-first architecture in `docs/STORAGE.md` — SQLite with one database per project, app-level database, data directory bootstrap, connection registry, migrations and tests on SQLite.
- BE-002 (Backend, in progress): user management and a database-backed document filesystem. Phase 1 (identity, sessions, verification, account API) merged; phase 2 adds first-run owner setup, local user management, project ownership and role enforcement; phase 3 the document tree; phase 4 the asset store (files + metadata); phase 5 wires the frontend; phase 6 packaging.
- QA-001: add CI and repository validation — after packages exist.
