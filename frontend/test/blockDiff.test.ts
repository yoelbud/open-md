import { describe, expect, it } from "vitest";
import { diffBlocks, lcsHashes, summarizeDiff } from "../src/diff/blockDiff";
import { wordDiff } from "../src/diff/wordDiff";
import type { Block } from "../src/ipc/types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeBlocks(specs: { hash: number; kind?: string; source?: string }[]): Block[] {
  return specs.map((s, i) => ({
    id: `block-${i}`,
    kind: (s.kind ?? "paragraph") as Block["kind"],
    src_range: [0, 0] as [number, number],
    hash: s.hash,
    html: "",
    plain_html: "",
    source: s.source ?? `source-${s.hash}`,
  }));
}

// ── LCS tests ────────────────────────────────────────────────────────────────

describe("lcsHashes", () => {
  it("returns empty for empty inputs", () => {
    expect(lcsHashes([], [])).toEqual([]);
    expect(lcsHashes([1, 2, 3], [])).toEqual([]);
    expect(lcsHashes([], [1, 2, 3])).toEqual([]);
  });

  it("finds full match for identical sequences", () => {
    const result = lcsHashes([1, 2, 3], [1, 2, 3]);
    expect(result).toEqual([[0, 0], [1, 1], [2, 2]]);
  });

  it("finds LCS for sequences with insertions", () => {
    const result = lcsHashes([1, 2, 3], [1, 9, 2, 8, 3]);
    expect(result).toEqual([[0, 0], [1, 2], [2, 4]]);
  });

  it("finds LCS for sequences with deletions", () => {
    const result = lcsHashes([1, 9, 2, 8, 3], [1, 2, 3]);
    expect(result).toEqual([[0, 0], [2, 1], [4, 2]]);
  });

  it("handles no common elements", () => {
    expect(lcsHashes([1, 2, 3], [4, 5, 6])).toEqual([]);
  });

  it("handles single common element", () => {
    const result = lcsHashes([1, 2, 3], [4, 2, 5]);
    expect(result).toEqual([[1, 1]]);
  });

  it("handles duplicates correctly", () => {
    const result = lcsHashes([1, 1, 2], [1, 2, 1]);
    // LCS length should be 2
    expect(result.length).toBe(2);
  });
});

// ── diffBlocks tests ─────────────────────────────────────────────────────────

