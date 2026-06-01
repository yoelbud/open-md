// Word-level inline diff for modified blocks.
// Simple LCS over word tokens for rendering additions/removals within a block.

export type WordToken = {
  text: string;
  status: "equal" | "added" | "removed";
};

/**
 * Split text into words (preserving whitespace as separate tokens for clean rendering).
 */
function tokenize(text: string): string[] {
  // Split on word boundaries, keeping whitespace runs as tokens
  const tokens: string[] = [];
  const re = /(\s+|\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    tokens.push(match[1]!);
  }
  return tokens;
}

/**
 * LCS over string arrays — returns matched index pairs.
 */
function lcsStrings(a: string[], b: string[]): [number, number][] {
  const m = a.length;
  const n = b.length;
  if (m === 0 || n === 0) return [];

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]! + 1;
      } else {
        dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
      }
    }
  }

  const result: [number, number][] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.push([i - 1, j - 1]);
      i--;
      j--;
    } else if (dp[i - 1]![j]! >= dp[i]![j - 1]!) {
      i--;
    } else {
      j--;
    }
  }
  result.reverse();
  return result;
}

/**
 * Compute a word-level diff between two strings.
 * Returns tokens annotated with equal/added/removed status.
 */
export function wordDiff(oldText: string, newText: string): WordToken[] {
  const oldTokens = tokenize(oldText);
  const newTokens = tokenize(newText);

  if (oldTokens.length === 0 && newTokens.length === 0) return [];
  if (oldTokens.length === 0) {
    return newTokens.map((text) => ({ text, status: "added" as const }));
  }
  if (newTokens.length === 0) {
    return oldTokens.map((text) => ({ text, status: "removed" as const }));
  }

  const lcs = lcsStrings(oldTokens, newTokens);
  const matchedOld = new Set(lcs.map(([oi]) => oi));
  const matchedNew = new Set(lcs.map(([, ni]) => ni));

  const result: WordToken[] = [];

  // Walk through both sequences, emitting tokens in order
  let oi = 0;
  let ni = 0;
  let li = 0; // index into lcs

  while (li < lcs.length) {
    const [lcsOi, lcsNi] = lcs[li]!;

    // Emit removed tokens before this LCS match
    while (oi < lcsOi) {
      if (!matchedOld.has(oi)) {
        result.push({ text: oldTokens[oi]!, status: "removed" });
      }
      oi++;
    }

    // Emit added tokens before this LCS match
    while (ni < lcsNi) {
      if (!matchedNew.has(ni)) {
        result.push({ text: newTokens[ni]!, status: "added" });
      }
      ni++;
    }

    // Emit the matched token
    result.push({ text: newTokens[lcsNi]!, status: "equal" });
    oi++;
    ni++;
    li++;
  }

  // Emit remaining tokens after last LCS match
  while (oi < oldTokens.length) {
    result.push({ text: oldTokens[oi]!, status: "removed" });
    oi++;
  }
  while (ni < newTokens.length) {
    result.push({ text: newTokens[ni]!, status: "added" });
    ni++;
  }

  return result;
}
