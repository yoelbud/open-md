// Pure HTML document builder for standalone export.
// No external dependencies — assembles a self-contained HTML string from parts
// provided by the caller.

/**
 * Options for building a standalone HTML document.
 */
export interface HtmlExportOptions {
  /** Document title (from front-matter or file name). */
  title: string;
  /** Combined inner HTML of all preview blocks. */
  bodyHtml: string;
  /** Inlined CSS (app theme variables + content styles). */
  css: string;
  /** Active theme id (applied as `data-theme` on root). Falls back to none (dark default). */
  theme: string | null;
}

/**
 * Build a complete standalone HTML document ready for export.
 * The output is self-contained: no external `<script src>` or `<link href>` refs.
 */
export const buildStandaloneHtml = (opts: HtmlExportOptions): string => {
  const { title, bodyHtml, css, theme } = opts;
  const escaped = escapeHtmlText(title);
  const themeAttr = theme && theme !== "dark" ? ` data-theme="${escapeAttr(theme)}"` : "";

  return `<!DOCTYPE html>
<html lang="en"${themeAttr}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="open-md">
<title>${escaped}</title>
<style>
${css}
</style>
</head>
<body>
<article class="om-export">
${bodyHtml}
</article>
</body>
</html>`;
};

/**
 * Build the CSS string to embed in the exported HTML.
 * Accepts the full app stylesheet content (imported via `?raw`) and optionally
 * extra CSS (KaTeX, custom user CSS). Extracts only the relevant subsets.
 */
export const buildExportCss = (
  appCss: string,
  extraCss?: string,
): string => {
  // We extract:
  // 1. :root variables (theme palettes)
  // 2. .preview / .print-preview / .om-* content styles
  // 3. Color utility classes (.om-fg-*, .om-bg-*)
  // Instead of doing complex parsing, we include the full app CSS since it's
  // already small (~40KB unminified) and the export should look faithful.
  // We strip interactive-only sections (toolbar, menubar, editor, etc.) for cleanliness
  // but a simpler approach: include all + a small reset wrapper.

  const lines: string[] = [];

  // Base reset for the export container
  lines.push(`/* open-md export styles */`);
  lines.push(`*, *::before, *::after { box-sizing: border-box; }`);
  lines.push(`body {
  margin: 0;
  padding: 2rem;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  line-height: 1.6;
  color: var(--fg);
  background: var(--bg);
}`);
  lines.push(`.om-export {
  max-width: 48rem;
  margin: 0 auto;
}`);

  // Include the full app CSS for faithful rendering of all components
  // (themes, callouts, code blocks, tables, images, marks, etc.)
  // We scope .preview rules to also apply inside .om-export.
  lines.push(rewritePreviewSelectors(appCss));

  if (extraCss) {
    lines.push(`/* additional styles */`);
    lines.push(extraCss);
  }

  return lines.join("\n");
};

/**
 * Rewrite `.preview ` selectors to also match `.om-export ` so the exported
 * document renders identically without needing a `.preview` wrapper.
 * Also includes :root / [data-theme] blocks as-is.
 */
const rewritePreviewSelectors = (css: string): string => {
  // Extract only the lines/blocks we need rather than dumping everything.
  // Strategy: walk the CSS and include blocks that match our needed selectors.
  const needed = extractRelevantBlocks(css);
  return needed;
};

/**
 * Extract CSS blocks relevant to export (themes, preview content, marks, etc.)
 */
const extractRelevantBlocks = (css: string): string => {
  const output: string[] = [];
  const relevantPrefixes = [
    ":root",
    "[data-theme",
    ".preview ",
    ".preview.",
    ".print-preview ",
    ".om-fg-",
    ".om-bg-",
    ".om-mark",
    ".om-callout",
    ".om-code",
    ".om-img",
    ".om-toc",
    ".om-math",
    ".om-frontmatter",
    "[class*=\"om-bg-\"]",
  ];

  // Simple block extractor: find top-level rule blocks matching our prefixes
  let i = 0;
  while (i < css.length) {
    // Skip whitespace
    while (i < css.length && /\s/.test(css[i]!)) i++;
    if (i >= css.length) break;

    // Skip comments
    if (css[i] === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end < 0 ? css.length : end + 2;
      continue;
    }

    // Read until `{` to get the selector
    const selectorStart = i;
    let bracePos = css.indexOf("{", i);
    if (bracePos < 0) break;

    const selector = css.slice(selectorStart, bracePos).trim();

    // Find matching closing brace (handle nesting for @media)
    let depth = 0;
    let j = bracePos;
    while (j < css.length) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}") {
        depth--;
        if (depth === 0) break;
      }
      j++;
    }
    const blockEnd = j + 1;
    const fullBlock = css.slice(selectorStart, blockEnd);

    // Check if this block is relevant
    const isRelevant = relevantPrefixes.some((prefix) => selector.startsWith(prefix));

    if (isRelevant) {
      // For .preview selectors, duplicate as .om-export
      let rewritten = fullBlock;
      if (selector.startsWith(".preview ") || selector.startsWith(".preview.")) {
        const exportSelector = fullBlock.replace(/\.preview(?=[\s.,:{>+~[])/g, ".om-export");
        rewritten = exportSelector;
      } else if (selector.startsWith(".print-preview ") || selector.startsWith(".print-preview.")) {
        // Skip print-preview blocks — they're for @media print only
        i = blockEnd;
        continue;
      }
      output.push(rewritten);
    }

    i = blockEnd;
  }

  return output.join("\n");
};

// --- Clipboard helpers -------------------------------------------------------

/**
 * Copy HTML content to the clipboard as both `text/html` and `text/plain`.
 * Uses the async Clipboard API with ClipboardItem where available.
 * Returns true if successful, false otherwise.
 */
export const copyHtmlToClipboard = async (html: string): Promise<boolean> => {
  // Modern async clipboard API with ClipboardItem
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof ClipboardItem !== "undefined"
  ) {
    try {
      const htmlBlob = new Blob([html], { type: "text/html" });
      const textBlob = new Blob([html], { type: "text/plain" });
      const item = new ClipboardItem({
        "text/html": htmlBlob,
        "text/plain": textBlob,
      });
      await navigator.clipboard.write([item]);
      return true;
    } catch {
      // Fall through to fallback
    }
  }

  // Fallback: execCommand (deprecated but widely supported)
  if (typeof document !== "undefined") {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = html;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      return true;
    } catch {
      return false;
    }
  }

  return false;
};

// --- Utilities ---------------------------------------------------------------

const escapeHtmlText = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const escapeAttr = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Derive a suitable document title from a file path and optional front-matter title.
 */
export const exportTitle = (
  filePath: string,
  frontMatterTitle?: string | null,
): string => {
  if (frontMatterTitle) return frontMatterTitle;
  const leaf = filePath.split(/[\\/]/).pop()?.trim() || "document";
  return leaf.replace(/\.(ommd|md|markdown)$/i, "").trim() || "document";
};

/**
 * Capture the preview pane's rendered innerHTML.
 * Call this from the action layer (DOM access), not from the pure builder.
 */
export const capturePreviewHtml = (): string => {
  if (typeof document === "undefined") return "";
  // The print-preview shadow element contains the rendered blocks
  const printPreview = document.querySelector(".print-preview");
  if (printPreview) return printPreview.innerHTML;
  // Fallback: grab the preview pane content
  const preview = document.querySelector(".preview");
  if (preview) return preview.innerHTML;
  return "";
};
