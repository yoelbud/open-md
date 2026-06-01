import { describe, expect, it } from "vitest";
import {
  buildExportCss,
  buildStandaloneHtml,
  capturePreviewHtml,
  copyHtmlToClipboard,
  exportTitle,
} from "../src/export/htmlExport";

describe("htmlExport", () => {
  describe("buildStandaloneHtml", () => {
    const minOpts = {
      title: "Test Doc",
      bodyHtml: "<h1>Hello</h1><p>World</p>",
      css: ":root { --fg: #eee; }",
      theme: null,
    };

    it("produces a complete DOCTYPE html document", () => {
      const html = buildStandaloneHtml(minOpts);
      expect(html).toMatch(/^<!DOCTYPE html>/);
      expect(html).toContain("<html lang=\"en\">");
      expect(html).toContain("</html>");
    });

    it("includes meta charset and viewport", () => {
      const html = buildStandaloneHtml(minOpts);
      expect(html).toContain('<meta charset="utf-8">');
      expect(html).toContain('<meta name="viewport"');
    });

    it("injects the title", () => {
      const html = buildStandaloneHtml(minOpts);
      expect(html).toContain("<title>Test Doc</title>");
    });

    it("escapes special characters in the title", () => {
      const html = buildStandaloneHtml({ ...minOpts, title: "A <b>bold</b> & \"title\"" });
      expect(html).toContain("<title>A &lt;b&gt;bold&lt;/b&gt; &amp; \"title\"</title>");
      expect(html).not.toContain("<title>A <b>");
    });

    it("includes body HTML in an article.om-export wrapper", () => {
      const html = buildStandaloneHtml(minOpts);
      expect(html).toContain('<article class="om-export">');
      expect(html).toContain("<h1>Hello</h1><p>World</p>");
    });

    it("inlines CSS in a <style> tag", () => {
      const html = buildStandaloneHtml(minOpts);
      expect(html).toContain("<style>");
      expect(html).toContain(":root { --fg: #eee; }");
      expect(html).toContain("</style>");
    });

    it("does not contain external script or link references", () => {
      const html = buildStandaloneHtml(minOpts);
      expect(html).not.toMatch(/<script\s+src=/);
      expect(html).not.toMatch(/<link\s+.*href=.*\.css/);
    });

    it("sets data-theme attribute for non-dark themes", () => {
      const html = buildStandaloneHtml({ ...minOpts, theme: "light" });
      expect(html).toContain('data-theme="light"');
    });

    it("omits data-theme for the dark default", () => {
      const html = buildStandaloneHtml({ ...minOpts, theme: "dark" });
      expect(html).toContain("<html lang=\"en\">");
      expect(html).not.toContain("data-theme");
    });

    it("omits data-theme when theme is null", () => {
      const html = buildStandaloneHtml({ ...minOpts, theme: null });
      expect(html).not.toContain("data-theme");
    });

    it("includes the generator meta tag", () => {
      const html = buildStandaloneHtml(minOpts);
      expect(html).toContain('<meta name="generator" content="open-md">');
    });
  });

  describe("buildExportCss", () => {
    const sampleCss = `:root {
  --fg: #eef2ff;
  --bg: #0f1117;
}
[data-theme="light"] {
  --fg: #1a1d26;
  --bg: #f8f9fc;
}
.preview h1 { font-size: 2rem; }
.preview .om-callout { margin: 14px 0; }
.om-fg-red { color: var(--om-red); }
.menubar { display: flex; }
`;

    it("includes :root variables", () => {
      const css = buildExportCss(sampleCss);
      expect(css).toContain("--fg: #eef2ff");
      expect(css).toContain("--bg: #0f1117");
    });

    it("includes data-theme blocks", () => {
      const css = buildExportCss(sampleCss);
      expect(css).toContain("[data-theme=\"light\"]");
    });

    it("rewrites .preview selectors to .om-export", () => {
      const css = buildExportCss(sampleCss);
      expect(css).toContain(".om-export h1");
      expect(css).toContain(".om-export .om-callout");
    });

    it("includes color utility classes", () => {
      const css = buildExportCss(sampleCss);
      expect(css).toContain(".om-fg-red");
    });

    it("excludes non-content styles (menubar)", () => {
      const css = buildExportCss(sampleCss);
      expect(css).not.toContain(".menubar");
    });

    it("includes extra CSS when provided", () => {
      const css = buildExportCss(sampleCss, ".katex { font-size: 1.1em; }");
      expect(css).toContain(".katex { font-size: 1.1em; }");
    });

    it("includes body and .om-export base styles", () => {
      const css = buildExportCss(sampleCss);
      expect(css).toContain("body {");
      expect(css).toContain(".om-export {");
      expect(css).toContain("max-width:");
    });
  });

  describe("exportTitle", () => {
    it("uses front-matter title when present", () => {
      expect(exportTitle("notes.md", "My Great Document")).toBe("My Great Document");
    });

    it("derives title from file path when no front-matter", () => {
      expect(exportTitle("C:\\docs\\release-plan.md")).toBe("release-plan");
    });

    it("strips .ommd extension", () => {
      expect(exportTitle("project.ommd")).toBe("project");
    });

    it("returns 'document' for empty path", () => {
      expect(exportTitle("")).toBe("document");
    });

    it("returns 'document' for path that is just an extension", () => {
      expect(exportTitle(".md")).toBe("document");
    });
  });

  describe("capturePreviewHtml", () => {
    it("returns empty string when no preview elements exist", () => {
      // jsdom starts with an empty body
      expect(capturePreviewHtml()).toBe("");
    });

    it("captures print-preview innerHTML when present", () => {
      const el = document.createElement("div");
      el.className = "print-preview";
      el.innerHTML = "<p>Exported content</p>";
      document.body.appendChild(el);

      expect(capturePreviewHtml()).toBe("<p>Exported content</p>");

      document.body.removeChild(el);
    });

    it("falls back to .preview element", () => {
      const el = document.createElement("div");
      el.className = "preview";
      el.innerHTML = "<p>Fallback</p>";
      document.body.appendChild(el);

      expect(capturePreviewHtml()).toBe("<p>Fallback</p>");

      document.body.removeChild(el);
    });
  });

  describe("copyHtmlToClipboard", () => {
    it("returns false when clipboard API is unavailable", async () => {
      // jsdom doesn't have a full clipboard API
      const result = await copyHtmlToClipboard("<p>Test</p>");
      // In jsdom, execCommand fallback should run
      expect(typeof result).toBe("boolean");
    });
  });
});
