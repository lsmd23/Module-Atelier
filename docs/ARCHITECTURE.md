# Architecture

- `apps/web`: React/Vite authoring UI.
- `apps/api`: Fastify REST/SSE boundary.
- `apps/worker`: pg-boss jobs, agents, and publishing.
- `packages/contracts`: versioned cross-module schemas and types (current `0.1.0`).
- `packages/domain`, `packages/db`, `packages/agent`, `packages/publisher`, `packages/ui`: introduced only when their milestone begins.

Persistence is PostgreSQL/Drizzle; background jobs use pg-boss. The first milestone is M0 Foundation, followed by M1 Core Authoring.
