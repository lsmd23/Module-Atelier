# Contracts

Current contract version: **0.1.0**. Source of truth: `packages/contracts/src/index.ts`.

PatchSet operations are `update_document`, `create_entity`, `update_entity`, `create_relation`, and `delete_relation`. Applying a PatchSet must validate every base revision atomically. A mismatch yields `stale`/`conflict`; silent overwrite is forbidden.

The API shape is not frozen until the backend task adds route-level request/response schemas. Any change to shared types requires updating this file and `docs/INTEGRATION.md`.
