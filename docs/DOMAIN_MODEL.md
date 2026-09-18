# Domain model

The canonical cross-module model is defined in `packages/contracts/src/index.ts`: Project, Document, Entity, Relation, Revision, PatchSet, Suggestion, AuthorQuestion, and Conflict. Documents and entities are revisioned resources. A write carries `baseRevision`; mismatches return `CONFLICT` and never overwrite newer data.

Entity status distinguishes confirmed canon, draft, rumor, character belief, conditional fact, and intentional ambiguity.
