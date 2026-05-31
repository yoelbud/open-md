import { describe, expect, it } from "vitest";
import {
  buildLineOffsets,
  lineToOffset,
  offsetToLine,
  blockIndexAtOffset,
  scrollTopToOffset,
  offsetToScrollTop,
  blockIdToSourceOffset,
} from "../src/store/scrollSync";
import type { Block } from "../src/ipc/types";

const makeBlock = (id: string, start: number, end: number): Block => ({
  id,
  kind: "paragraph",
  src_range: [start, end],
  hash: 0,
  source: "",
  html: "",
  plain_html: "",
});

describe("buildLineOffsets", () => {
  it("returns [0] for empty text", () => {
    expect(buildLineOffsets("")).toEqual([0]);
  });

  it("returns correct offsets for multi-line text", () => {
    expect(buildLineOffsets("abc\ndef\nghi")).toEqual([0, 4, 8]);
  });

  it("handles trailing newline", () => {
    expect(buildLineOffsets("abc\n")).toEqual([0, 4]);
  });

  it("handles single line (no newlines)", () => {
    expect(buildLineOffsets("hello")).toEqual([0]);
  });
});

describe("lineToOffset", () => {
  it("returns 0 for empty offsets", () => {
    expect(lineToOffset([], 0)).toBe(0);
  });

  it("maps line 0 to offset 0", () => {
    expect(lineToOffset([0, 4, 8], 0)).toBe(0);
  });

  it("maps line 1 to offset 4", () => {
    expect(lineToOffset([0, 4, 8], 1)).toBe(4);
  });

  it("clamps negative line to 0", () => {
    expect(lineToOffset([0, 4, 8], -1)).toBe(0);
  });

  it("clamps line beyond range to last offset", () => {
    expect(lineToOffset([0, 4, 8], 100)).toBe(8);
  });
});

describe("offsetToLine", () => {
  it("returns 0 for empty offsets", () => {
    expect(offsetToLine([], 5)).toBe(0);
  });

  it("finds correct line for offset at line start", () => {
    expect(offsetToLine([0, 4, 8], 4)).toBe(1);
  });

  it("finds correct line for offset in middle of line", () => {
    expect(offsetToLine([0, 4, 8], 5)).toBe(1);
  });

  it("returns 0 for offset 0", () => {
    expect(offsetToLine([0, 4, 8], 0)).toBe(0);
  });

  it("returns last line for offset beyond text", () => {
    expect(offsetToLine([0, 4, 8], 100)).toBe(2);
  });

  it("clamps negative offset to line 0", () => {
    expect(offsetToLine([0, 4, 8], -5)).toBe(0);
  });
});

describe("blockIndexAtOffset", () => {
  const blocks = [
    makeBlock("a", 0, 10),
    makeBlock("b", 10, 25),
    makeBlock("c", 25, 40),
  ];

  it("returns -1 for empty blocks", () => {
    expect(blockIndexAtOffset([], 5)).toBe(-1);
  });

  it("finds block containing offset", () => {
    expect(blockIndexAtOffset(blocks, 0)).toBe(0);
    expect(blockIndexAtOffset(blocks, 9)).toBe(0);
    expect(blockIndexAtOffset(blocks, 10)).toBe(1);
    expect(blockIndexAtOffset(blocks, 25)).toBe(2);
    expect(blockIndexAtOffset(blocks, 39)).toBe(2);
  });

  it("returns last block for offset past end", () => {
    expect(blockIndexAtOffset(blocks, 40)).toBe(2);
    expect(blockIndexAtOffset(blocks, 100)).toBe(2);
  });

  it("returns 0 for offset before first block", () => {
    const gapped = [makeBlock("x", 5, 10)];
    expect(blockIndexAtOffset(gapped, 2)).toBe(0);
  });

  it("handles single block", () => {
    const single = [makeBlock("only", 0, 50)];
    expect(blockIndexAtOffset(single, 25)).toBe(0);
    expect(blockIndexAtOffset(single, 0)).toBe(0);
    expect(blockIndexAtOffset(single, 49)).toBe(0);
    expect(blockIndexAtOffset(single, 50)).toBe(0);
  });
});

describe("scrollTopToOffset", () => {
  const lineOffsets = [0, 10, 20, 30, 40]; // 5 lines, each 10 chars

  it("returns 0 when lineHeight is 0", () => {
    expect(scrollTopToOffset(100, 0, 0, lineOffsets)).toBe(0);
  });

  it("returns 0 when scrollTop is 0 (with padding)", () => {
    expect(scrollTopToOffset(0, 20, 14, lineOffsets)).toBe(0);
  });

  it("computes correct offset for scrolled textarea", () => {
    // scrollTop=34, padding=14, lineHeight=20 → adjustedScroll=20, topLine=1
    expect(scrollTopToOffset(34, 20, 14, lineOffsets)).toBe(10);
  });

  it("returns 0 for empty lineOffsets", () => {
    expect(scrollTopToOffset(100, 20, 0, [])).toBe(0);
  });
});

describe("offsetToScrollTop", () => {
  const lineOffsets = [0, 10, 20, 30];

  it("returns paddingTop for offset 0", () => {
    expect(offsetToScrollTop(0, 20, 14, lineOffsets)).toBe(14);
  });

  it("computes correct scrollTop for offset on line 2", () => {
    // offset 20 is line 2 → paddingTop + 2*lineHeight = 14 + 40 = 54
    expect(offsetToScrollTop(20, 20, 14, lineOffsets)).toBe(54);
  });
});

describe("blockIdToSourceOffset", () => {
  const blocks = [
    makeBlock("a", 0, 10),
    makeBlock("b", 10, 25),
    makeBlock("c", 25, 40),
  ];

  it("returns src_range[0] of the matching block", () => {
    expect(blockIdToSourceOffset(blocks, "b")).toBe(10);
  });

  it("returns 0 if block not found", () => {
    expect(blockIdToSourceOffset(blocks, "nonexistent")).toBe(0);
  });

  it("returns 0 for empty blocks", () => {
    expect(blockIdToSourceOffset([], "a")).toBe(0);
  });
});
