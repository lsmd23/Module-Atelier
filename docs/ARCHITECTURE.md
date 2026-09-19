# Architecture

- `apps/web`: React/Vite authoring UI.
- `apps/api`: Fastify REST/SSE boundary (implemented in M0 by BE-001).
- `apps/worker`: pg-boss jobs, agents, and publishing.
- `packages/contracts`: versioned cross-module schemas and types (current `0.2.0`).
- `packages/db`, `packages/domain`: Drizzle schema/migrations and domain services (implemented in M0 by BE-001).
- `packages/publisher`: Module IR and rendering prototype for PUB-001.
- `packages/agent`, `packages/ui`: introduced only when their milestone begins.

Backend layering: `apps/api` (HTTP, envelopes, validation) → `packages/domain`
(services, revision rules, row→contract mapping) → `packages/db` (Drizzle
schema, migrations, driver errors). Nothing above `packages/db` imports
`@module-atelier/db` tables except `packages/domain`, and no other module sees
row shapes. See `docs/BACKEND.md`.

Persistence is PostgreSQL/Drizzle; background jobs use pg-boss. The first milestone is M0 Foundation, followed by M1 Core Authoring.
