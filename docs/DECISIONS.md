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
- 2026-09-20: Adopt Better Auth as the authentication engine but expose it through our own `/api/auth/*` routes, so the envelope and error codes stay uniform; Better Auth's own HTTP handler is not mounted.
- 2026-09-20: Keep the repository's snake_case columns and UUID keys for auth tables by declaring them in Drizzle and letting Better Auth address camelCase properties, instead of adopting Better Auth's default naming.
- 2026-09-20: Verification codes are 6-digit, single-use, hashed at rest, and confirming one signs the new account in (no password is available at that point).
- 2026-09-20: Public registration is closed by default; the first account bootstraps the instance, and a duplicate registration answers exactly like a new one so accounts cannot be enumerated.
- 2026-09-20: Rate limits for auth routes are enforced in this API, because Better Auth's limiter only guards its own HTTP handler.
