/**
 * Public entry point of `@module-atelier/db`: the local storage layer.
 *
 * There is one storage layer, and it is SQLite (see `docs/STORAGE.md`): an
 * app-level database for accounts, sessions, settings and the indexes, plus one
 * database file per project. The PostgreSQL layer was removed with the switch,
 * so nothing here pulls a server dependency into a locally installed app.
 */
export * from "./schema-sqlite.ts";
export * from "./schema-app.ts";
export * from "./sqlite.ts";
export * from "./app-database.ts";
export * from "./data-directory.ts";
export * from "./registry.ts";
export * from "./transaction.ts";
