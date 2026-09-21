import type { FastifyRequest } from "fastify";
import type { Auth, SessionContext } from "./auth.ts";
import { readSession } from "./auth.ts";

/**
 * Resolves the session for a request lazily and remembers the answer for the
 * duration of that request, so a handler that asks twice only queries once and
 * routes that do not care about identity pay nothing.
 */
export function createSessionResolver(auth: Auth): (request: FastifyRequest) => Promise<SessionContext | null> {
  const perRequest = new WeakMap<FastifyRequest, SessionContext | null>();

  return async (request) => {
    if (perRequest.has(request)) {
      return perRequest.get(request) ?? null;
    }
    const session = await readSession(auth, request.headers);
    perRequest.set(request, session);
    return session;
  };
}

export type SessionResolver = ReturnType<typeof createSessionResolver>;