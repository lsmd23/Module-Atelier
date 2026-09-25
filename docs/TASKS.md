# Tasks

- ARCH-001 (Lead): establish repository and contracts — done in this initialization.
- BE-001: implement M0 API/domain/database skeleton against contracts — done (`apps/api`, `packages/db`, `packages/domain`; routes frozen in `docs/CONTRACTS.md`, startup in `docs/BACKEND.md`). Open follow-ups are listed in the BE-001 handoff (document ordering, entity timestamps, auth boundary).
- FE-001: implement M0 web shell and contract-aware workspace boundary — delivered across `frontend/m0-workbench`; launcher/local-account integration follow-up remains on `frontend/launcher-chrome`.
- PUB-001: run isolated 中文/A4/two-column PDF technical spike — spike done in `packages/publisher`; shared Module IR / PublishSnapshot contract still under review.
- BE-002 (Backend, in progress): user management and a database-backed document filesystem, in five phases. Phase 1 (identity, sessions, verification, account API) is delivered; phase 2 adds project ownership and role enforcement; phase 3 the document tree with ordered nodes and revision restore; phase 4 the asset store; phase 5 wires the frontend to the real API.
- FE-002 (Integration, next): connect launcher/auth and authoring UI to the live local-account/API contract, then add a Playwright smoke path for setup/login → workspace → document save → conflict recovery.
- QA-001: add CI and repository validation — after packages exist.
