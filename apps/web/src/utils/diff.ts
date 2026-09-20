/**
 * 简单行级 diff（LCS）。原型用于 Patch Review 的 update_document 预览。
 * 文档为章节级大小（数十至数百行），O(n·m) 可接受。
 */
export type DiffLine =
  | { type: "context"; text: string }
  | { type: "removed"; text: string }
  | { type: "added"; text: string };

export function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  const n = a.length;
  const m = b.length;

  // LCS 长度表
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: "context", text: a[i]! });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      out.push({ type: "removed", text: a[i]! });
      i++;
    } else {
      out.push({ type: "added", text: b[j]! });
      j++;
    }
  }
  while (i < n) out.push({ type: "removed", text: a[i++]! });
  while (j < m) out.push({ type: "added", text: b[j++]! });
  return out;
}
