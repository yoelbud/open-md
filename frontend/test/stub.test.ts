import { describe, expect, it } from "vitest";
import { parseDocument } from "../src/ipc/stub";

describe("parseDocument", () => {
  it("returns an empty block list for empty input", () => {
    const doc = parseDocument("");
    expect(doc.blocks).toEqual([]);
    expect(doc.path).toBe("(untitled).md");
  });

  it("uses the supplied path", () => {
    const doc = parseDocument("hi\n", "notes.md");
    expect(doc.path).toBe("notes.md");
  });

  it("classifies common block kinds", () => {
    const src = [
      "# Title",
      "",
      "A paragraph.",
      "",
      "- item one",
      "- item two",
      "",
      "```ts",
      "const x: number = 1;",
      "```",
      "",
      "> a quote",
      "",
      "---",
      "",
      "| a | b |",
      "| - | - |",
      "| 1 | 2 |",
      "",
      "- [x] done",
      "- [ ] todo",
      "",
    ].join("\n");

    const kinds = parseDocument(src).blocks.map((b) => b.kind);
    expect(kinds).toEqual([
      "heading",
      "paragraph",
      "list",
      "code",
      "block_quote",
      "thematic_break",
      "table",
      "task_list",
    ]);
  });

  it("produces deterministic hashes and ids for the same input", () => {
    const src = "# H\n\nbody text\n";
    const a = parseDocument(src);
    const b = parseDocument(src);
    expect(a.blocks.map((x) => x.hash)).toEqual(b.blocks.map((x) => x.hash));
    expect(a.blocks.map((x) => x.id)).toEqual(b.blocks.map((x) => x.id));
  });

  it("changes hashes only for blocks whose source changed", () => {
    const before = parseDocument("# H\n\nfirst\n\nsecond\n");
    const after = parseDocument("# H\n\nFIRST\n\nsecond\n");
    expect(before.blocks).toHaveLength(3);
    expect(after.blocks).toHaveLength(3);
    expect(before.blocks[0]!.hash).toBe(after.blocks[0]!.hash);
    expect(before.blocks[1]!.hash).not.toBe(after.blocks[1]!.hash);
    expect(before.blocks[2]!.hash).toBe(after.blocks[2]!.hash);
  });

  it("src_range slices reproduce the block source verbatim", () => {
    const src = "# H\n\npara one\n\npara two\n";
    const doc = parseDocument(src);
    for (const b of doc.blocks) {
      const [s, e] = b.src_range;
      expect(src.slice(s, e)).toBe(b.source);
    }
  });

  it("keeps fenced code blocks together even with blank lines inside", () => {
    const src = "```\nline 1\n\nline 3\n```\n\nafter\n";
    const doc = parseDocument(src);
    expect(doc.blocks).toHaveLength(2);
    expect(doc.blocks[0]!.kind).toBe("code");
    expect(doc.blocks[0]!.source).toContain("line 1");
    expect(doc.blocks[0]!.source).toContain("line 3");
    expect(doc.blocks[1]!.kind).toBe("paragraph");
  });

  it("renders inline emphasis, links, and code inside paragraphs", () => {
    const html = parseDocument("a **b** and *c* and `d` and [e](https://x)\n")
      .blocks[0]!.html;
    expect(html).toContain("<strong>b</strong>");
    expect(html).toContain("<em>c</em>");
    expect(html).toContain("<code>d</code>");
    expect(html).toContain('href="https://x"');
  });

  it("escapes HTML inside code blocks", () => {
    const html = parseDocument("```\n<script>\n```\n").blocks[0]!.html;
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("handles CRLF line endings", () => {
    const docLf = parseDocument("# H\n\nbody\n");
    const docCrlf = parseDocument("# H\r\n\r\nbody\r\n");
    expect(docCrlf.blocks.map((b) => b.kind)).toEqual(
      docLf.blocks.map((b) => b.kind),
    );
  });

  it("assigns unique ids across blocks", () => {
    const doc = parseDocument("# A\n\n# A\n\n# A\n");
    const ids = new Set(doc.blocks.map((b) => b.id));
    expect(ids.size).toBe(doc.blocks.length);
  });

  it("renders an inline image with src and alt", () => {
    const html = parseDocument("a ![cat](https://x/y.png) b\n").blocks[0]!.html;
    expect(html).toContain("<img ");
    expect(html).toContain('src="https://x/y.png"');
    expect(html).toContain('alt="cat"');
  });

  it("parses an image-only paragraph as an image block", () => {
    const doc = parseDocument("![cat](https://x/y.png)\n");
    expect(doc.blocks).toHaveLength(1);
    expect(doc.blocks[0]!.kind).toBe("image");
    expect(doc.blocks[0]!.html).toContain("om-img-wrap");
    expect(doc.blocks[0]!.html).toContain('src="https://x/y.png"');
  });

  it("applies =WxH size hints (px and %)", () => {
    const html1 = parseDocument("![a](u =300x200)\n").blocks[0]!.html;
    expect(html1).toMatch(/width:300px/);
    expect(html1).toMatch(/height:200px/);

    const html2 = parseDocument("![a](u =50%x)\n").blocks[0]!.html;
    expect(html2).toMatch(/width:50%/);
    expect(html2).not.toMatch(/height:/);

    const html3 = parseDocument("![a](u =x120)\n").blocks[0]!.html;
    expect(html3).toMatch(/height:120px/);
    expect(html3).not.toMatch(/width:/);
  });

  it("applies {.center} alignment on an image block", () => {
    const html = parseDocument("![a](u){.center}\n").blocks[0]!.html;
    expect(html).toContain("om-img-center");
  });

  it("supports image titles with quotes", () => {
    const html = parseDocument("![a](u \"hello\")\n").blocks[0]!.html;
    expect(html).toContain('title="hello"');
  });

  it("escapes alt text safely", () => {
    const html = parseDocument("![<script>](u)\n").blocks[0]!.html;
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
