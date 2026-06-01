// Citations & Bibliography — cross-block resolution layer.
//
// Resolves pandoc-style `[@key]` citations against a bibliography defined
// in a fenced code block with info string `bib` or `bibliography`.
//
// v1 limitations:
// - Single author-year style (no CSL/citeproc).
// - Bibliography source must be a fenced ```bib or ```bibliography block.
// - Only cited entries appear in the rendered references list.
// - No ibid/short-form; every citation renders as (Surname(s), Year).

import type { Block } from "../ipc/types";

// ─── BibTeX Types ────────────────────────────────────────────────────────────

export interface BibEntry {
  /** Entry type (article, book, inproceedings, etc.) */
  type: string;
  /** Cite key used in [@key] references. */
  key: string;
  /** Parsed fields (lowercase keys). */
  fields: Record<string, string>;
}

// ─── Minimal BibTeX Parser ───────────────────────────────────────────────────

/**
 * Parse a BibTeX string into a map of cite-key → BibEntry.
 * Tolerant of whitespace; supports `{...}` and `"..."` field values.
 */
export const parseBibtex = (text: string): Map<string, BibEntry> => {
  const entries = new Map<string, BibEntry>();
  // Match entry starts: @type{key,
  const entryRe = /@(\w+)\s*\{\s*([^,\s]+)\s*,/g;
  let match: RegExpExecArray | null;
  while ((match = entryRe.exec(text)) !== null) {
    const type = match[1]!.toLowerCase();
    const key = match[2]!;
    // Find the body of this entry (from after the key, up to the matching closing brace)
    const bodyStart = match.index + match[0].length;
    const body = extractBraceBody(text, bodyStart);
    if (body === null) continue;
    const fields = parseFields(body);
    entries.set(key, { type, key, fields });
  }
  return entries;
};

/**
 * Extract content until the matching closing `}` for the entry.
 * Handles nested braces.
 */
function extractBraceBody(text: string, start: number): string | null {
  let depth = 1; // we are already inside the opening brace
  let i = start;
  while (i < text.length && depth > 0) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") depth--;
    if (depth > 0) i++;
  }
  if (depth !== 0) return null;
  return text.slice(start, i);
}

/**
 * Parse `field = {value}` or `field = "value"` pairs from a BibTeX body.
 */
function parseFields(body: string): Record<string, string> {
  const fields: Record<string, string> = {};
  let i = 0;
  while (i < body.length) {
    // Skip whitespace and commas
    while (i < body.length && /[\s,]/.test(body[i]!)) i++;
    if (i >= body.length) break;
    // Read field name
    const nameStart = i;
    while (i < body.length && /[\w-]/.test(body[i]!)) i++;
    const name = body.slice(nameStart, i).toLowerCase();
    if (!name) { i++; continue; }
    // Skip whitespace and =
    while (i < body.length && /\s/.test(body[i]!)) i++;
    if (i >= body.length || body[i] !== "=") { continue; }
    i++; // skip =
    while (i < body.length && /\s/.test(body[i]!)) i++;
    if (i >= body.length) break;
    // Read value: braced or quoted or bare word/number
    let value: string;
    if (body[i] === "{") {
      i++; // skip opening brace
      let depth = 1;
      const valStart = i;
      while (i < body.length && depth > 0) {
        if (body[i] === "{") depth++;
        else if (body[i] === "}") depth--;
        if (depth > 0) i++;
      }
      value = body.slice(valStart, i);
      i++; // skip closing brace
    } else if (body[i] === '"') {
      i++; // skip opening quote
      const valStart = i;
      while (i < body.length && body[i] !== '"') i++;
      value = body.slice(valStart, i);
      i++; // skip closing quote
    } else {
      // Bare value (number, month constant, etc.)
      const valStart = i;
      while (i < body.length && /[^\s,}]/.test(body[i]!)) i++;
      value = body.slice(valStart, i);
    }
    fields[name] = value.trim();
  }
  return fields;
}

// ─── Bibliography Extraction from Blocks ─────────────────────────────────────

