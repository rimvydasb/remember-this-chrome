export interface DiffLine {
  kind: 'same' | 'add' | 'del';
  text: string;
}

/**
 * The line diff from `before` to `after` (longest common subsequence). Removed lines come before
 * the added lines that replace them. Prompts are short, so the quadratic table is fine.
 */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before.split('\n');
  const b = after.split('\n');
  // common[i][j]: length of the LCS of a[i…] and b[j…].
  const common = Array.from({ length: a.length + 1 }, () => Array.from({ length: b.length + 1 }, () => 0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      common[i]![j] = a[i] === b[j] ? common[i + 1]![j + 1]! + 1 : Math.max(common[i + 1]![j]!, common[i]![j + 1]!);
    }
  }
  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      lines.push({ kind: 'same', text: a[i]! });
      i++;
      j++;
    } else if (j >= b.length || (i < a.length && common[i + 1]![j]! >= common[i]![j + 1]!)) {
      lines.push({ kind: 'del', text: a[i++]! });
    } else {
      lines.push({ kind: 'add', text: b[j++]! });
    }
  }
  return lines;
}
