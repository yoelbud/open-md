// Pure block-level diff algorithm.
// Uses stable per-block xxh3_64 hashes as identity for fast O(n*m) LCS matching.

import type { Block } from "../ipc/types";

export type DiffStatus = "added" | "removed" | "modified" | "unchanged" | "moved";

export interface BlockDiffEntry {
  status: DiffStatus;
  oldIndex?: number | undefined;
  newIndex?: number | undefined;
  oldBlock?: Block | undefined;
  newBlock?: Block | undefined;
}

// ── LCS over hash sequences ──────────────────────────────────────────────────

/**
 * Compute the longest common subsequence of two number arrays.
 * Returns an array of [oldIndex, newIndex] pairs representing matched positions.
 */
export function lcsHashes(oldHashes: number[], newHashes: number[]): [number, number][] {
  const m = oldHashes.length;
  const n = newHashes.length;
  if (m === 0 || n === 0) return [];

  // Standard DP table (space: O(m*n))
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldHashes[i - 1] === newHashes[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]! + 1;
      } else {
        dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
      }
    }
  }

  // Backtrack to find the actual subsequence
  const result: [number, number][] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (oldHashes[i - 1] === newHashes[j - 1]) {
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

// ── Main diff function ───────────────────────────────────────────────────────

/**
 * Compute a block-level diff between two document states.
 *
 * Algorithm:
 * 1. Run LCS on hash sequences to identify unchanged blocks (same hash, same relative order).
 * 2. Blocks with same hash but NOT in LCS (reordered) → "moved".
 * 3. Within unmatched gaps, pair blocks by same kind at same offset position → "modified".
 * 4. Remaining unmatched old blocks → "removed"; remaining unmatched new blocks → "added".
 */
export function diffBlocks(oldBlocks: Block[], newBlocks: Block[]): BlockDiffEntry[] {
  const oldHashes = oldBlocks.map((b) => b.hash);
  const newHashes = newBlocks.map((b) => b.hash);

  // Step 1: LCS gives us "unchanged" pairs (same hash, preserved order)
  const lcs = lcsHashes(oldHashes, newHashes);
  const lcsOldSet = new Set(lcs.map(([oi]) => oi));
  const lcsNewSet = new Set(lcs.map(([, ni]) => ni));

  // Step 2: Identify moved blocks — same hash exists in both but not in LCS
  // Build a multi-map of hash → indices for unmatched blocks
  const unmatchedOldByHash = new Map<number, number[]>();
  for (let i = 0; i < oldBlocks.length; i++) {
    if (lcsOldSet.has(i)) continue;
    const h = oldHashes[i]!;
    const arr = unmatchedOldByHash.get(h);
    if (arr) arr.push(i);
    else unmatchedOldByHash.set(h, [i]);
  }

  const movedOldIndices = new Set<number>();
  const movedNewIndices = new Set<number>();

  for (let j = 0; j < newBlocks.length; j++) {
    if (lcsNewSet.has(j)) continue;
    const h = newHashes[j]!;
    const candidates = unmatchedOldByHash.get(h);
    if (candidates && candidates.length > 0) {
      const oi = candidates.shift()!;
      movedOldIndices.add(oi);
      movedNewIndices.add(j);
      if (candidates.length === 0) unmatchedOldByHash.delete(h);
    }
  }

  // Step 3: Within remaining unmatched gaps, try to pair by kind → "modified"
  // Collect truly unmatched indices
  const remainingOld: number[] = [];
  for (let i = 0; i < oldBlocks.length; i++) {
    if (!lcsOldSet.has(i) && !movedOldIndices.has(i)) remainingOld.push(i);
  }
  const remainingNew: number[] = [];
  for (let j = 0; j < newBlocks.length; j++) {
    if (!lcsNewSet.has(j) && !movedNewIndices.has(j)) remainingNew.push(j);
  }

  // Pair by position within the remaining sets where kind matches
  const modifiedPairs: [number, number][] = [];
  const pairedOld = new Set<number>();
  const pairedNew = new Set<number>();

  // Simple greedy: walk both remaining arrays and pair same-kind blocks
  let ri = 0;
  let rj = 0;
  while (ri < remainingOld.length && rj < remainingNew.length) {
    const oi = remainingOld[ri]!;
    const nj = remainingNew[rj]!;
    if (oldBlocks[oi]!.kind === newBlocks[nj]!.kind) {
      modifiedPairs.push([oi, nj]);
      pairedOld.add(oi);
      pairedNew.add(nj);
      ri++;
      rj++;
    } else {
      // Advance whichever side has more remaining to try
      if (remainingOld.length - ri > remainingNew.length - rj) {
        ri++;
      } else {
        rj++;
      }
    }
  }

  // Step 4: Build the output
  const result: BlockDiffEntry[] = [];

  // We'll walk through both sequences in order, emitting entries
  // Use a merged timeline approach for clean output ordering:
  // - LCS entries in order (unchanged)
  // - Moved, modified, added, removed fill the gaps

  // Mark every index with its classification
  const oldClassification = new Array<"unchanged" | "moved" | "modified" | "removed">(oldBlocks.length);
  const newClassification = new Array<"unchanged" | "moved" | "modified" | "added">(newBlocks.length);

  for (const [oi] of lcs) oldClassification[oi] = "unchanged";
  for (const oi of movedOldIndices) oldClassification[oi] = "moved";
  for (const oi of pairedOld) oldClassification[oi] = "modified";
  for (let i = 0; i < oldBlocks.length; i++) {
    if (!oldClassification[i]) oldClassification[i] = "removed";
  }

  for (const [, ni] of lcs) newClassification[ni] = "unchanged";
  for (const ni of movedNewIndices) newClassification[ni] = "moved";
  for (const ni of pairedNew) newClassification[ni] = "modified";
  for (let j = 0; j < newBlocks.length; j++) {
    if (!newClassification[j]) newClassification[j] = "added";
  }

  // Build mappings for paired items
  const lcsOldToNew = new Map(lcs);
  const movedOldToNew = new Map<number, number>();
  // Rebuild moved pairs
  {
    const tempByHash = new Map<number, number[]>();
    for (let i = 0; i < oldBlocks.length; i++) {
      if (movedOldIndices.has(i)) {
        const h = oldHashes[i]!;
        const arr = tempByHash.get(h);
        if (arr) arr.push(i);
        else tempByHash.set(h, [i]);
      }
    }
    for (let j = 0; j < newBlocks.length; j++) {
      if (movedNewIndices.has(j)) {
        const h = newHashes[j]!;
        const arr = tempByHash.get(h);
        if (arr && arr.length > 0) {
          movedOldToNew.set(arr.shift()!, j);
        }
      }
    }
  }

  const modifiedOldToNew = new Map(modifiedPairs);

  // Emit: walk new sequence, interleave removed from old
  // Strategy: produce entries ordered by new-sequence position,
  // with removed blocks appearing at their relative position from old.

  // Simpler: emit all entries grouped logically
  // First pass: emit removed blocks (not in new)
  for (let i = 0; i < oldBlocks.length; i++) {
    if (oldClassification[i] === "removed") {
      result.push({
        status: "removed",
        oldIndex: i,
        oldBlock: oldBlocks[i]!,
      });
    }
  }

  // Second pass: emit new-side entries in order
  for (let j = 0; j < newBlocks.length; j++) {
    const cls = newClassification[j]!;
    switch (cls) {
      case "unchanged": {
        // Find the old index from LCS
        const oi = [...lcsOldToNew.entries()].find(([, ni]) => ni === j)?.[0];
        result.push({
          status: "unchanged",
          oldIndex: oi,
          newIndex: j,
          oldBlock: oi !== undefined ? oldBlocks[oi]! : undefined,
          newBlock: newBlocks[j]!,
        });
        break;
      }
      case "moved": {
        const oi = [...movedOldToNew.entries()].find(([, ni]) => ni === j)?.[0];
        result.push({
          status: "moved",
          oldIndex: oi,
          newIndex: j,
          oldBlock: oi !== undefined ? oldBlocks[oi]! : undefined,
          newBlock: newBlocks[j]!,
        });
        break;
      }
      case "modified": {
        const oi = [...modifiedOldToNew.entries()].find(([, ni]) => ni === j)?.[0];
        result.push({
          status: "modified",
          oldIndex: oi,
          newIndex: j,
          oldBlock: oi !== undefined ? oldBlocks[oi]! : undefined,
          newBlock: newBlocks[j]!,
        });
        break;
      }
      case "added": {
        result.push({
          status: "added",
          newIndex: j,
          newBlock: newBlocks[j]!,
        });
        break;
      }
    }
  }

  return result;
}

// ── Summary helper ───────────────────────────────────────────────────────────

export interface DiffSummary {
  added: number;
  removed: number;
  modified: number;
  moved: number;
  unchanged: number;
}

export function summarizeDiff(entries: BlockDiffEntry[]): DiffSummary {
  const summary: DiffSummary = { added: 0, removed: 0, modified: 0, moved: 0, unchanged: 0 };
  for (const entry of entries) {
    summary[entry.status]++;
  }
  return summary;
}
