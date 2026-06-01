// Unit tests for sticky scroll pure helpers: headingTrail and indexOfBlockId.

import { describe, it, expect } from "vitest";
import { headingTrail, indexOfBlockId } from "../src/store/stickyScroll";
import type { Block } from "../src/ipc/types";

/** Helper to build a minimal Block fixture. */
const makeBlock = (
  id: string,
  kind: Block["kind"],
  source: string,
  startOffset: number,
): Block => ({
  id,
  kind,
  src_range: [startOffset, startOffset + source.length] as [number, number],
  hash: 0,
  source,
  html: "",
  plain_html: "",
});

describe("headingTrail", () => {
  it("returns [] for empty blocks", () => {
    expect(headingTrail([], 0)).toEqual([]);
  });

  it("returns [] when topIndex < 0", () => {
    const blocks = [makeBlock("a", "heading", "# Title", 0)];
    expect(headingTrail(blocks, -1)).toEqual([]);
  });

  it("returns [] when no headings exist before topIndex", () => {
    const blocks = [
      makeBlock("a", "paragraph", "Hello world", 0),
      makeBlock("b", "paragraph", "Another para", 12),
    ];
    expect(headingTrail(blocks, 1)).toEqual([]);
  });

  it("returns [H1] for a paragraph under a single H1", () => {
    const blocks = [
      makeBlock("h1", "heading", "# Intro", 0),
      makeBlock("p1", "paragraph", "Some text", 8),
    ];
    const trail = headingTrail(blocks, 1);
    expect(trail).toEqual([
      { id: "h1", level: 1, text: "Intro", sourceOffset: 0 },
    ]);
  });

  it("returns nested [H1, H2, H3] for paragraph at deepest level", () => {
    const blocks = [
      makeBlock("h1", "heading", "# A", 0),
      makeBlock("h2", "heading", "## B", 4),
      makeBlock("h3", "heading", "### C", 9),
      makeBlock("p1", "paragraph", "Deep content", 15),
    ];
    const trail = headingTrail(blocks, 3);
    expect(trail).toEqual([
      { id: "h1", level: 1, text: "A", sourceOffset: 0 },
      { id: "h2", level: 2, text: "B", sourceOffset: 4 },
      { id: "h3", level: 3, text: "C", sourceOffset: 9 },
    ]);
  });

  it("handles sibling pop: H1, H2a, H2b → paragraph under H2b gives [H1, H2b]", () => {
    const blocks = [
      makeBlock("h1", "heading", "# Root", 0),
      makeBlock("h2a", "heading", "## First", 7),
      makeBlock("p1", "paragraph", "Under first", 16),
      makeBlock("h2b", "heading", "## Second", 28),
      makeBlock("p2", "paragraph", "Under second", 38),
    ];
    const trail = headingTrail(blocks, 4);
    expect(trail).toEqual([
      { id: "h1", level: 1, text: "Root", sourceOffset: 0 },
      { id: "h2b", level: 2, text: "Second", sourceOffset: 28 },
    ]);
  });

  it("handles skipped level: H1 then H3 → [H1, H3]", () => {
    const blocks = [
      makeBlock("h1", "heading", "# Top", 0),
      makeBlock("h3", "heading", "### Deep", 6),
      makeBlock("p1", "paragraph", "Para", 15),
    ];
    const trail = headingTrail(blocks, 2);
    expect(trail).toEqual([
      { id: "h1", level: 1, text: "Top", sourceOffset: 0 },
      { id: "h3", level: 3, text: "Deep", sourceOffset: 6 },
    ]);
  });

  it("includes the heading itself when topIndex lands ON a heading", () => {
    const blocks = [
      makeBlock("h1", "heading", "# A", 0),
      makeBlock("h2", "heading", "## B", 4),
    ];
    const trail = headingTrail(blocks, 1);
    expect(trail).toEqual([
      { id: "h1", level: 1, text: "A", sourceOffset: 0 },
      { id: "h2", level: 2, text: "B", sourceOffset: 4 },
    ]);
  });

  it("returns [] when paragraph is before any heading", () => {
    const blocks = [
      makeBlock("p1", "paragraph", "First para", 0),
      makeBlock("h1", "heading", "# Later", 11),
    ];
    const trail = headingTrail(blocks, 0);
    expect(trail).toEqual([]);
  });
});

describe("indexOfBlockId", () => {
  const blocks = [
    makeBlock("a", "paragraph", "A", 0),
    makeBlock("b", "heading", "# B", 2),
    makeBlock("c", "paragraph", "C", 6),
  ];

  it("returns -1 for null id", () => {
    expect(indexOfBlockId(blocks, null)).toBe(-1);
  });

  it("returns -1 for non-existent id", () => {
    expect(indexOfBlockId(blocks, "zzz")).toBe(-1);
  });

  it("returns correct index for existing ids", () => {
    expect(indexOfBlockId(blocks, "a")).toBe(0);
    expect(indexOfBlockId(blocks, "b")).toBe(1);
    expect(indexOfBlockId(blocks, "c")).toBe(2);
  });

  it("returns -1 for empty blocks array", () => {
    expect(indexOfBlockId([], "a")).toBe(-1);
  });
});