/** Check if a code block is a bibliography source (info string `bib` or `bibliography`). */
export const isBibBlock = (block: Block): boolean => {
  if (block.kind !== "code") return false;
  const infoMatch = block.source.match(/^```(\w+)/);
  if (!infoMatch) return false;
  const info = infoMatch[1]!.toLowerCase();
  return info === "bib" || info === "bibliography";
};

/** Extract the raw BibTeX text from a bib code block's source. */
export const extractBibSource = (block: Block): string => {
  // Strip opening fence line and closing fence
  const lines = block.source.split("\n");
  // Remove first line (```bib) and last line (```)
  const inner = lines.slice(1);
  // Remove trailing ``` if present
  if (inner.length > 0 && inner[inner.length - 1]!.trim() === "```") {
    inner.pop();
  }
  return inner.join("\n");
};

/**
 * Scan all blocks and build a merged bibliography registry.
 * Multiple bib blocks are merged; duplicate keys: last wins.
 */
export const extractBibliography = (blocks: Block[]): Map<string, BibEntry> => {
  const registry = new Map<string, BibEntry>();
  for (const b of blocks) {
    if (isBibBlock(b)) {
      const text = extractBibSource(b);
      const entries = parseBibtex(text);
      for (const [key, entry] of entries) {
        registry.set(key, entry);
      }
    }
  }
  return registry;
};

// ─── Formatting ──────────────────────────────────────────────────────────────

/** Extract author surname(s) for display. */
export const formatAuthorSurnames = (author: string): string => {
  if (!author) return "??";
  // BibTeX authors separated by " and "
  const authors = author.split(/\s+and\s+/i);
  const surnames = authors.map((a) => {
    // "Last, First" → "Last"; "First Last" → "Last"
    const comma = a.indexOf(",");
    if (comma !== -1) return a.slice(0, comma).trim();
    const parts = a.trim().split(/\s+/);
    return parts[parts.length - 1] ?? a.trim();
  });
  if (surnames.length === 1) return surnames[0]!;
  if (surnames.length === 2) return `${surnames[0]} & ${surnames[1]}`;
  return `${surnames[0]} et al.`;
};

/**
 * Format an inline citation marker: (Author, Year) or (Author, Year, locator).
 */
export const formatInlineCitation = (
  entry: BibEntry,
  locator?: string,
): string => {
  const author = formatAuthorSurnames(entry.fields["author"] ?? "");
  const year = entry.fields["year"] ?? "n.d.";
  const base = `${author}, ${year}`;
  return locator ? `${base}, ${locator}` : base;
};

/**
 * Format a full reference list entry (simple author-year style).
 * Returns plain text (caller wraps in HTML).
 */
export const formatReference = (entry: BibEntry): string => {
  const f = entry.fields;
  const author = f["author"] ?? "Unknown";
  const year = f["year"] ?? "n.d.";
  const title = f["title"] ?? "Untitled";
  const parts: string[] = [`${author} (${year}).`, `${title}.`];
  if (f["journal"]) parts.push(`<em>${escapeHtml(f["journal"])}</em>.`);
  if (f["publisher"]) parts.push(`${f["publisher"]}.`);
  if (f["url"]) parts.push(`<a href="${escapeHtml(f["url"])}">${escapeHtml(f["url"])}</a>`);
  // Escape everything except the explicitly constructed HTML above
  return parts
    .map((p, i) => (i <= 1 ? escapeHtml(p) : p))
    .join(" ");
};

// ─── Citation Token Detection & Replacement ──────────────────────────────────

export interface CitationToken {
  /** Full match text including brackets, e.g. `[@smith2020, p. 12]` */
  full: string;
  /** Individual citation references within this token. */
  refs: { key: string; locator?: string }[];
}

/**
 * Find all citation tokens in text.
 * Supports: `[@key]`, `[@key, p. 12]`, `[@a; @b]`, `[@a, p. 5; @b]`.
 */
export const findCitationTokens = (text: string): CitationToken[] => {
  const tokens: CitationToken[] = [];
  // Match [...] containing at least one @
  const re = /\[([^\]]*@[^\]]*)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const inner = m[1]!;
    // Split by semicolons for multiple citations
    const parts = inner.split(";").map((s) => s.trim());
    const refs: { key: string; locator?: string }[] = [];
    for (const part of parts) {
      const refMatch = part.match(/^@([\w][\w:.#$%&\-+?<>~/]*)/);
      if (!refMatch) continue;
      const key = refMatch[1]!;
      // Everything after the key (with optional comma separator) is the locator
      const rest = part.slice(refMatch[0].length).trim();
      const locator = rest.startsWith(",") ? rest.slice(1).trim() : rest;
      const ref: { key: string; locator?: string } = { key };
      if (locator) ref.locator = locator;
      refs.push(ref);
    }
    if (refs.length > 0) {
      tokens.push({ full: m[0], refs });
    }
  }
  return tokens;
};

/**
 * Replace citation tokens in rendered HTML.
 * Skips content inside <code> and <pre> tags.
 * Calls `onCite(key)` for each successfully resolved key.
 * Returns transformed HTML.
 */
export const replaceCitationTokens = (
  html: string,
  registry: Map<string, BibEntry>,
  onCite: (key: string) => void,
): string => {
  // Split HTML into code-protected segments and non-code segments
  // We'll replace only in non-code parts.
  const codeParts = splitAroundCode(html);
  return codeParts
    .map((segment) => {
      if (segment.isCode) return segment.text;
      return replaceInSegment(segment.text, registry, onCite);
    })
    .join("");
};

interface Segment {
  text: string;
  isCode: boolean;
}

/** Split HTML into alternating code/non-code segments. */
function splitAroundCode(html: string): Segment[] {
  const segments: Segment[] = [];
  // Match <code>...</code> and <pre>...</pre> (non-greedy)
  const re = /<(code|pre)\b[^>]*>[\s\S]*?<\/\1>/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m.index > last) {
      segments.push({ text: html.slice(last, m.index), isCode: false });
    }
    segments.push({ text: m[0], isCode: true });
    last = m.index + m[0].length;
  }
  if (last < html.length) {
    segments.push({ text: html.slice(last), isCode: false });
  }
  return segments;
}

