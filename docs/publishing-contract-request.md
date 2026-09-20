# Contract Request: PublishSnapshot / Module IR

==============================
CONTRACT REQUEST
==============================

FROM:
Publishing Developer

TO:
Lead Architect / Backend Developer

TASK ID:
PUB-001 follow-up

PROBLEM:
The repository has no frozen publishing snapshot or Module IR contract. The publishing spike therefore uses local `PublishSnapshot` and `module-ir@0.1` types and must not be treated as the cross-module authority.

DATA NEEDED:
- immutable project metadata and theme/version;
- ordered document IDs, revisions, titles, and Markdown source;
- resolved entity IDs, display names, types, structured render data;
- safe asset IDs, MIME types, dimensions, captions, and resolver locations;
- schema/build versions for reproducible derived output.

CURRENT AVAILABLE CONTRACT:
`packages/contracts` currently defines authoring resources and revisions. It does not define publication input, assets, Module IR, or render diagnostics.

PROPOSED CONTRACT:
Review the proposal in `docs/publishing-spike.md`. Promote a database-independent `PublishSnapshot` into `packages/contracts` only after Backend confirms revision and asset semantics. Keep source locations and diagnostics renderer-facing but shared enough for Preview/PDF consumers.

EXAMPLE PAYLOAD:
```json
{
  "schemaVersion": "publish-snapshot@0.1",
  "project": { "id": "fogbell", "title": "雾钟镇", "subtitle": "Fogbell Hamlet", "language": "zh-CN" },
  "documents": [{ "id": "chapter-01", "revision": 3, "title": "雾钟镇", "order": 1, "content": "# 第一章 | The First Bell\n..." }],
  "entities": [{ "id": "watcher-01", "type": "monster", "displayName": "雾钟守望者", "resolvedData": { "armorClass": 15 } }],
  "assets": [],
  "theme": { "id": "classic-fantasy", "version": "1" }
}
```

WHY:
Publisher must remain database-independent, preserve author source mapping, and make Preview/PDF share the same renderer. It must not query tables or guess entity identity from display names.

BLOCKING:
yes for production worker/API integration; no for the isolated technical spike.

TEMPORARY FIXTURE POSSIBLE:
yes; `packages/publisher/fixtures/fogbell.md` and the local snapshot are deterministic.

RETURN EXPECTED:
Lead Architect decision on field names/versioning, Backend confirmation of revision/asset resolver behavior, and approval to migrate the reviewed schemas into `packages/contracts`.
==============================
