/**
 * In-process sliding-window rate limiting for the auth routes.
 *
 * Better Auth's own limiter guards its HTTP handler, which this API does not
 * mount: routes call `auth.api.*` directly, so the plugin-level limits never
 * see a request. The limits that matter for abuse (mailing codes to an address,
 * guessing a password) are therefore enforced here.
 *
 * State is per process, which matches the single-host deployment target: a
 * restart clears the windows, and there is no second instance to coordinate
 * with. A shared store can replace this behind the same interface later.
 */

export type RateLimitDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export type RateLimiter = {
  consume: (key: string) => RateLimitDecision;
  reset: (key?: string) => void;
};

export function createWindowRateLimiter(options: { windowSeconds: number; max: number }): RateLimiter {
  const hits = new Map<string, number[]>();
  const windowMs = options.windowSeconds * 1000;

  const pruneExpired = (key: string, now: number): number[] => {
    const recent = (hits.get(key) ?? []).filter((timestamp) => now - timestamp < windowMs);
    if (recent.length === 0) {
      hits.delete(key);
    } else {
      hits.set(key, recent);
    }
    return recent;
  };

  return {
    consume: (key) => {
      const now = Date.now();
      const recent = pruneExpired(key, now);
      if (recent.length >= options.max) {
        const oldest = recent[0] ?? now;
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000)) };
      }
      hits.set(key, [...recent, now]);
      return { allowed: true };
    },
    reset: (key) => {
      if (key === undefined) {
        hits.clear();
        return;
      }
      hits.delete(key);
    }
  };
}

/** Limits applied by the auth routes. */
export const authRateLimits = {
  /** Codes to one address: three per minute, matching the client's cooldown. */
  verificationCode: { windowSeconds: 60, max: 3 },
  /** Password guesses for one address: ten per minute. */
  login: { windowSeconds: 60, max: 10 },
  /** Reset requests for one address: three per minute. */
  passwordReset: { windowSeconds: 60, max: 3 }
} as const;

export type AuthRateLimiters = {
  verificationCode: RateLimiter;
  login: RateLimiter;
  passwordReset: RateLimiter;
};

export function createAuthRateLimiters(): AuthRateLimiters {
  return {
    verificationCode: createWindowRateLimiter(authRateLimits.verificationCode),
    login: createWindowRateLimiter(authRateLimits.login),
    passwordReset: createWindowRateLimiter(authRateLimits.passwordReset)
  };
}