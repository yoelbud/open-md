// Pure pagination utilities for paged layout and export.
// No external dependencies — all functions are stateless and unit-testable.

// --- Types -------------------------------------------------------------------

/**
 * Standard page sizes supported by the paged layout.
 */
export type PageSize = "letter" | "a4";

/**
 * Page orientation.
 */
export type PageOrientation = "portrait" | "landscape";

/**
 * Configuration for paged layout.
 */
export interface PageConfig {
  size: PageSize;
  orientation: PageOrientation;
}

/**
 * A page break location found in the content.
 */
export interface PageBreakLocation {
  /** Character index where the page break token starts. */
  start: number;
  /** Character index where the page break token ends. */
  end: number;
  /** The matched token variant. */
  token: string;
}

/**
 * Options for building a paged HTML document.
 */
export interface BuildPagedHtmlOptions {
  /** Combined body HTML content (may contain page-break markers). */
  bodyHtml: string;
  /** Inlined CSS (app theme variables + content styles). */
  css: string;
  /** Document title. */
  title: string;
  /** Active theme id (applied as `data-theme` on root). */
  theme: string | null;
  /** Page configuration. */
  pageConfig: PageConfig;
}

// --- Page size dimensions ----------------------------------------------------

/** Physical dimensions in CSS units (inches or mm). */
interface PageDimensions {
  width: string;
  height: string;
}

const PAGE_DIMENSIONS: Record<PageSize, PageDimensions> = {
  letter: { width: "8.5in", height: "11in" },
  a4: { width: "210mm", height: "297mm" },
};

// --- Default configuration ---------------------------------------------------

export const DEFAULT_PAGE_CONFIG: PageConfig = {
  size: "letter",
  orientation: "portrait",
};

// --- Page break detection ----------------------------------------------------

/**
 * Regex patterns for page break markers:
 * - HTML comment: `<!-- pagebreak -->`  (case-insensitive, flexible spacing)
 * - LaTeX-style: a paragraph containing only `\pagebreak` or `\newpage`
 */
const PAGE_BREAK_COMMENT = /<!--\s*pagebreak\s*-->/gi;
const PAGE_BREAK_LATEX = /^\\(pagebreak|newpage)\s*$/gm;

/**
 * Find all explicit page break locations in a raw text/HTML string.
 * Returns an array of break locations sorted by position.
 */
export const findPageBreaks = (content: string): PageBreakLocation[] => {
  const breaks: PageBreakLocation[] = [];

  // Reset lastIndex for global regexes
  PAGE_BREAK_COMMENT.lastIndex = 0;
  PAGE_BREAK_LATEX.lastIndex = 0;

  let match: RegExpExecArray | null;

  while ((match = PAGE_BREAK_COMMENT.exec(content)) !== null) {
    breaks.push({
      start: match.index,
      end: match.index + match[0].length,
      token: match[0],
    });
  }

  while ((match = PAGE_BREAK_LATEX.exec(content)) !== null) {
    breaks.push({
      start: match.index,
      end: match.index + match[0].length,
      token: match[0],
    });
  }

  // Sort by position
  breaks.sort((a, b) => a.start - b.start);
  return breaks;
};

/**
 * Split content into page groups at explicit page break markers.
 * Empty pages (only whitespace) from consecutive breaks are discarded.
 * Returns at least one page if the input is non-empty.
 */
export const splitByPageBreaks = (content: string): string[] => {
  const breaks = findPageBreaks(content);

  if (breaks.length === 0) {
    return content.trim() ? [content] : [];
  }

  const pages: string[] = [];
  let cursor = 0;

  for (const br of breaks) {
    const segment = content.slice(cursor, br.start);
    if (segment.trim()) {
      pages.push(segment);
    }
    cursor = br.end;
  }

  // Trailing content after last break
  const tail = content.slice(cursor);
  if (tail.trim()) {
    pages.push(tail);
  }

  return pages;
};

// --- CSS generation ----------------------------------------------------------

/** Whether a block's source is solely an explicit page-break marker. */
export const isPageBreakBlock = (source: string): boolean => {
  const t = source.trim();
  return /^<!--\s*pagebreak\s*-->$/i.test(t) || /^\\(pagebreak|newpage)$/i.test(t);
};

/** CSS class list for an on-screen page frame given the page config. */
export const pageFrameClasses = (config: PageConfig): string => {
  const classes = ["om-page-frame"];
  if (config.size === "a4") classes.push("om-page-a4");
  if (config.orientation === "landscape") classes.push("om-page-landscape");
  return classes.join(" ");
};


