import { describe, it, expect } from "vitest";
import {
  refNameFromHref,
  citeKeyFromHref,
  resolveRefPreviewHtml,
  resolveCiteHtml,
  mathTexPreview,
} from "../src/panes/preview/hoverPreview";
import type { Block } from "../src/ipc/types";
import type { BibEntry } from "../src/store/citations";

describe("refNameFromHref", () => {
  it("extracts name from #ref-NAME", () => {
    expect(refNameFromHref("#ref-intro")).toBe("intro");
  });

  it("extracts hyphenated name", () => {
    expect(refNameFromHref("#ref-my-block_1")).toBe("my-block_1");
  });

  it("returns null for non-matching href", () => {
    expect(refNameFromHref("#cite-foo")).toBeNull();
    expect(refNameFromHref("#ref-")).toBeNull();
    expect(refNameFromHref(null)).toBeNull();
    expect(refNameFromHref("")).toBeNull();
  });
});

describe("citeKeyFromHref", () => {
  it("extracts key from #cite-KEY", () => {
    expect(citeKeyFromHref("#cite-knuth1984")).toBe("knuth1984");
  });

  it("returns null for non-matching href", () => {
    expect(citeKeyFromHref("#ref-foo")).toBeNull();
    expect(citeKeyFromHref(null)).toBeNull();
    expect(citeKeyFromHref("")).toBeNull();
  });
});

describe("resolveRefPreviewHtml", () => {
  const blocks: Block[] = [
    {
      id: "b1",
      kind: "paragraph",
      src_range: [0, 20],
      hash: 1,
      source: "Some intro text ^intro",
      html: "<p>Some intro text ^intro</p>",
      plain_html: "<p>Some intro text ^intro</p>",
    },
    {
      id: "b2",
      kind: "paragraph",
      src_range: [21, 40],
      hash: 2,
      source: "Another block",
      html: "<p>Another block</p>",
      plain_html: "<p>Another block</p>",
    },
  ];

  it("resolves a known anchor and strips the marker", () => {
    const result = resolveRefPreviewHtml(blocks, "intro");
    expect(result).not.toBeNull();
    // The anchor marker should be stripped
    expect(result).not.toContain("^intro");
    expect(result).toContain("Some intro text");
  });

  it("returns null for unknown anchor", () => {
    expect(resolveRefPreviewHtml(blocks, "nonexistent")).toBeNull();
  });
});

describe("resolveCiteHtml", () => {
  const bib = new Map<string, BibEntry>([
    [
      "knuth1984",
      {
        type: "book",
        key: "knuth1984",
        fields: {
          author: "Donald Knuth",
          year: "1984",
          title: "The TeXbook",
          publisher: "Addison-Wesley",
        },
      },
    ],
  ]);

  it("resolves a known citation key", () => {
    const result = resolveCiteHtml(bib, "knuth1984");
    expect(result).not.toBeNull();
    expect(result).toContain("Knuth");
    expect(result).toContain("1984");
    expect(result).toContain("TeXbook");
  });

  it("returns null for missing key", () => {
    expect(resolveCiteHtml(bib, "unknown2000")).toBeNull();
  });
});

describe("mathTexPreview", () => {
  it("trims whitespace from tex", () => {
    expect(mathTexPreview("  x^2 ")).toBe("x^2");
  });

  it("returns null for null input", () => {
    expect(mathTexPreview(null)).toBeNull();
  });

  it("returns null for empty/whitespace-only string", () => {
    expect(mathTexPreview("")).toBeNull();
    expect(mathTexPreview("   ")).toBeNull();
  });
});
