/**
 * JSON helpers for the SQLite columns that hold JSON as TEXT.
 *
 * SQLite stores JSON in text columns guarded by `json_valid()` and `json_type()`
 * checks; the checks run in the database, these helpers read the value back
 * without ever handing a `null` or a half-parsed object to the domain.
 */

function parse(value: unknown, fallback: unknown): unknown {
  if (typeof value !== "string" || value.length === 0) {
    return fallback;
  }
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function parseJsonObject(value: unknown): Record<string, unknown> {
  const parsed = parse(value, {});
  return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

export function parseJsonArray(value: unknown): string[] {
  const parsed = parse(value, []);
  return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
}

/**
 * Stable serialization for comparing two JSON values.
 *
 * PostgreSQL's `jsonb` normalised key order, which let a SQL comparison decide
 * whether a write changed anything. SQLite keeps the text as written, so the
 * comparison happens here instead: keys are sorted recursively, which makes the
 * result independent of insertion order and of the storage engine.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`);
  return `{${entries.join(",")}}`;
}
