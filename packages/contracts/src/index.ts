/**
 * Public entry point of `@module-atelier/contracts`.
 *
 * - `./domain.ts` holds the cross-module domain model (single source of truth).
 * - `./auth.ts` holds the account and session model.
 * - `./api.ts` holds the route-level request/response shapes for `/api`.
 *
 * All are re-exported here so every consumer keeps importing the package root.
 */
export * from "./domain.ts";
export * from "./auth.ts";
export * from "./api.ts";

export const contractVersion = "0.4.0" as const;