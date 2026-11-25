export interface SideBySideDiffRow {
  leftLineNumber: number | null;
  rightLineNumber: number | null;
  leftText: string;
  rightText: string;
  type: 'unchanged' | 'added' | 'removed' | 'modified';
}

export interface LineDiffResult {
  rows: SideBySideDiffRow[];
  addedCount: number;
  removedCount: number;
  unchangedCount: number;
}

/**
 * Computes an aligned side-by-side line diff between an older snapshot (left)
 * and a newer/comparison snapshot (right) using Longest Common Subsequence.
 */
export function computeSideBySideDiff(leftContent: string, rightContent: string): LineDiffResult {
  const leftLines = leftContent.replace(/\r\n/g, '\n').split('\n');
  const rightLines = rightContent.replace(/\r\n/g, '\n').split('\n');
  const m = leftLines.length;
  const n = rightLines.length;

  // Build LCS DP table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (leftLines[i] === rightLines[j]) {
        dp[i][j] = 1 + dp[i + 1][j + 1];
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  type Op =
    | { kind: 'same'; leftIdx: number; rightIdx: number }
    | { kind: 'del'; leftIdx: number }
    | { kind: 'ins'; rightIdx: number };

  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (leftLines[i] === rightLines[j]) {
      ops.push({ kind: 'same', leftIdx: i, rightIdx: j });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ kind: 'del', leftIdx: i });
      i += 1;
    } else {
      ops.push({ kind: 'ins', rightIdx: j });
      j += 1;
    }
  }
  while (i < m) {
    ops.push({ kind: 'del', leftIdx: i });
    i += 1;
  }
  while (j < n) {
    ops.push({ kind: 'ins', rightIdx: j });
    j += 1;
  }

  // Pair adjacent delete/insert runs into clean side-by-side rows
  const rows: SideBySideDiffRow[] = [];
  let addedCount = 0;
  let removedCount = 0;
  let unchangedCount = 0;

  let k = 0;
  while (k < ops.length) {
    const op = ops[k];
    if (op.kind === 'same') {
      rows.push({
        leftLineNumber: op.leftIdx + 1,
        rightLineNumber: op.rightIdx + 1,
        leftText: leftLines[op.leftIdx],
        rightText: rightLines[op.rightIdx],
        type: 'unchanged',
      });
      unchangedCount += 1;
      k += 1;
      continue;
    }

    const dels: number[] = [];
    const ins: number[] = [];
    while (k < ops.length && ops[k].kind !== 'same') {
      const curr = ops[k];
      if (curr.kind === 'del') dels.push(curr.leftIdx);
      else if (curr.kind === 'ins') ins.push(curr.rightIdx);
      k += 1;
    }

    const maxRun = Math.max(dels.length, ins.length);
    for (let r = 0; r < maxRun; r++) {
      const hasLeft = r < dels.length;
      const hasRight = r < ins.length;
      if (hasLeft && hasRight) {
        removedCount += 1;
        addedCount += 1;
        rows.push({
          leftLineNumber: dels[r] + 1,
          rightLineNumber: ins[r] + 1,
          leftText: leftLines[dels[r]],
          rightText: rightLines[ins[r]],
          type: 'modified',
        });
      } else if (hasLeft) {
        removedCount += 1;
        rows.push({
          leftLineNumber: dels[r] + 1,
          rightLineNumber: null,
          leftText: leftLines[dels[r]],
          rightText: '',
          type: 'removed',
        });
      } else if (hasRight) {
        addedCount += 1;
        rows.push({
          leftLineNumber: null,
          rightLineNumber: ins[r] + 1,
          leftText: '',
          rightText: rightLines[ins[r]],
          type: 'added',
        });
      }
    }
  }

  return { rows, addedCount, removedCount, unchangedCount };
}
