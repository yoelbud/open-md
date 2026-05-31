/**
 * Block references & transclusion — pure helpers.
 *
 * Architecture choice: anchor parsing and transclusion are handled entirely on
 * the FRONTEND assembly layer because transclusion is inherently cross-block.
 * The Rust/stub per-block renderers remain untouched — the `^anchor-name`
 * marker passes through as plain text in block source, and is stripped visually
 * here during preview assembly.
 *
 * Syntax:
 *   - Anchor (naming a block): trailing ` ^anchor-name` on a block's last line.
 *     Valid identifier: [A-Za-z0-9_-]+
 *   - Embed (transclusion): `![[^anchor-name]]` — renders referenced block inline.
 *   - Link: `[[^anchor-name]]` — renders a clickable link to the referenced block.
 */

import type { Block } from "../../ipc/types";

// ── Anchor parsing ───────────────────────────────────────────────────────────

/** Regex for the trailing anchor marker: ` ^identifier` at end of source. */
const ANCHOR_RE = /\s\^([A-Za-z0-9_-]+)$/;

/**
 * Extract a trailing `^name` anchor from a block's source text.
 * Returns the anchor name (without caret) or `null` if none.
 */
export const parseAnchor = (source: string): string | null => {
  const m = source.match(ANCHOR_RE);
  return m ? (m[1] ?? null) : null;
};

/**
 * Strip the trailing anchor marker from source text, returning the clean source.
 * If no anchor is present, returns the original string unchanged.
 */
export const stripAnchor = (source: string): string => {
  return source.replace(ANCHOR_RE, "");
};

// ── Anchor map ───────────────────────────────────────────────────────────────

/**
 * Build a map of anchor name → block id from the document's block list.
 * First occurrence wins; duplicates are ignored deterministically.
 */
export const buildAnchorMap = (blocks: Block[]): Map<string, string> => {
  const map = new Map<string, string>();
  for (const block of blocks) {
    const name = parseAnchor(block.source);
    if (name && !map.has(name)) {
      map.set(name, block.id);
    }
  }
  return map;
};

// ── Reference token detection ────────────────────────────────────────────────

export interface RefToken {
  type: "embed" | "link";
  name: string;
  raw: string;
}

/**
 * Regex to detect embed `![[^name]]` and link `[[^name]]` tokens in text/html.
 * The negative lookbehind ensures we don't double-match the `!` prefix part.
 */
const REF_TOKEN_RE = /(!?\[\[\^([A-Za-z0-9_-]+)\]\])/g;

/**
 * Find all reference tokens (embed or link) in the given text/html string.
 */
export const findRefTokens = (text: string): RefToken[] => {
  const results: RefToken[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(REF_TOKEN_RE.source, REF_TOKEN_RE.flags);
  while ((m = re.exec(text)) !== null) {
    const raw = m[1];
    const name = m[2];
    if (!raw || !name) continue;
    const type = raw.startsWith("!") ? "embed" : "link";
    results.push({ type, name, raw });
  }
  return results;
};

// ── Reference token replacement (transclusion) ──────────────────────────────

/**
 * Replace reference tokens in `html` with resolved content.
 *
 * - Embed tokens (`![[^name]]`) are replaced with the referenced block's
 *   rendered HTML wrapped in a transclusion container.
 * - Link tokens (`[[^name]]`) are replaced with an anchor link.
 * - Unresolved references render a "missing" placeholder.
 * - Cycles are detected via a visited set and render a cycle placeholder.
 *
 * @param html       The block's rendered HTML containing reference tokens.
 * @param anchorMap  Map from anchor name → block id.
 * @param resolver   Function that returns the rendered HTML for a given block id.
 * @param visited    Set of anchor names currently being resolved (cycle guard).
 */
export const replaceRefTokens = (
  html: string,
  anchorMap: Map<string, string>,
  resolver: (blockId: string) => string | null,
  visited: Set<string> = new Set(),
): string => {
  const re = new RegExp(REF_TOKEN_RE.source, REF_TOKEN_RE.flags);
  return html.replace(re, (raw, _full, name) => {
    const isEmbed = raw.startsWith("!");

    if (!isEmbed) {
      // Link token → anchor link
      const blockId = anchorMap.get(name);
      if (!blockId) {
        return `<span class="om-ref-missing" title="Unresolved reference: ^${escapeHtml(name)}">[[^${escapeHtml(name)}]]</span>`;
      }
      return `<a class="om-ref-link" href="#ref-${escapeHtml(name)}">^${escapeHtml(name)}</a>`;
    }

    // Embed token → transclusion
    const blockId = anchorMap.get(name);
    if (!blockId) {
      return `<span class="om-ref-missing" title="Unresolved reference: ^${escapeHtml(name)}">![[^${escapeHtml(name)}]]</span>`;
    }

    // Cycle detection
    if (visited.has(name)) {
      return `<span class="om-ref-cycle" title="Circular reference detected: ^${escapeHtml(name)}">⟳ circular: ^${escapeHtml(name)}</span>`;
    }

    const content = resolver(blockId);
    if (content == null) {
      return `<span class="om-ref-missing" title="Block not found: ^${escapeHtml(name)}">![[^${escapeHtml(name)}]]</span>`;
    }

    // Recursively resolve nested transclusions within the embedded content
    const innerVisited = new Set(visited);
    innerVisited.add(name);
    const resolved = replaceRefTokens(content, anchorMap, resolver, innerVisited);

    return `<div class="om-transclusion" data-om-ref="${escapeHtml(name)}">${resolved}</div>`;
  });
};

// ── Anchor marker stripping from rendered HTML ───────────────────────────────

/**
 * Regex to strip the visible `^anchor-name` text from rendered HTML output.
 * The marker may appear as plain text (possibly inside a trailing `<p>` etc).
 */
const ANCHOR_HTML_RE = /\s?\^([A-Za-z0-9_-]+)(?=<\/|$)/g;

/**
 * Strip anchor markers from a block's rendered HTML so they don't appear
 * visually to the user in the preview.
 */
export const stripAnchorFromHtml = (html: string): string => {
  return html.replace(ANCHOR_HTML_RE, "");
};

// ── Utilities ────────────────────────────────────────────────────────────────

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
