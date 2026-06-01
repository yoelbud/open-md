import { describe, expect, it } from "vitest";
import {
  buildPagedHtml,
  DEFAULT_PAGE_CONFIG,
  findPageBreaks,
  pageSizeCss,
  splitByPageBreaks,
} from "../src/export/pagination";
import type { PageConfig } from "../src/export/pagination";

describe("pagination", () => {
  describe("findPageBreaks", () => {
    it("returns empty array when no break markers exist", () => {
      const content = "# Hello\n\nSome paragraph text.\n\n## Another section\n";
      expect(findPageBreaks(content)).toEqual([]);
    });

    it("detects <!-- pagebreak --> comment", () => {
      const content = "Before\n<!-- pagebreak -->\nAfter";
      const breaks = findPageBreaks(content);
      expect(breaks).toHaveLength(1);
      expect(breaks[0]!.token).toBe("<!-- pagebreak -->");
    });

    it("detects <!-- pagebreak --> with varied spacing", () => {
      const content = "Before\n<!--pagebreak-->\nAfter";
      const breaks = findPageBreaks(content);
      expect(breaks).toHaveLength(1);
      expect(breaks[0]!.token).toBe("<!--pagebreak-->");
    });

    it("is case-insensitive for HTML comment", () => {
      const content = "Before\n<!-- PAGEBREAK -->\nAfter";
      const breaks = findPageBreaks(content);
      expect(breaks).toHaveLength(1);
    });

    it("detects \\pagebreak paragraph", () => {
      const content = "Before\n\\pagebreak\nAfter";
      const breaks = findPageBreaks(content);
      expect(breaks).toHaveLength(1);
      expect(breaks[0]!.token).toBe("\\pagebreak");
    });

    it("detects \\newpage paragraph", () => {
      const content = "Before\n\\newpage\nAfter";
      const breaks = findPageBreaks(content);
      expect(breaks).toHaveLength(1);
      expect(breaks[0]!.token).toBe("\\newpage");
    });

    it("finds multiple breaks of different types", () => {
      const content =
        "Page 1\n<!-- pagebreak -->\nPage 2\n\\newpage\nPage 3\n\\pagebreak\nPage 4";
      const breaks = findPageBreaks(content);
      expect(breaks).toHaveLength(3);
      expect(breaks[0]!.token).toBe("<!-- pagebreak -->");
      expect(breaks[1]!.token).toBe("\\newpage");
      expect(breaks[2]!.token).toBe("\\pagebreak");
    });

    it("returns correct start/end positions", () => {
      const content = "ABC<!-- pagebreak -->DEF";
      const breaks = findPageBreaks(content);
      expect(breaks).toHaveLength(1);
      expect(breaks[0]!.start).toBe(3);
      expect(breaks[0]!.end).toBe(21);
    });

    it("does not match \\pagebreak inside longer words", () => {
      // \pagebreak must be the entire line content (^...$)
      const content = "use \\pagebreakhere for fun";
      const breaks = findPageBreaks(content);
      expect(breaks).toHaveLength(0);
    });
  });

  describe("splitByPageBreaks", () => {
    it("returns single page when no breaks exist", () => {
      const content = "<h1>Hello</h1><p>World</p>";
      const pages = splitByPageBreaks(content);
      expect(pages).toHaveLength(1);
      expect(pages[0]).toBe(content);
    });

    it("splits content at a single break", () => {
      const content = "Page 1 content<!-- pagebreak -->Page 2 content";
      const pages = splitByPageBreaks(content);
      expect(pages).toHaveLength(2);
      expect(pages[0]).toBe("Page 1 content");
      expect(pages[1]).toBe("Page 2 content");
    });

    it("splits at multiple breaks", () => {
      const content = "A<!-- pagebreak -->B<!-- pagebreak -->C";
      const pages = splitByPageBreaks(content);
      expect(pages).toHaveLength(3);
      expect(pages[0]).toBe("A");
      expect(pages[1]).toBe("B");
      expect(pages[2]).toBe("C");
    });

    it("discards empty pages from consecutive breaks", () => {
      const content = "A<!-- pagebreak --><!-- pagebreak -->B";
      const pages = splitByPageBreaks(content);
      expect(pages).toHaveLength(2);
      expect(pages[0]).toBe("A");
      expect(pages[1]).toBe("B");
    });

    it("discards leading break producing empty first page", () => {
      const content = "<!-- pagebreak -->Content here";
      const pages = splitByPageBreaks(content);
      expect(pages).toHaveLength(1);
      expect(pages[0]).toBe("Content here");
    });

    it("discards trailing break producing empty last page", () => {
      const content = "Content here<!-- pagebreak -->";
      const pages = splitByPageBreaks(content);
      expect(pages).toHaveLength(1);
      expect(pages[0]).toBe("Content here");
    });

    it("returns empty array for empty/whitespace-only input", () => {
      expect(splitByPageBreaks("")).toEqual([]);
      expect(splitByPageBreaks("   ")).toEqual([]);
    });

    it("handles \\newpage as a splitter", () => {
      const content = "First\n\\newpage\nSecond";
      const pages = splitByPageBreaks(content);
      expect(pages).toHaveLength(2);
      expect(pages[0]!.trim()).toBe("First");
      expect(pages[1]!.trim()).toBe("Second");
    });
  });

  describe("pageSizeCss", () => {
    it("generates @page rule for Letter portrait", () => {
      const css = pageSizeCss("letter", "portrait");
      expect(css).toContain("@page");
      expect(css).toContain("8.5in");
      expect(css).toContain("11in");
    });

    it("generates @page rule for A4 portrait", () => {
      const css = pageSizeCss("a4", "portrait");
      expect(css).toContain("@page");
      expect(css).toContain("210mm");
      expect(css).toContain("297mm");
    });

    it("swaps dimensions for Letter landscape", () => {
      const css = pageSizeCss("letter", "landscape");
      // .om-page width should be 11in (the height in portrait)
      expect(css).toContain("width: 11in");
    });

    it("swaps dimensions for A4 landscape", () => {
      const css = pageSizeCss("a4", "landscape");
      expect(css).toContain("width: 297mm");
    });

    it("includes .om-page styles", () => {
      const css = pageSizeCss("letter", "portrait");
      expect(css).toContain(".om-page");
      expect(css).toContain("padding: 1in");
    });

    it("includes .om-paged container styles", () => {
      const css = pageSizeCss("letter", "portrait");
      expect(css).toContain(".om-paged");
    });

    it("includes page-break-after rule", () => {
      const css = pageSizeCss("a4", "portrait");
      expect(css).toContain("page-break-after: always");
      expect(css).toContain("break-after: page");
    });

    it("includes @bottom-center counter(page) for running page numbers", () => {
      const css = pageSizeCss("letter", "portrait");
      expect(css).toContain("@bottom-center");
      expect(css).toContain("counter(page)");
    });

    it("includes .om-page-number styles for on-screen numbers", () => {
      const css = pageSizeCss("letter", "portrait");
      expect(css).toContain(".om-page-number");
      expect(css).toContain("text-align: center");
    });
  });

  describe("buildPagedHtml", () => {
    const baseOpts = {
      bodyHtml: "<h1>Hello</h1><p>World</p>",
      css: ":root { --fg: #eee; }",
      title: "Test Paged",
      theme: null,
      pageConfig: { ...DEFAULT_PAGE_CONFIG } as PageConfig,
    };

    it("produces a complete DOCTYPE html document", () => {
      const html = buildPagedHtml(baseOpts);
      expect(html).toMatch(/^<!DOCTYPE html>/);
      expect(html).toContain("<html lang=\"en\">");
      expect(html).toContain("</html>");
    });

    it("includes the @page rule", () => {
      const html = buildPagedHtml(baseOpts);
      expect(html).toContain("@page");
    });

    it("includes page-break CSS for headings and figures", () => {
      const html = buildPagedHtml(baseOpts);
      expect(html).toContain("break-inside: avoid");
      expect(html).toContain("page-break-inside: avoid");
    });

    it("sets data-theme attribute for non-dark themes", () => {
      const html = buildPagedHtml({ ...baseOpts, theme: "light" });
      expect(html).toContain('data-theme="light"');
    });

    it("omits data-theme for dark/null theme", () => {
      const html = buildPagedHtml({ ...baseOpts, theme: "dark" });
      expect(html).not.toContain("data-theme");

      const html2 = buildPagedHtml({ ...baseOpts, theme: null });
      expect(html2).not.toContain("data-theme");
    });

    it("includes the title", () => {
      const html = buildPagedHtml(baseOpts);
      expect(html).toContain("<title>Test Paged</title>");
    });

    it("includes body content within .om-page sections", () => {
      const html = buildPagedHtml(baseOpts);
      expect(html).toContain('class="om-page om-export"');
      expect(html).toContain("<h1>Hello</h1>");
    });

    it("includes page numbers in the page sections", () => {
      const html = buildPagedHtml(baseOpts);
      expect(html).toContain('class="om-page-number"');
    });

    it("does not contain external script or link references", () => {
      const html = buildPagedHtml(baseOpts);
      expect(html).not.toMatch(/<script\s+src=/);
      expect(html).not.toMatch(/<link\s+.*href=.*\.css/);
    });

    it("wraps everything in .om-paged container", () => {
      const html = buildPagedHtml(baseOpts);
      expect(html).toContain('class="om-paged"');
    });

    it("splits into multiple pages at explicit breaks", () => {
      const html = buildPagedHtml({
        ...baseOpts,
        bodyHtml: "<p>Page 1</p><!-- pagebreak --><p>Page 2</p>",
      });
      // Should have two om-page sections
      const pageMatches = html.match(/class="om-page om-export"/g);
      expect(pageMatches).toHaveLength(2);
      expect(html).toContain("Page 1");
      expect(html).toContain("Page 2");
    });

    it("numbers pages correctly with multiple breaks", () => {
      const html = buildPagedHtml({
        ...baseOpts,
        bodyHtml: "A<!-- pagebreak -->B<!-- pagebreak -->C",
      });
      expect(html).toContain('>1</div>');
      expect(html).toContain('>2</div>');
      expect(html).toContain('>3</div>');
    });

    it("includes the generator meta tag", () => {
      const html = buildPagedHtml(baseOpts);
      expect(html).toContain('<meta name="generator" content="open-md paged">');
    });

    it("uses A4 dimensions when configured", () => {
      const html = buildPagedHtml({
        ...baseOpts,
        pageConfig: { size: "a4", orientation: "portrait" },
      });
      expect(html).toContain("210mm");
      expect(html).toContain("297mm");
    });

    it("applies landscape orientation", () => {
      const html = buildPagedHtml({
        ...baseOpts,
        pageConfig: { size: "letter", orientation: "landscape" },
      });
      expect(html).toContain("width: 11in");
    });

    it("includes @media print rules for clean printing", () => {
      const html = buildPagedHtml(baseOpts);
      expect(html).toContain("@media print");
      expect(html).toContain(".om-page-number");
    });

    it("escapes special characters in title", () => {
      const html = buildPagedHtml({
        ...baseOpts,
        title: "A <script> & \"test\"",
      });
      expect(html).toContain("<title>A &lt;script&gt; &amp; \"test\"</title>");
    });
  });

  describe("DEFAULT_PAGE_CONFIG", () => {
    it("defaults to letter portrait", () => {
      expect(DEFAULT_PAGE_CONFIG.size).toBe("letter");
      expect(DEFAULT_PAGE_CONFIG.orientation).toBe("portrait");
    });
  });
});
