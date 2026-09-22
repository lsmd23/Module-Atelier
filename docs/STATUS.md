# Status

Current Milestone: **M0 — Foundation**

Completed:
- Empty repository assessed; no prior code, docs, or AGENTS.md found.
- pnpm workspace and strict TypeScript root configuration created.
- `@module-atelier/contracts` v0.1.0 created with Zod schemas/types for core entities, revisioning, PatchSet, suggestions, questions, and conflicts.
- Initial architecture, domain, roadmap, task, and integration records created.
- BE-001 backend skeleton: `packages/db` (Drizzle schema + repeatable migrations), `packages/domain` (services, revision semantics, row→contract mapping), `apps/api` (Fastify `/api` routes with `{ data }` / `{ error }` envelopes). Route contract frozen in `docs/CONTRACTS.md`; runbook in `docs/BACKEND.md`.
- Contract 0.2.0 adds route-level schemas in `packages/contracts/src/api.ts` (additive; domain types unchanged).
- BE-002 phase 1 delivered: real identity with Better Auth behind our own `/api/auth/*` routes (register, login, verification code, verify, logout, me, profile, password, password reset, sessions), auth tables in `packages/db/src/schema-auth.ts`, contract 0.3.0 with the account/session model and new error codes, and rate limits enforced in the API.

In Progress:
- BE-002 phase 2 (project ownership, members, role enforcement) is next; phases 3-5 cover the document tree, the asset store and frontend wiring.
- Publishing technical spike (PUB-001) completed locally; shared PublishSnapshot/Module IR contract remains under review.

Blocked:
- None known. Route shapes are proposed and awaiting Lead/Frontend review; no downstream module needs to wait to read `docs/CONTRACTS.md`.

Global conventions:
- Repository-wide rules are in `AGENTS.md`; module-specific contracts remain in `docs/CONTRACTS.md` and `docs/INTEGRATION.md`.

Important Contract Changes:
- v0.2.0 (additive): `packages/contracts/src/api.ts` with envelopes, error codes, request/response schemas, route paths and input limits. Domain types moved verbatim to `src/domain.ts`; `src/index.ts` is now a re-export barrel. No v0.1.0 type changed.

Integration Risks:
- Project routes are not yet role-guarded (BE-002 phase 2): a request without a session is still served and attributed to `DEFAULT_ACTOR_ID`, so the API must not be exposed publicly until phase 2 lands.
- No mail transport: verification codes reach the API log, or the response when `AUTH_DEV_EXPOSE_CODE` is on (development only).
- Entity and relation payloads carry no timestamps (contract gap, proposed as CCR-1).
- Document ordering is not modelled, which the Publisher snapshot needs (CCR-2).
- Shared PublishSnapshot/Module IR contract and worker integration are not yet frozen.
- Assets, outbox/pg-boss jobs and search are not implemented.

Validation:
- Publisher strict TypeScript check passed.
- Publisher Vitest checks passed (4 tests).
- Playwright Chromium generated and visually inspected the original Chinese fixture PDF (7 A4 pages, including a controlled full-width image asset).
- Backend strict TypeScript check passed for contracts, db, domain, api (and publisher).
- Backend Vitest: contracts 15, db 7, domain 23, api 15 — 60 tests passed against real PostgreSQL.
- `pnpm db:migrate` applied the M0 migration to the development database and was re-run to confirm it is repeatable.
- Live smoke test: the API was started on 127.0.0.1:3000 and 33 real HTTP checks passed (health, project/document/entity/relation flows, 409 CONFLICT on a stale `baseRevision`, cross-project rejection, envelopes, request ids). Smoke rows were removed afterwards.
- BE-002 phase 1: 6 packages typecheck; 115 tests pass (contracts 15, db 7, domain 23, api 34, web 32, publisher 4). The 19 new API tests cover the registration policy, the duplicate-registration answer, blocked sign-in before verification, single-use codes, rate limiting, hashed passwords and codes, session listing and revocation, password rotation and authorship attribution.
- Auth migration applied twice to confirm repeatability; a live smoke script ran 29 real HTTP checks against the running API (register -> code -> verify -> session -> profile -> sessions -> password change -> logout) and all passed.
