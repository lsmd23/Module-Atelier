# Decisions

- 2026-09-18: Start from an empty repository and establish only M0 foundations.
- 2026-09-18: Pin shared contract source to `packages/contracts`; API routes remain unfreezed until backend review.
- 2026-09-18: Use revision checks and explicit conflict results for every mutable resource.
- 2026-09-19: Freeze the M0 REST shape as `/api/...` with `{ data }` / `{ error }` envelopes and the documented error codes; route schemas live in `packages/contracts/src/api.ts` (contract 0.2.0, additive).
- 2026-09-19: A write that does not change anything returns the current state without advancing `revision`, so repeated autosaves cannot make fresh AI patches look stale.
- 2026-09-19: Enforce cross-project relation integrity with composite foreign keys instead of application checks alone.
- 2026-09-19: Keep revision snapshots in the database but out of the API contract until a restore/export feature needs them.
- 2026-09-19: M0 has no authentication; every write is attributed to `DEFAULT_ACTOR_ID`, and the model stores no hardcoded owner. Replace with Better Auth before any multi-user use.
- 2026-09-19: Projects, documents and entities have no delete endpoint until an archive/restore field exists in the contract; relations may be deleted.