export const pageSizeCss = (
  size: PageSize,
  orientation: PageOrientation,
): string => {
  const dims = PAGE_DIMENSIONS[size];
  const isLandscape = orientation === "landscape";

  // CSS @page size value
  const sizeValue = isLandscape
    ? `${dims.width} ${dims.height} landscape`.replace(
        /^(.+)\s(.+)\s/,
        (_m, w: string, h: string) => `${h} ${w} `,
      )
    : `${dims.width} ${dims.height}`;

  // Effective width/height for on-screen simulation
  const effectiveWidth = isLandscape ? dims.height : dims.width;
  const effectiveHeight = isLandscape ? dims.width : dims.height;

  // Page margin (consistent with standard print margins)
  const margin = "1in";

  return `@page {
  size: ${sizeValue};
  margin: ${margin};
  @bottom-center {
    content: counter(page);
    font-size: 10pt;
    color: #666;
  }
}
.om-page {
  width: ${effectiveWidth};
  min-height: ${effectiveHeight};
  padding: 1in;
  margin: 0 auto 1.5rem auto;
  background: #fff;
  color: #1a1a2e;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05);
  box-sizing: border-box;
  position: relative;
  overflow: hidden;
  page-break-after: always;
  break-after: page;
}
.om-page:last-child {
  page-break-after: auto;
  break-after: auto;
}
.om-page-number {
  position: absolute;
  bottom: 0.5in;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 10pt;
  color: #666;
}
.om-paged {
  background: #e8e8ec;
  padding: 2rem 1rem;
  min-height: 100%;
}
.om-page-break-marker {
  break-before: page;
  page-break-before: always;
}`;
};

// --- HTML builder ------------------------------------------------------------

const escapeHtmlText = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const escapeAttr = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Build a complete, self-contained paged HTML document ready for export.
 *
 * The document uses CSS `@page` rules for proper print pagination and includes
 * visual on-screen page frames with page numbers for browser viewing.
 *
 * **v1 Limitations:**
 * - On-screen pages are split only at explicit page break markers
 *   (`<!-- pagebreak -->`, `\pagebreak`, `\newpage`).
 * - Automatic content reflow into fixed-height pages is realized only at
 *   print/PDF time via CSS `break-inside: avoid` and `@page` rules.
 * - The on-screen representation shows page-width frames with content flowing
 *   naturally; explicit breaks create new visual pages.
 */
export const buildPagedHtml = (opts: BuildPagedHtmlOptions): string => {
  const { bodyHtml, css, title, theme, pageConfig } = opts;
  const escaped = escapeHtmlText(title);
  const themeAttr = theme && theme !== "dark" ? ` data-theme="${escapeAttr(theme)}"` : "";

  const pagedCss = pageSizeCss(pageConfig.size, pageConfig.orientation);

  // Split body into pages at explicit break markers
  const pages = splitByPageBreaks(bodyHtml);

  // If no explicit breaks, render as a single page
  const pageMarkup =
    pages.length > 0
      ? pages
          .map(
            (content, i) =>
              `<section class="om-page om-export" aria-label="Page ${i + 1}">\n${content}\n<div class="om-page-number">${i + 1}</div>\n</section>`,
          )
          .join("\n")
      : `<section class="om-page om-export" aria-label="Page 1">\n${bodyHtml}\n<div class="om-page-number">1</div>\n</section>`;

  return `<!DOCTYPE html>
<html lang="en"${themeAttr}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="open-md paged">
<title>${escaped}</title>
<style>
${css}
${pagedCss}
${PAGED_EXTRA_CSS}
</style>
</head>
<body>
<div class="om-paged">
${pageMarkup}
</div>
</body>
</html>`;
};

// --- Additional CSS for paged export -----------------------------------------

const PAGED_EXTRA_CSS = `/* paged export: fragmentation hints */
.om-export h1, .om-export h2, .om-export h3,
.om-export h4, .om-export h5, .om-export h6 {
  break-after: avoid;
  page-break-after: avoid;
}
.om-export h1, .om-export h2, .om-export h3,
.om-export h4, .om-export h5, .om-export h6,
.om-export figure, .om-export table,
.om-export pre, .om-export blockquote,
.om-export .om-callout {
  break-inside: avoid;
  page-break-inside: avoid;
}
.om-export img {
  break-inside: avoid;
  page-break-inside: avoid;
  max-width: 100%;
}
/* hide on-screen page numbers when printing (CSS @page counter handles it) */
@media print {
  .om-paged {
    background: none !important;
    padding: 0 !important;
  }
  .om-page {
    box-shadow: none !important;
    margin: 0 !important;
    padding: 0 !important;
    min-height: auto !important;
    width: auto !important;
    break-after: page;
  }
  .om-page:last-child {
    break-after: auto;
  }
  .om-page-number {
    display: none !important;
  }
}`;
