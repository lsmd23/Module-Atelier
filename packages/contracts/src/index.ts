/**
 * Public entry point of `@module-atelier/contracts`.
 *
 * - `./domain.ts` holds the cross-module domain model (single source of truth).
 * - `./api.ts` holds the route-level request/response shapes for `/api`.
 *
 * Both are re-exported here so every consumer keeps importing the package root.
 */
export * from "./domain.ts";
export * from "./api.ts";

export const contractVersion = "0.2.0" as const;