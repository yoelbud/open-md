import { describe, expect, it } from "vitest";
import { buildDocx, tokenizeInline } from "../src/export/docx";
import type { Block } from "../src/ipc/types";

// Helper: decode a stored ZIP entry by name (no decompression needed — store-only)
const extractEntry = (zip: Uint8Array, name: string): string | null => {
  const view = new DataView(zip.buffer, zip.byteOffset);
  let pos = 0;
  const enc = new TextEncoder();
  const nameBytes = enc.encode(name);

  while (pos < zip.length - 4) {
    const sig = view.getUint32(pos, true);
    if (sig !== 0x04034b50) break; // Not a local header

    const nameLen = view.getUint16(pos + 26, true);
    const extraLen = view.getUint16(pos + 28, true);
    const compSize = view.getUint32(pos + 18, true);
    const entryName = zip.slice(pos + 30, pos + 30 + nameLen);

    if (entryName.length === nameBytes.length && entryName.every((b, i) => b === nameBytes[i])) {
      const dataStart = pos + 30 + nameLen + extraLen;
      return new TextDecoder().decode(zip.slice(dataStart, dataStart + compSize));
    }

    pos = pos + 30 + nameLen + extraLen + compSize;
  }
  return null;
};

const makeBlock = (kind: Block["kind"], source: string, preview?: Block["preview"] | undefined): Block => ({
  id: "test-id",
  kind,
  src_range: [0, source.length],
  hash: 0,
  source,
  html: "",
  plain_html: "",
  ...(preview !== undefined ? { preview } : {}),
});

