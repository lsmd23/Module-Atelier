import type { Auth } from "./auth.ts";

/**
 * Login handle derived from the email address.
 *
 * The registration form only collects display name, email and password, so the
 * username is generated here. It stays readable (the local part, sanitised) and
 * is made unique with a short suffix when it is already taken.
 */

const fallbackBase = "author";

/**
 * Better Auth's default username validator accepts only these characters, so
 * every candidate generated here must stay inside the set: an invalid name is
 * rejected with 422 by the plugin, not by us.
 */
const usernamePattern = /^[a-zA-Z0-9_.]+$/;

function randomSuffix(length = 4): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let index = 0; index < length; index += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)] ?? "0";
  }
  return out;
}

export function usernameFromEmail(email: string): string {
  const localPart = email.split("@")[0] ?? "";
  const sanitised = localPart
    .toLowerCase()
    .replace(/[^a-z0-9_.]+/g, "")
    .replace(/^[._]+|[._]+$/g, "")
    .slice(0, 24);
  if (sanitised.length >= 3) {
    return sanitised;
  }
  return `${fallbackBase}${randomSuffix()}`;
}

/** Appends a suffix until Better Auth reports the name as free. */
export async function uniqueUsername(auth: Auth, base: string): Promise<string> {
  let candidate = base;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (usernamePattern.test(candidate)) {
      const result = await auth.api.isUsernameAvailable({ body: { username: candidate } });
      if (result.available === true) {
        return candidate;
      }
    }
    candidate = `${base}_${randomSuffix()}`;
  }
  return `${fallbackBase}${randomSuffix(8)}`;
}