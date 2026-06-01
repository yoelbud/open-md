import { describe, expect, it } from "vitest";
import { splitIntoSlides, buildSlidesHtml } from "../src/export/slidesExport";
import type { Block } from "../src/ipc/types";

// Helper to create a minimal block for testing
const makeBlock = (
  id: string,
  kind: Block["kind"],
  source: string,
  html?: string,
): Block => ({
  id,
  kind,
  src_range: [0, source.length],
  hash: 0,
  source,
  html: html ?? `<p>${source}</p>`,
  plain_html: `<p>${source}</p>`,
});

describe("slidesExport", () => {
  describe("splitIntoSlides", () => {
    it("splits on thematic_break and omits the break itself", () => {
      const blocks: Block[] = [
        makeBlock("1", "paragraph", "Intro"),
        makeBlock("2", "thematic_break", "---"),
        makeBlock("3", "paragraph", "Second slide"),
      ];
      const map = new Map(blocks.map((b) => [b.id, b.html]));
      const slides = splitIntoSlides(blocks, map);

      expect(slides).toHaveLength(2);
      expect(slides[0]!.blockIds).toEqual(["1"]);
      expect(slides[1]!.blockIds).toEqual(["3"]);
    });

    it("splits on H1 and H2 headings by default", () => {
      const blocks: Block[] = [
        makeBlock("1", "paragraph", "Before"),
        makeBlock("2", "heading", "# Title", "<h1>Title</h1>"),
        makeBlock("3", "paragraph", "Content A"),
        makeBlock("4", "heading", "## Section", "<h2>Section</h2>"),
        makeBlock("5", "paragraph", "Content B"),
      ];
      const map = new Map(blocks.map((b) => [b.id, b.html]));
      const slides = splitIntoSlides(blocks, map);

      expect(slides).toHaveLength(3);
      expect(slides[0]!.blockIds).toEqual(["1"]);
      expect(slides[1]!.blockIds).toEqual(["2", "3"]);
      expect(slides[2]!.blockIds).toEqual(["4", "5"]);
    });

    it("does not split on H3+ when headingSplitLevel is 2", () => {
      const blocks: Block[] = [
        makeBlock("1", "heading", "# Title", "<h1>Title</h1>"),
        makeBlock("2", "heading", "### Sub", "<h3>Sub</h3>"),
        makeBlock("3", "paragraph", "Content"),
      ];
      const map = new Map(blocks.map((b) => [b.id, b.html]));
      const slides = splitIntoSlides(blocks, map);

      expect(slides).toHaveLength(1);
      expect(slides[0]!.blockIds).toEqual(["1", "2", "3"]);
    });

    it("respects headingSplitLevel: 0 (breaks only)", () => {
      const blocks: Block[] = [
        makeBlock("1", "heading", "# Title", "<h1>Title</h1>"),
        makeBlock("2", "paragraph", "Content"),
        makeBlock("3", "thematic_break", "---"),
        makeBlock("4", "paragraph", "Slide 2"),
      ];
      const map = new Map(blocks.map((b) => [b.id, b.html]));
      const slides = splitIntoSlides(blocks, map, { headingSplitLevel: 0 });

      expect(slides).toHaveLength(2);
      expect(slides[0]!.blockIds).toEqual(["1", "2"]);
      expect(slides[1]!.blockIds).toEqual(["4"]);
    });

    it("handles a doc with no delimiters (single slide)", () => {
      const blocks: Block[] = [
        makeBlock("1", "paragraph", "Hello"),
        makeBlock("2", "paragraph", "World"),
      ];
      const map = new Map(blocks.map((b) => [b.id, b.html]));
      const slides = splitIntoSlides(blocks, map);

      expect(slides).toHaveLength(1);
      expect(slides[0]!.blockIds).toEqual(["1", "2"]);
    });

    it("discards empty slides from leading/trailing breaks", () => {
      const blocks: Block[] = [
        makeBlock("1", "thematic_break", "---"),
        makeBlock("2", "paragraph", "Content"),
        makeBlock("3", "thematic_break", "---"),
      ];
      const map = new Map(blocks.map((b) => [b.id, b.html]));
      const slides = splitIntoSlides(blocks, map);

      expect(slides).toHaveLength(1);
      expect(slides[0]!.blockIds).toEqual(["2"]);
    });

    it("discards empty slides from consecutive breaks", () => {
      const blocks: Block[] = [
        makeBlock("1", "paragraph", "A"),
        makeBlock("2", "thematic_break", "---"),
        makeBlock("3", "thematic_break", "---"),
        makeBlock("4", "paragraph", "B"),
      ];
      const map = new Map(blocks.map((b) => [b.id, b.html]));
      const slides = splitIntoSlides(blocks, map);

      expect(slides).toHaveLength(2);
      expect(slides[0]!.blockIds).toEqual(["1"]);
      expect(slides[1]!.blockIds).toEqual(["4"]);
    });

    it("uses blockHtmlMap for html fragments", () => {
      const blocks: Block[] = [
        makeBlock("1", "paragraph", "Hello", "<p>fallback</p>"),
      ];
      const map = new Map([["1", "<p>rendered</p>"]]);
      const slides = splitIntoSlides(blocks, map);

      expect(slides[0]!.htmlFragments[0]).toBe("<p>rendered</p>");
    });

    it("falls back to block.html when map entry is missing", () => {
      const blocks: Block[] = [
        makeBlock("1", "paragraph", "Hello", "<p>from-block</p>"),
      ];
      const map = new Map<string, string>();
      const slides = splitIntoSlides(blocks, map);

      expect(slides[0]!.htmlFragments[0]).toBe("<p>from-block</p>");
    });
  });

  describe("buildSlidesHtml", () => {
    const minSlides = [
      { blockIds: ["1"], htmlFragments: ["<h1>Slide 1</h1>"] },
      { blockIds: ["2"], htmlFragments: ["<p>Slide 2</p>"] },
    ];

    it("produces a complete DOCTYPE html document", () => {
      const html = buildSlidesHtml({
        slides: minSlides,
        css: ":root { --fg: #eee; }",
        title: "Deck",
        theme: null,
      });
      expect(html).toMatch(/^<!DOCTYPE html>/);
      expect(html).toContain("</html>");
    });

    it("includes meta charset", () => {
      const html = buildSlidesHtml({
        slides: minSlides,
        css: "",
        title: "T",
        theme: null,
      });
      expect(html).toContain('<meta charset="utf-8">');
    });

    it("renders one .om-slide per slide", () => {
      const html = buildSlidesHtml({
        slides: minSlides,
        css: "",
        title: "T",
        theme: null,
      });
      const matches = html.match(/class="om-slide"/g);
      expect(matches).toHaveLength(2);
    });

    it("contains the nav script", () => {
      const html = buildSlidesHtml({
        slides: minSlides,
        css: "",
        title: "T",
        theme: null,
      });
      expect(html).toContain("<script>");
      expect(html).toContain("ArrowRight");
      expect(html).toContain("requestFullscreen");
    });

    it("has no external script or style references", () => {
      const html = buildSlidesHtml({
        slides: minSlides,
        css: "",
        title: "T",
        theme: null,
      });
      expect(html).not.toMatch(/<script\s+src=/);
      expect(html).not.toMatch(/<link\s+.*href=.*\.css/);
    });

    it("applies data-theme attribute when theme is not dark", () => {
      const html = buildSlidesHtml({
        slides: minSlides,
        css: "",
        title: "T",
        theme: "light",
      });
      expect(html).toContain('data-theme="light"');
    });

    it("omits data-theme for dark theme (default)", () => {
      const html = buildSlidesHtml({
        slides: minSlides,
        css: "",
        title: "T",
        theme: "dark",
      });
      expect(html).not.toContain("data-theme");
    });

    it("escapes special characters in the title", () => {
      const html = buildSlidesHtml({
        slides: minSlides,
        css: "",
        title: "A <script> & \"test\"",
        theme: null,
      });
      expect(html).toContain("<title>A &lt;script&gt; &amp; \"test\"</title>");
    });

    it("includes slide indicator element", () => {
      const html = buildSlidesHtml({
        slides: minSlides,
        css: "",
        title: "T",
        theme: null,
      });
      expect(html).toContain("om-slide-indicator");
    });
  });
});
