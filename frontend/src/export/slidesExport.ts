// Pure slide-deck builder for standalone HTML presentation export.
// Splits document blocks into slides and builds a self-contained navigable deck.

import type { Block } from "../ipc/types";
import { parseHeadingLevel } from "../store/outline";

// --- Types -------------------------------------------------------------------

export interface Slide {
  /** Ordered block ids included in this slide. */
  blockIds: string[];
  /** Corresponding HTML fragments (rendered preview innerHTML per block). */
  htmlFragments: string[];
}

export interface SplitOptions {
  /**
   * Maximum heading level that starts a new slide (1 = H1 only, 2 = H1+H2, etc.).
   * Set to 0 to disable heading-based splitting (split on `---` only).
   * Default: 2 (split on H1 and H2).
   */
  headingSplitLevel: number;
}

const DEFAULT_SPLIT_OPTIONS: SplitOptions = {
  headingSplitLevel: 2,
};

// --- Slide splitter ----------------------------------------------------------

/**
 * Split an ordered list of blocks into slides.
 *
 * Rules:
 * - A `thematic_break` block starts a new slide and is itself omitted.
 * - If `headingSplitLevel > 0`, a heading block with level ≤ that threshold
 *   also starts a new slide (the heading IS included in the new slide).
 * - Empty slides (no content blocks) are discarded.
 * - If there are no delimiters the entire doc becomes one slide.
 */
export const splitIntoSlides = (
  blocks: Block[],
  blockHtmlMap: Map<string, string>,
  opts?: Partial<SplitOptions>,
): Slide[] => {
  const { headingSplitLevel } = { ...DEFAULT_SPLIT_OPTIONS, ...opts };

  const slides: Slide[] = [];
  let current: Slide = { blockIds: [], htmlFragments: [] };

  for (const block of blocks) {
    // Thematic break — start new slide, omit the break itself
    if (block.kind === "thematic_break") {
      if (current.blockIds.length > 0) {
        slides.push(current);
      }
      current = { blockIds: [], htmlFragments: [] };
      continue;
    }

    // Heading split
    if (
      headingSplitLevel > 0 &&
      block.kind === "heading"
    ) {
      const level = parseHeadingLevel(block.source);
      if (level <= headingSplitLevel) {
        // Push current if non-empty, start new slide
        if (current.blockIds.length > 0) {
          slides.push(current);
        }
        current = { blockIds: [], htmlFragments: [] };
      }
    }

    // Add block to current slide
    const html = blockHtmlMap.get(block.id) ?? block.html;
    current.blockIds.push(block.id);
    current.htmlFragments.push(html);
  }

  // Push final slide if non-empty
  if (current.blockIds.length > 0) {
    slides.push(current);
  }

  return slides;
};

// --- Deck builder ------------------------------------------------------------

export interface BuildSlidesHtmlOptions {
  slides: Slide[];
  css: string;
  title: string;
  theme: string | null;
}

/**
 * Build a complete, self-contained HTML slide deck.
 *
 * Features:
 * - One `.om-slide` per slide, full-viewport, centered content.
 * - Inline vanilla JS navigation: Arrow keys, Space, PageUp/PageDown, `f` for
 *   fullscreen, hash-based slide index for persistence across refresh.
 * - No external script or stylesheet references.
 */
export const buildSlidesHtml = (opts: BuildSlidesHtmlOptions): string => {
  const { slides, css, title, theme } = opts;
  const escaped = escapeHtmlText(title);
  const themeAttr = theme && theme !== "dark" ? ` data-theme="${escapeAttr(theme)}"` : "";

  const slideMarkup = slides
    .map(
      (slide, i) =>
        `<section class="om-slide" data-slide="${i}">\n<div class="om-slide-content om-export">\n${slide.htmlFragments.join("\n")}\n</div>\n</section>`,
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en"${themeAttr}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="open-md slides">
<title>${escaped}</title>
<style>
${css}
${DECK_CSS}
</style>
</head>
<body>
${slideMarkup}
<div class="om-slide-indicator" aria-live="polite"></div>
<script>
${NAV_SCRIPT}
</script>
</body>
</html>`;
};

// --- Deck CSS ----------------------------------------------------------------

const DECK_CSS = `/* slide deck layout */
html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
.om-slide {
  position: absolute;
  inset: 0;
  display: none;
  align-items: center;
  justify-content: center;
  overflow-y: auto;
  padding: 2rem 4rem;
}
.om-slide.active { display: flex; }
.om-slide-content {
  max-width: 64rem;
  width: 100%;
}
.om-slide-indicator {
  position: fixed;
  bottom: 1rem;
  right: 1.5rem;
  font-size: 0.85rem;
  opacity: 0.5;
  color: var(--fg, #ccc);
  pointer-events: none;
  z-index: 1000;
}`;

// --- Navigation script (vanilla JS, no deps) ---------------------------------
// This is the ONE inline script in the exported deck. It enables keyboard and
// hash-based navigation for an offline, self-contained slide presentation.

const NAV_SCRIPT = `(function(){
  var slides = document.querySelectorAll('.om-slide');
  var total = slides.length;
  if (total === 0) return;
  var indicator = document.querySelector('.om-slide-indicator');

  function show(idx) {
    if (idx < 0) idx = 0;
    if (idx >= total) idx = total - 1;
    for (var i = 0; i < total; i++) {
      slides[i].classList.toggle('active', i === idx);
    }
    location.hash = '#' + (idx + 1);
    if (indicator) indicator.textContent = (idx + 1) + ' / ' + total;
  }

  function current() {
    var h = parseInt(location.hash.slice(1), 10);
    if (h >= 1 && h <= total) return h - 1;
    return 0;
  }

  document.addEventListener('keydown', function(e) {
    var idx = current();
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ' || e.key === 'PageDown') {
      e.preventDefault(); show(idx + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
      e.preventDefault(); show(idx - 1);
    } else if (e.key === 'Home') {
      e.preventDefault(); show(0);
    } else if (e.key === 'End') {
      e.preventDefault(); show(total - 1);
    } else if (e.key === 'f' || e.key === 'F') {
      if (document.fullscreenElement) { document.exitFullscreen(); }
      else { document.documentElement.requestFullscreen(); }
    }
  });

  window.addEventListener('hashchange', function() { show(current()); });
  show(current());
})();`;

// --- Utilities ---------------------------------------------------------------

const escapeHtmlText = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const escapeAttr = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