describe("docx", () => {
  describe("tokenizeInline", () => {
    it("returns plain text as a single run", () => {
      const runs = tokenizeInline("hello world");
      expect(runs).toHaveLength(1);
      expect(runs[0]!.text).toBe("hello world");
    });

    it("parses bold **text**", () => {
      const runs = tokenizeInline("a **bold** b");
      expect(runs.some((r) => r.bold && r.text === "bold")).toBe(true);
    });

    it("parses italic *text*", () => {
      const runs = tokenizeInline("a *italic* b");
      expect(runs.some((r) => r.italic && r.text === "italic")).toBe(true);
    });

    it("parses inline code `text`", () => {
      const runs = tokenizeInline("a `code` b");
      expect(runs.some((r) => r.code && r.text === "code")).toBe(true);
    });

    it("parses strikethrough ~~text~~", () => {
      const runs = tokenizeInline("a ~~strike~~ b");
      expect(runs.some((r) => r.strike && r.text === "strike")).toBe(true);
    });

    it("handles bold+italic ***text***", () => {
      const runs = tokenizeInline("***both***");
      expect(runs.some((r) => r.bold && r.italic && r.text === "both")).toBe(true);
    });

    it("handles nested bold inside strikethrough", () => {
      const runs = tokenizeInline("~~**nested**~~");
      expect(runs.some((r) => r.strike && r.bold && r.text === "nested")).toBe(true);
    });
  });

  describe("buildDocx", () => {
    it("returns a Uint8Array starting with PK signature", () => {
      const result = buildDocx([]);
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result[0]).toBe(0x50);
      expect(result[1]).toBe(0x4b);
    });

    it("contains all 5 required OOXML parts", () => {
      const result = buildDocx([]);
      const required = [
        "[Content_Types].xml",
        "_rels/.rels",
        "word/document.xml",
        "word/_rels/document.xml.rels",
        "word/styles.xml",
      ];
      for (const name of required) {
        const content = extractEntry(result, name);
        expect(content, `missing entry: ${name}`).not.toBeNull();
      }
    });

    it("generates Heading1 style for a heading block", () => {
      const blocks = [makeBlock("heading", "# Hello World")];
      const result = buildDocx(blocks);
      const docXml = extractEntry(result, "word/document.xml")!;
      expect(docXml).toContain('<w:pStyle w:val="Heading1"/>');
      expect(docXml).toContain("Hello World");
    });

    it("generates Heading3 style for ### heading", () => {
      const blocks = [makeBlock("heading", "### Third Level")];
      const result = buildDocx(blocks);
      const docXml = extractEntry(result, "word/document.xml")!;
      expect(docXml).toContain('<w:pStyle w:val="Heading3"/>');
    });

    it("renders bold runs with <w:b/>", () => {
      const blocks = [makeBlock("paragraph", "This is **bold** text")];
      const result = buildDocx(blocks);
      const docXml = extractEntry(result, "word/document.xml")!;
      expect(docXml).toContain("<w:b/>");
      expect(docXml).toContain("bold");
    });

    it("renders italic runs with <w:i/>", () => {
      const blocks = [makeBlock("paragraph", "This is *italic* text")];
      const result = buildDocx(blocks);
      const docXml = extractEntry(result, "word/document.xml")!;
      expect(docXml).toContain("<w:i/>");
    });

    it("generates a <w:tbl> for table blocks", () => {
      const blocks = [makeBlock("table", "| A | B |\n|---|---|\n| 1 | 2 |", {
        table: { headers: ["A", "B"], alignments: ["default", "default"], rows: [["1", "2"]] },
      })];
      const result = buildDocx(blocks);
      const docXml = extractEntry(result, "word/document.xml")!;
      expect(docXml).toContain("<w:tbl>");
      expect(docXml).toContain("<w:tr>");
      expect(docXml).toContain("<w:tc>");
    });

    it("generates Code style for code blocks", () => {
      const blocks = [makeBlock("code", "```js\nconst x = 1;\n```")];
      const result = buildDocx(blocks);
      const docXml = extractEntry(result, "word/document.xml")!;
      expect(docXml).toContain('<w:pStyle w:val="Code"/>');
      expect(docXml).toContain("const x = 1;");
    });

    it("generates Quote style for block_quote", () => {
      const blocks = [makeBlock("block_quote", "> Something wise")];
      const result = buildDocx(blocks);
      const docXml = extractEntry(result, "word/document.xml")!;
      expect(docXml).toContain('<w:pStyle w:val="Quote"/>');
      expect(docXml).toContain("Something wise");
    });

    it("escapes XML special characters", () => {
      const blocks = [makeBlock("paragraph", "A < B & C > D \"E\"")];
      const result = buildDocx(blocks);
      const docXml = extractEntry(result, "word/document.xml")!;
      expect(docXml).toContain("&lt;");
      expect(docXml).toContain("&amp;");
      expect(docXml).toContain("&gt;");
      expect(docXml).toContain("&quot;");
      expect(docXml).not.toMatch(/<[^/w:?!][^>]*[^/]>.*[<>&].*<\/w:t>/);
    });

    it("handles thematic_break with a border", () => {
      const blocks = [makeBlock("thematic_break", "---")];
      const result = buildDocx(blocks);
      const docXml = extractEntry(result, "word/document.xml")!;
      expect(docXml).toContain("<w:pBdr>");
    });

    it("handles list blocks with bullet glyph", () => {
      const blocks = [makeBlock("list", "- Item one\n- Item two")];
      const result = buildDocx(blocks);
      const docXml = extractEntry(result, "word/document.xml")!;
      expect(docXml).toContain("\u2022");
      expect(docXml).toContain("Item one");
      expect(docXml).toContain("Item two");
    });

    it("handles task_list with checkbox glyphs", () => {
      const blocks = [makeBlock("task_list", "- [x] Done\n- [ ] Todo")];
      const result = buildDocx(blocks);
      const docXml = extractEntry(result, "word/document.xml")!;
      expect(docXml).toContain("\u2611"); // checked
      expect(docXml).toContain("\u2610"); // unchecked
    });

    it("generates placeholder for image blocks", () => {
      const blocks = [makeBlock("image", "![Alt text](image.png)")];
      const result = buildDocx(blocks);
      const docXml = extractEntry(result, "word/document.xml")!;
      expect(docXml).toContain("[Image: Alt text]");
    });

    it("styles.xml defines all required styles", () => {
      const result = buildDocx([]);
      const styles = extractEntry(result, "word/styles.xml")!;
      expect(styles).toContain('w:styleId="Normal"');
      expect(styles).toContain('w:styleId="Heading1"');
      expect(styles).toContain('w:styleId="Heading6"');
      expect(styles).toContain('w:styleId="Code"');
      expect(styles).toContain('w:styleId="Quote"');
      expect(styles).toContain('w:styleId="Title"');
    });
  });
});
