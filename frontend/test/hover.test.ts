import { describe, it, expect } from "vitest";
import { lineOfOffset, useHoveredBlock, setHoveredBlock, clearHoveredBlock } from "../src/store/hover";

describe("lineOfOffset", () => {
  it("offset 0 → line 0", () => {
    expect(lineOfOffset("hello\nworld", 0)).toBe(0);
  });

  it("offset within first line → line 0", () => {
    expect(lineOfOffset("hello\nworld", 3)).toBe(0);
  });

  it("offset right after first newline → line 1", () => {
    expect(lineOfOffset("hello\nworld", 6)).toBe(1);
  });

  it("multi-line source mapping", () => {
    const src = "line0\nline1\nline2\nline3";
    expect(lineOfOffset(src, 12)).toBe(2); // offset 12 is 'l' in "line2"
    expect(lineOfOffset(src, 18)).toBe(3); // offset 18 is 'l' in "line3"
  });

  it("offset beyond length clamps to last line", () => {
    const src = "a\nb\nc";
    expect(lineOfOffset(src, 999)).toBe(2);
  });
});

describe("hover signal", () => {
  it("initial value is null", () => {
    // clear any prior state
    clearHoveredBlock();
    expect(useHoveredBlock()()).toBe(null);
  });

  it("set/clear updates the accessor", () => {
    setHoveredBlock("block-42");
    expect(useHoveredBlock()()).toBe("block-42");
    clearHoveredBlock();
    expect(useHoveredBlock()()).toBe(null);
  });
});
