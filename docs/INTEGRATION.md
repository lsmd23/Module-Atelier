# Integration

Frontend will consume backend REST/SSE routes once BE-001 proposes them. Both sides must import `@module-atelier/contracts`; they must not duplicate PatchSet or revision types.

Agent work depends on Entity, Document, Suggestion, AuthorQuestion, and PatchSet schemas. Publisher will later consume a database-independent Module IR; no IR exists yet.

Current blockers: route-level API envelope, auth boundary, and persistence identifiers are pending BE-001. No downstream agent should invent incompatible versions before that review.