describe("diffBlocks", () => {
  it("identical documents → all unchanged", () => {
    const blocks = makeBlocks([{ hash: 1 }, { hash: 2 }, { hash: 3 }]);
    const result = diffBlocks(blocks, blocks);
    expect(result.every((e) => e.status === "unchanged")).toBe(true);
    expect(result.length).toBe(3);
  });

  it("empty old, non-empty new → all added", () => {
    const newBlocks = makeBlocks([{ hash: 1 }, { hash: 2 }]);
    const result = diffBlocks([], newBlocks);
    expect(result.length).toBe(2);
    expect(result.every((e) => e.status === "added")).toBe(true);
  });

  it("non-empty old, empty new → all removed", () => {
    const oldBlocks = makeBlocks([{ hash: 1 }, { hash: 2 }]);
    const result = diffBlocks(oldBlocks, []);
    expect(result.length).toBe(2);
    expect(result.every((e) => e.status === "removed")).toBe(true);
  });

  it("both empty → no entries", () => {
    const result = diffBlocks([], []);
    expect(result).toEqual([]);
  });

  it("pure insertion at end", () => {
    const oldBlocks = makeBlocks([{ hash: 1 }, { hash: 2 }]);
    const newBlocks = makeBlocks([{ hash: 1 }, { hash: 2 }, { hash: 3 }]);
    const result = diffBlocks(oldBlocks, newBlocks);
    const summary = summarizeDiff(result);
    expect(summary.unchanged).toBe(2);
    expect(summary.added).toBe(1);
    expect(summary.removed).toBe(0);
  });

  it("pure insertion at start", () => {
    const oldBlocks = makeBlocks([{ hash: 2 }, { hash: 3 }]);
    const newBlocks = makeBlocks([{ hash: 1 }, { hash: 2 }, { hash: 3 }]);
    const result = diffBlocks(oldBlocks, newBlocks);
    const summary = summarizeDiff(result);
    expect(summary.unchanged).toBe(2);
    expect(summary.added).toBe(1);
  });

  it("pure deletion", () => {
    const oldBlocks = makeBlocks([{ hash: 1 }, { hash: 2 }, { hash: 3 }]);
    const newBlocks = makeBlocks([{ hash: 1 }, { hash: 3 }]);
    const result = diffBlocks(oldBlocks, newBlocks);
    const summary = summarizeDiff(result);
    expect(summary.unchanged).toBe(2);
    expect(summary.removed).toBe(1);
  });

  it("modification (same kind, different hash at same position)", () => {
    const oldBlocks = makeBlocks([{ hash: 1 }, { hash: 2, kind: "paragraph" }, { hash: 3 }]);
    const newBlocks = makeBlocks([{ hash: 1 }, { hash: 99, kind: "paragraph" }, { hash: 3 }]);
    const result = diffBlocks(oldBlocks, newBlocks);
    const summary = summarizeDiff(result);
    expect(summary.unchanged).toBe(2);
    expect(summary.modified).toBe(1);
    const modified = result.find((e) => e.status === "modified");
    expect(modified?.oldIndex).toBe(1);
    expect(modified?.newIndex).toBe(1);
  });

  it("reorder → moved", () => {
    const oldBlocks = makeBlocks([{ hash: 1 }, { hash: 2 }, { hash: 3 }]);
    const newBlocks = makeBlocks([{ hash: 3 }, { hash: 1 }, { hash: 2 }]);
    const result = diffBlocks(oldBlocks, newBlocks);
    const summary = summarizeDiff(result);
    // LCS of [1,2,3] vs [3,1,2]: LCS is [1,2] (length 2), so 2 unchanged, 1 moved
    expect(summary.unchanged).toBe(2);
    expect(summary.moved).toBe(1);
  });

  it("complete reorder (reverse)", () => {
    const oldBlocks = makeBlocks([{ hash: 1 }, { hash: 2 }, { hash: 3 }]);
    const newBlocks = makeBlocks([{ hash: 3 }, { hash: 2 }, { hash: 1 }]);
    const result = diffBlocks(oldBlocks, newBlocks);
    const summary = summarizeDiff(result);
    // LCS of [1,2,3] vs [3,2,1]: length 1 (any single element), so 1 unchanged, 2 moved
    expect(summary.unchanged).toBe(1);
    expect(summary.moved).toBe(2);
  });

  it("mixed scenario: add + remove + modify + unchanged", () => {
    const oldBlocks = makeBlocks([
      { hash: 10 },
      { hash: 20, kind: "heading" },
      { hash: 30, kind: "paragraph" },
      { hash: 40 },
    ]);
    const newBlocks = makeBlocks([
      { hash: 10 },
      { hash: 25, kind: "heading" },
      { hash: 50, kind: "code" },
      { hash: 40 },
    ]);
    const result = diffBlocks(oldBlocks, newBlocks);
    const summary = summarizeDiff(result);
    expect(summary.unchanged).toBe(2); // hash 10, hash 40
    expect(summary.modified).toBeGreaterThanOrEqual(1); // hash 20→25 (same kind heading)
    // Total entries = old removed + new entries
    expect(summary.added + summary.removed + summary.modified + summary.moved + summary.unchanged).toBe(
      result.length,
    );
  });

  it("preserves oldBlock and newBlock references", () => {
    const oldBlocks = makeBlocks([{ hash: 1, source: "hello" }]);
    const newBlocks = makeBlocks([{ hash: 1, source: "hello" }]);
    const result = diffBlocks(oldBlocks, newBlocks);
    expect(result[0]!.oldBlock).toBe(oldBlocks[0]);
    expect(result[0]!.newBlock).toBe(newBlocks[0]);
  });

  it("handles duplicate hashes correctly", () => {
    const oldBlocks = makeBlocks([{ hash: 1 }, { hash: 1 }, { hash: 2 }]);
    const newBlocks = makeBlocks([{ hash: 1 }, { hash: 2 }, { hash: 1 }]);
    const result = diffBlocks(oldBlocks, newBlocks);
    const summary = summarizeDiff(result);
    // Should have at least 2 unchanged (LCS of [1,1,2] vs [1,2,1] is [1,2] length 2)
    expect(summary.unchanged).toBeGreaterThanOrEqual(2);
    expect(summary.removed + summary.added + summary.moved + summary.modified).toBeLessThanOrEqual(1);
  });
});