function replaceInSegment(
  text: string,
  registry: Map<string, BibEntry>,
  onCite: (key: string) => void,
): string {
  const tokens = findCitationTokens(text);
  if (!tokens.length) return text;
  let result = text;
  for (const token of tokens) {
    const parts: string[] = [];
    let allResolved = true;
    for (const ref of token.refs) {
      const entry = registry.get(ref.key);
      if (entry) {
        onCite(ref.key);
        const label = escapeHtml(formatInlineCitation(entry, ref.locator));
        parts.push(
          `<a class="om-cite" href="#cite-${escapeHtml(ref.key)}">${label}</a>`,
        );
      } else {
        allResolved = false;
        parts.push(
          `<span class="om-cite-missing">[@${escapeHtml(ref.key)}?]</span>`,
        );
      }
    }
    const replacement = allResolved
      ? `(<span class="om-cite-group">${parts.join("; ")}</span>)`
      : parts.join("; ");
    result = result.replace(token.full, replacement);
  }
  return result;
}

// ─── Bibliography/References Token & Rendering ───────────────────────────────

/**
 * Check whether a paragraph block is a `[bibliography]` or `[references]` token.
 */
export const isBibliographyToken = (block: Block): boolean =>
  block.kind === "paragraph" &&
  /^\[(bibliography|references)\]$/i.test(block.source.trim());

/**
 * Render the references list HTML for all cited entries.
 * Entries sorted by author surname then year.
 */
export const renderReferencesHtml = (
  registry: Map<string, BibEntry>,
  citedKeys: Set<string>,
): string => {
  if (citedKeys.size === 0) {
    return '<section class="om-references"><p><em>(No cited references)</em></p></section>';
  }
  const entries = [...citedKeys]
    .map((k) => registry.get(k))
    .filter((e): e is BibEntry => e !== undefined)
    .sort((a, b) => {
      const aAuth = (a.fields["author"] ?? "").toLowerCase();
      const bAuth = (b.fields["author"] ?? "").toLowerCase();
      if (aAuth !== bAuth) return aAuth < bAuth ? -1 : 1;
      const aYear = a.fields["year"] ?? "";
      const bYear = b.fields["year"] ?? "";
      return aYear < bYear ? -1 : aYear > bYear ? 1 : 0;
    });
  const items = entries.map(
    (e) =>
      `<li id="cite-${escapeHtml(e.key)}" class="om-reference">${formatReference(e)}</li>`,
  );
  return `<section class="om-references" aria-label="References"><h2>References</h2><ol>\n${items.join("\n")}\n</ol></section>`;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
