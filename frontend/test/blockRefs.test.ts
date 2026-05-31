import { describe, expect, it } from "vitest";
import {
  parseAnchor,
  stripAnchor,
  buildAnchorMap,
  findRefTokens,
  replaceRefTokens,
  stripAnchorFromHtml,
} from "../src/panes/preview/blockRefs";
import type { Block } from "../src/ipc/types";

// ── Helper to build a minimal block ─────────────────────────────────────────
const block = (id: string, source: string): Block => ({
  id,
  kind: "paragraph",
  src_range: [0, source.length],
  hash: 0,
  source,
  html: `<p>${source}</p>`,
  plain_html: `<p>${source}</p>`,
});

// ── parseAnchor ──────────────────────────────────────────────────────────────
describe("parseAnchor", () => {
  it("extracts a trailing anchor name", () => {
    expect(parseAnchor("Hello world ^my-anchor")).toBe("my-anchor");
  });

  it("extracts anchor with underscores and digits", () => {
    expect(parseAnchor("Some text ^block_123")).toBe("block_123");
  });

  it("returns null when no anchor is present", () => {
    expect(parseAnchor("Hello world")).toBeNull();
  });

  it("returns null for invalid anchor chars (spaces)", () => {
    expect(parseAnchor("Hello ^invalid name")).toBeNull();
  });

  it("returns null for caret not preceded by space", () => {
    expect(parseAnchor("Hello^nospace")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseAnchor("")).toBeNull();
  });

  it("returns null for caret with no identifier", () => {
    expect(parseAnchor("text ^")).toBeNull();
  });

  it("handles anchor at very start after a space", () => {
    expect(parseAnchor(" ^start")).toBe("start");
  });
});

// ── stripAnchor ──────────────────────────────────────────────────────────────
describe("stripAnchor", () => {
  it("strips the trailing anchor marker", () => {
    expect(stripAnchor("Hello world ^my-anchor")).toBe("Hello world");
  });

  it("returns original when no anchor present", () => {
    expect(stripAnchor("Hello world")).toBe("Hello world");
  });

  it("strips only the last anchor", () => {
    expect(stripAnchor("A ^first then ^second")).toBe("A ^first then");
  });
});

// ── buildAnchorMap ───────────────────────────────────────────────────────────
describe("buildAnchorMap", () => {
  it("builds map from blocks with anchors", () => {
    const blocks = [
      block("b1", "First block ^alpha"),
      block("b2", "Second block ^beta"),
      block("b3", "No anchor here"),
    ];
    const map = buildAnchorMap(blocks);
    expect(map.get("alpha")).toBe("b1");
    expect(map.get("beta")).toBe("b2");
    expect(map.size).toBe(2);
  });

  it("first occurrence wins on duplicate anchor names", () => {
    const blocks = [
      block("b1", "First ^dup"),
      block("b2", "Second ^dup"),
    ];
    const map = buildAnchorMap(blocks);
    expect(map.get("dup")).toBe("b1");
    expect(map.size).toBe(1);
  });

  it("returns empty map for no anchors", () => {
    const blocks = [block("b1", "No anchors")];
    const map = buildAnchorMap(blocks);
    expect(map.size).toBe(0);
  });
});

// ── findRefTokens ────────────────────────────────────────────────────────────
describe("findRefTokens", () => {
  it("detects embed tokens", () => {
    const tokens = findRefTokens("See this: ![[^my-block]] for details");
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toEqual({ type: "embed", name: "my-block", raw: "![[^my-block]]" });
  });

  it("detects link tokens", () => {
    const tokens = findRefTokens("See [[^ref-1]] here");
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toEqual({ type: "link", name: "ref-1", raw: "[[^ref-1]]" });
  });

  it("detects multiple tokens of different types", () => {
    const tokens = findRefTokens("Link [[^a]] and embed ![[^b]] end");
    expect(tokens).toHaveLength(2);
    expect(tokens[0]!.type).toBe("link");
    expect(tokens[0]!.name).toBe("a");
    expect(tokens[1]!.type).toBe("embed");
    expect(tokens[1]!.name).toBe("b");
  });

  it("returns empty array when no tokens", () => {
    expect(findRefTokens("Just regular text")).toEqual([]);
  });

  it("ignores malformed tokens", () => {
    expect(findRefTokens("[[^]] or ![[^]]")).toEqual([]);
    expect(findRefTokens("[[no-caret]]")).toEqual([]);
  });
});

