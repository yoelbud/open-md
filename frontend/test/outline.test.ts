import { describe, expect, it } from "vitest";
import type { Block } from "../src/ipc/types";
import {
  extractHeadings,
  isTocToken,
  parseHeadingLevel,
  parseHeadingText,
  renderTocHtml,
  slugify,
} from "../src/store/outline";

const block = (over: Partial<Block>): Block => ({
  id: over.id ?? "b1",
  kind: over.kind ?? "paragraph",
  src_range: over.src_range ?? [0, 0],
  hash: over.hash ?? 0,
  source: over.source ?? "",
  html: over.html ?? "",
  plain_html: over.plain_html ?? "",
});

describe("parseHeadingLevel", () => {
  it("counts leading hashes", () => {
    expect(parseHeadingLevel("# A")).toBe(1);
    expect(parseHeadingLevel("### A")).toBe(3);
    expect(parseHeadingLevel("###### A")).toBe(6);
  });

  it("defaults to 1 when no marker is present", () => {
    expect(parseHeadingLevel("no marker")).toBe(1);
  });
});

describe("parseHeadingText", () => {
  it("strips the leading marker and trailing whitespace", () => {
    expect(parseHeadingText("## Title  \n")).toBe("Title");
  });
});

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("drops punctuation and collapses dashes", () => {
    expect(slugify("A, B & C!")).toBe("a-b-c");
  });
});

describe("extractHeadings", () => {
  it("returns only heading blocks in order with parsed metadata", () => {
    const blocks: Block[] = [
      block({ id: "h1", kind: "heading", source: "# One", src_range: [0, 5] }),
      block({ id: "p1", kind: "paragraph", source: "text" }),
      block({ id: "h2", kind: "heading", source: "## Two", src_range: [6, 12] }),
    ];
    const headings = extractHeadings(blocks);
    expect(headings).toHaveLength(2);
    expect(headings[0]).toMatchObject({ id: "h1", level: 1, text: "One", sourceOffset: 0 });
    expect(headings[1]).toMatchObject({ id: "h2", level: 2, text: "Two", sourceOffset: 6 });
  });
});

describe("isTocToken", () => {
  it("detects a paragraph that is exactly [TOC]", () => {
    expect(isTocToken(block({ kind: "paragraph", source: "[TOC]" }))).toBe(true);
    expect(isTocToken(block({ kind: "paragraph", source: "  [TOC]  " }))).toBe(true);
  });

  it("rejects non-paragraph or non-matching blocks", () => {
    expect(isTocToken(block({ kind: "heading", source: "[TOC]" }))).toBe(false);
    expect(isTocToken(block({ kind: "paragraph", source: "see [TOC] below" }))).toBe(false);
  });
});

describe("renderTocHtml", () => {
  it("renders a fallback when there are no headings", () => {
    expect(renderTocHtml([])).toContain("empty table of contents");
  });

  it("renders anchor links and escapes text", () => {
    const html = renderTocHtml([
      { id: "h1", level: 1, text: "A <b>", sourceOffset: 0, slug: "a-b" },
    ]);
    expect(html).toContain('href="#heading-h1"');
    expect(html).toContain("A &lt;b&gt;");
    expect(html).toContain("om-toc");
  });
});