// ── summarizeDiff tests ──────────────────────────────────────────────────────

describe("summarizeDiff", () => {
  it("returns zero counts for empty input", () => {
    const summary = summarizeDiff([]);
    expect(summary).toEqual({ added: 0, removed: 0, modified: 0, moved: 0, unchanged: 0 });
  });

  it("counts correctly", () => {
    const entries = [
      { status: "added" as const, newIndex: 0 },
      { status: "added" as const, newIndex: 1 },
      { status: "removed" as const, oldIndex: 0 },
      { status: "modified" as const, oldIndex: 1, newIndex: 2 },
      { status: "unchanged" as const, oldIndex: 2, newIndex: 3 },
      { status: "moved" as const, oldIndex: 3, newIndex: 4 },
    ];
    const summary = summarizeDiff(entries);
    expect(summary.added).toBe(2);
    expect(summary.removed).toBe(1);
    expect(summary.modified).toBe(1);
    expect(summary.unchanged).toBe(1);
    expect(summary.moved).toBe(1);
  });
});

// ── wordDiff tests ───────────────────────────────────────────────────────────

describe("wordDiff", () => {
  it("returns empty for two empty strings", () => {
    expect(wordDiff("", "")).toEqual([]);
  });

  it("all added when old is empty", () => {
    const result = wordDiff("", "hello world");
    expect(result.every((t) => t.status === "added")).toBe(true);
    expect(result.map((t) => t.text).join("")).toBe("hello world");
  });

  it("all removed when new is empty", () => {
    const result = wordDiff("hello world", "");
    expect(result.every((t) => t.status === "removed")).toBe(true);
    expect(result.map((t) => t.text).join("")).toBe("hello world");
  });

  it("identical strings → all equal", () => {
    const result = wordDiff("the quick brown fox", "the quick brown fox");
    expect(result.every((t) => t.status === "equal")).toBe(true);
    expect(result.map((t) => t.text).join("")).toBe("the quick brown fox");
  });

  it("single word change", () => {
    const result = wordDiff("the quick brown fox", "the slow brown fox");
    const removed = result.filter((t) => t.status === "removed");
    const added = result.filter((t) => t.status === "added");
    expect(removed.some((t) => t.text === "quick")).toBe(true);
    expect(added.some((t) => t.text === "slow")).toBe(true);
  });

  it("insertion of words", () => {
    const result = wordDiff("hello world", "hello beautiful world");
    const added = result.filter((t) => t.status === "added");
    expect(added.some((t) => t.text === "beautiful")).toBe(true);
    const equal = result.filter((t) => t.status === "equal");
    expect(equal.some((t) => t.text === "hello")).toBe(true);
    expect(equal.some((t) => t.text === "world")).toBe(true);
  });

  it("deletion of words", () => {
    const result = wordDiff("hello beautiful world", "hello world");
    const removed = result.filter((t) => t.status === "removed");
    expect(removed.some((t) => t.text === "beautiful")).toBe(true);
  });

  it("reconstructs the correct text from tokens", () => {
    const result = wordDiff("the cat sat on the mat", "the dog sat on a mat");
    // Reconstructing old: equal + removed tokens
    const oldReconstructed = result
      .filter((t) => t.status === "equal" || t.status === "removed")
      .map((t) => t.text)
      .join("");
    expect(oldReconstructed).toBe("the cat sat on the mat");
    // Reconstructing new: equal + added tokens
    const newReconstructed = result
      .filter((t) => t.status === "equal" || t.status === "added")
      .map((t) => t.text)
      .join("");
    expect(newReconstructed).toBe("the dog sat on a mat");
  });
});