// ── replaceRefTokens ─────────────────────────────────────────────────────────
describe("replaceRefTokens", () => {
  const anchorMap = new Map([
    ["alpha", "b1"],
    ["beta", "b2"],
  ]);

  const resolver = (id: string): string | null => {
    if (id === "b1") return "<p>Alpha content</p>";
    if (id === "b2") return "<p>Beta content</p>";
    return null;
  };

  it("replaces embed token with transclusion div", () => {
    const result = replaceRefTokens("<p>Before ![[^alpha]] after</p>", anchorMap, resolver);
    expect(result).toContain('<div class="om-transclusion" data-om-ref="alpha">');
    expect(result).toContain("<p>Alpha content</p>");
    expect(result).toContain("</div>");
    expect(result).not.toContain("![[^alpha]]");
  });

  it("replaces link token with anchor element", () => {
    const result = replaceRefTokens("<p>See [[^alpha]]</p>", anchorMap, resolver);
    expect(result).toContain('<a class="om-ref-link" href="#ref-alpha">^alpha</a>');
    expect(result).not.toContain("[[^alpha]]");
  });

  it("renders missing placeholder for unresolved embed", () => {
    const result = replaceRefTokens("<p>![[^unknown]]</p>", anchorMap, resolver);
    expect(result).toContain('class="om-ref-missing"');
    expect(result).toContain("![[^unknown]]");
  });

  it("renders missing placeholder for unresolved link", () => {
    const result = replaceRefTokens("<p>[[^unknown]]</p>", anchorMap, resolver);
    expect(result).toContain('class="om-ref-missing"');
    expect(result).toContain("[[^unknown]]");
  });

  // ── Cycle detection ──
  it("detects self-embed cycle", () => {
    const selfMap = new Map([["self", "b1"]]);
    const selfResolver = (id: string): string | null => {
      if (id === "b1") return "<p>I embed myself ![[^self]]</p>";
      return null;
    };
    const result = replaceRefTokens("<p>![[^self]]</p>", selfMap, selfResolver);
    // The first embed resolves, but the nested one triggers cycle detection
    expect(result).toContain('class="om-transclusion"');
    expect(result).toContain('class="om-ref-cycle"');
    expect(result).toContain("circular: ^self");
  });

  it("detects indirect cycle (A→B→A)", () => {
    const cycleMap = new Map([
      ["a", "b1"],
      ["b", "b2"],
    ]);
    const cycleResolver = (id: string): string | null => {
      if (id === "b1") return "<p>A embeds B: ![[^b]]</p>";
      if (id === "b2") return "<p>B embeds A: ![[^a]]</p>";
      return null;
    };
    const result = replaceRefTokens("<p>Start: ![[^a]]</p>", cycleMap, cycleResolver);
    expect(result).toContain('class="om-transclusion"');
    expect(result).toContain('class="om-ref-cycle"');
    // Verify it's the ^a reference that triggers the cycle
    expect(result).toContain("circular: ^a");
  });

  it("resolves nested transclusions (non-cyclic)", () => {
    const nestedMap = new Map([
      ["outer", "b1"],
      ["inner", "b2"],
    ]);
    const nestedResolver = (id: string): string | null => {
      if (id === "b1") return "<p>Outer has ![[^inner]]</p>";
      if (id === "b2") return "<p>Inner content</p>";
      return null;
    };
    const result = replaceRefTokens("<p>![[^outer]]</p>", nestedMap, nestedResolver);
    expect(result).toContain("Inner content");
    expect(result).not.toContain("![[^inner]]");
  });
});

// ── stripAnchorFromHtml ──────────────────────────────────────────────────────
describe("stripAnchorFromHtml", () => {
  it("strips anchor from end of paragraph HTML", () => {
    const result = stripAnchorFromHtml("<p>Hello world ^my-anchor</p>");
    expect(result).toBe("<p>Hello world</p>");
  });

  it("does not strip anchors mid-text (only trailing before close tag)", () => {
    const result = stripAnchorFromHtml("<p>See ^middle then more</p>");
    // ^middle is not at end-before-close-tag, so preserved
    expect(result).toBe("<p>See ^middle then more</p>");
  });

  it("handles no anchor in HTML", () => {
    const result = stripAnchorFromHtml("<p>Normal text</p>");
    expect(result).toBe("<p>Normal text</p>");
  });

  it("strips anchor before closing heading tag", () => {
    const result = stripAnchorFromHtml("<h2>Title ^heading-ref</h2>");
    expect(result).toBe("<h2>Title</h2>");
  });
});
