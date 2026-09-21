import type { Suggestion } from "@module-atelier/contracts";

/**
 * 建议是否已过期：relevantRevisionMap 中任一资源的当前 revision
 * 已领先于建议生成时所基于的 revision。
 * 过期建议禁止 Apply（只能 Regenerate / Dismiss）。
 */
export function isSuggestionStale(
  suggestion: Suggestion,
  currentRevisions: ReadonlyMap<string, number>
): boolean {
  if (suggestion.status === "stale") return true;
  for (const [resourceId, baseRevision] of Object.entries(suggestion.relevantRevisionMap)) {
    const current = currentRevisions.get(resourceId);
    if (current !== undefined && current > baseRevision) return true;
  }
  return false;
}
