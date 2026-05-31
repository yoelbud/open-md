// Stub IPC layer. In M0 we don't have a Tauri shell yet, so we ship a tiny
// browser-side Markdown segmenter that mirrors the Rust segmenter's output
// shape. This keeps the frontend buildable and demo-able standalone, and
// gets replaced by `invoke('parse_document', ...)` in M1.

import type {
  Annotations,
  Block,
  BlockKind,
  BlockPreviewMeta,
  DocumentPayload,
  MarkRange,
  MarkdownTable,
} from "./types";
import { IMAGE_MARKDOWN_RE, parseImageBlock, parseImageDimension, type ParsedImage } from "../markdown/image";
import { parseMarkdownTable } from "../markdown/table";

const renderImgTag = (img: ParsedImage): string => {
  const styles: string[] = [];
  if (img.width) styles.push(`width:${img.width}`);
  if (img.height) styles.push(`height:${img.height}`);
  if (!img.width && !img.height) styles.push("max-width:100%");
  const attrs = [
    `src="${escapeAttr(img.src)}"`,
    `data-om-src="${escapeAttr(img.src)}"`,
    `alt="${escapeAttr(img.alt)}"`,
    img.title ? `title="${escapeAttr(img.title)}"` : "",
    `style="${styles.join(";")}"`,
    `loading="lazy"`,
    `draggable="false"`,
  ]
    .filter(Boolean)
    .join(" ");
  return `<img ${attrs}/>`;
};

const escapeAttr = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Curated palette mirroring `COLOR_PALETTE` in `crates/om-render`.
const COLOR_PALETTE = new Set([
  "red", "orange", "amber", "yellow", "green", "teal", "blue", "purple", "pink", "gray", "white",
  "black",
]);

// Sentinel marker for spliced annotation HTML that must survive HTML escaping
// inside `renderInline` (mirrors the image placeholder mechanism).
const PH_OPEN = "\u0000PH";
const PH_CLOSE = "\u0000";

/**
 * Build the open/close HTML for a set of marks (`highlight`, `fg-<color>`,
 * `bg-<color>`). Returns `null` when the set is empty or contains a mark outside
 * the supported palette. Mirrors `mark_wrappers` in `crates/om-render`.
 */
const markWrappers = (marks: string[]): { open: string; close: string } | null => {
  let highlight = false;
  const classes: string[] = [];
  for (const mark of marks) {
    if (mark === "highlight") {
      highlight = true;
      continue;
    }
    const dash = mark.indexOf("-");
    if (dash < 0) return null;
    const prefix = mark.slice(0, dash);
    const color = mark.slice(dash + 1);
    if ((prefix !== "fg" && prefix !== "bg") || !COLOR_PALETTE.has(color)) return null;
    classes.push(`om-${prefix}-${color}`);
  }
  let open = "";
  let close = "";
  if (highlight) {
    open += '<mark class="om-mark">';
    close = `</mark>${close}`;
  }
  if (classes.length) {
    open += `<span class="${classes.join(" ")}">`;
    close = `</span>${close}`;
  }
  return open ? { open, close } : null;
};

// Block kinds whose source text accepts an inline annotation overlay (mirrors
// `overlay_eligible` in `crates/om-render`).
const overlayEligible = (kind: BlockKind): boolean =>
  kind === "paragraph" ||
  kind === "heading" ||
  kind === "list" ||
  kind === "task_list" ||
  kind === "block_quote";

/**
 * Splice annotation sentinels into `source` at the character offsets described
 * by `ranges`, returning the rewritten source plus the placeholder HTML the
 * sentinels stand for. Overlapping ranges and ranges with no valid marks are
 * skipped. Mirrors `inject_marks` in `crates/om-render`.
 */
const injectMarkSentinels = (
  source: string,
  ranges: MarkRange[],
): { text: string; placeholders: string[] } => {
  const chars = Array.from(source);
  const charLen = chars.length;
  const spans: { start: number; end: number; open: string; close: string }[] = [];
  for (const range of ranges) {
    if (range.start >= range.end || range.marks.length === 0) continue;
    const wrappers = markWrappers(range.marks);
    if (!wrappers) continue;
    const start = Math.min(range.start, charLen);
    const end = Math.min(range.end, charLen);
    if (start >= end) continue;
    spans.push({ start, end, open: wrappers.open, close: wrappers.close });
  }
  if (!spans.length) return { text: source, placeholders: [] };
  spans.sort((a, b) => a.start - b.start);

  const placeholders: string[] = [];
  const sentinel = (html: string): string => {
    placeholders.push(html);
    return `${PH_OPEN}${placeholders.length - 1}${PH_CLOSE}`;
  };

  let out = "";
  let next = 0;
  let active: number | null = null;
  let lastEnd = 0;
  for (let i = 0; i < charLen; i++) {
    if (active !== null && spans[active]!.end === i) {
      out += sentinel(spans[active]!.close);
      active = null;
    }
    if (active === null) {
      while (next < spans.length && spans[next]!.start < lastEnd) next++;
      if (next < spans.length && spans[next]!.start === i) {
        out += sentinel(spans[next]!.open);
        lastEnd = spans[next]!.end;
        active = next;
        next++;
      }
    }
    out += chars[i];
  }
  if (active !== null) out += sentinel(spans[active]!.close);
  return { text: out, placeholders };
};

const CALLOUT_TITLES: Record<string, string> = {
  note: "Note",
  tip: "Tip",
  important: "Important",
  warning: "Warning",
  caution: "Caution",
};

type StubCallout = { kind: string; title: string; body: string };

const stripQuoteMarker = (line: string): string => line.replace(/^\s*>\s?/, "");

const parseCalloutStub = (source: string): StubCallout | null => {
  const inner = source.split(/\r?\n/).map(stripQuoteMarker);
  let idx = 0;
  while (idx < inner.length && inner[idx]!.trim() === "") idx++;
  const marker = (inner[idx] ?? "").trim();
  const match = /^\[!(\w+)\](.*)$/.exec(marker);
  if (!match) return null;
  const kind = match[1]!.toLowerCase();
  if (!(kind in CALLOUT_TITLES)) return null;
  const title = match[2]!.trim() || CALLOUT_TITLES[kind]!;
  const body = inner
    .slice(idx + 1)
    .join("\n")
    .replace(/^\n+|\n+$/g, "");
  return { kind, title, body };
};

const renderCallout = (callout: StubCallout): string =>
  `<div class="om-callout om-callout-${callout.kind}" data-callout="${callout.kind}">` +
  `<div class="om-callout-title"><span class="om-callout-icon" aria-hidden="true"></span>${escapeHtml(callout.title)}</div>` +
  `<div class="om-callout-body"><p>${renderInline(callout.body)}</p></div></div>`;

const blockKindFromLine = (line: string): BlockKind => {
  if (/^#{1,6}\s/.test(line)) return "heading";
  if (/^(\*{3,}|-{3,}|_{3,})\s*$/.test(line)) return "thematic_break";
  if (/^(```|~~~)/.test(line)) return "code";
  if (/^>\s?/.test(line)) return "block_quote";
  if (/^\s*[-*+]\s\[[ xX]\]\s/.test(line)) return "task_list";
  if (/^\s*([-*+]|\d+\.)\s/.test(line)) return "list";
  if (/^\|.*\|\s*$/.test(line)) return "table";
  if (/^\s*<[a-zA-Z]/.test(line)) return "html";
  return "paragraph";
};

// Very small inline renderer for the M0 demo (bold/italic/code/link only).
const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const renderInline = (s: string, extra: string[] = []): string => {
  // Pull images out first (before escaping) so we can emit raw <img> tags.
  // `extra` pre-seeds placeholders with spliced annotation HTML (see
  // `injectMarkSentinels`) so it survives escaping too.
  const placeholders: string[] = [...extra];
  const withImgs = s.replace(IMAGE_MARKDOWN_RE, (_match, alt, src, title, size) => {
    const [w, h] = (size ?? "x").split("x");
    const tag = renderImgTag({
      alt: alt ?? "",
      src: src ?? "",
      title: title ?? "",
      width: parseImageDimension(w),
      height: parseImageDimension(h),
      align: null,
    });
    placeholders.push(tag);
    return `${PH_OPEN}${placeholders.length - 1}${PH_CLOSE}`;
  });
  return escapeHtml(withImgs)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>")
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noreferrer">$1</a>',
    )
    .replace(/\u0000PH(\d+)\u0000/g, (_m, i) => placeholders[+i] ?? "");
};

const tableAlignAttr = (alignment: MarkdownTable["alignments"][number]) =>
  alignment === "default" ? "" : ` style="text-align:${alignment}"`;

const renderTable = (table: MarkdownTable): string => {
  const headers = table.headers
    .map((cell, index) => `<th${tableAlignAttr(table.alignments[index] ?? "default")}>${renderInline(cell)}</th>`)
    .join("");
  const rows = table.rows
    .map((row) => {
      const cells = row
        .map((cell, index) => `<td${tableAlignAttr(table.alignments[index] ?? "default")}>${renderInline(cell)}</td>`)
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  return `<table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
};

const fencedCode = (source: string): { info: string; body: string } | null => {
  const normalized = source.trimEnd();
  const match = /^(```|~~~)([^\n]*)\n?([\s\S]*?)\n?\1$/.exec(normalized);
  if (!match) return null;
  return { info: match[2]?.trim() ?? "", body: match[3] ?? "" };
};

const isMermaidInfo = (info: string): boolean =>
  (info.split(/\s+/)[0] ?? "").toLowerCase() === "mermaid";

const previewMetaForBlock = (kind: BlockKind, source: string): BlockPreviewMeta | undefined => {
  if (kind !== "table") return undefined;
  const table = parseMarkdownTable(source);
  return table ? { table } : undefined;
};

const renderBlock = (kind: BlockKind, source: string, marks: string[] = []): string => {
  const trimmed = source.trimEnd();
  switch (kind) {
    case "heading": {
      const m = /^(#{1,6})\s+(.*)$/m.exec(trimmed);
      if (!m) return `<p>${renderInline(trimmed, marks)}</p>`;
      const level = m[1]!.length;
      return `<h${level}>${renderInline(m[2]!, marks)}</h${level}>`;
    }
    case "thematic_break":
      return "<hr/>";
    case "code": {
      const code = fencedCode(trimmed);
      const body = code?.body ?? trimmed.replace(/^```\w*\n?/, "").replace(/```$/, "");
      if (code && isMermaidInfo(code.info)) {
        return `<pre class="mermaid" data-om-mermaid>${escapeHtml(body)}</pre>`;
      }
      const lang = code ? (code.info.split(/\s+/)[0] ?? "") : "";
      const pre = `<pre><code${
        lang ? ` class="language-${escapeAttr(lang)}"` : ""
      }>${escapeHtml(body)}</code></pre>`;
      if (lang) {
        return `<figure class="om-code" data-lang="${escapeAttr(lang)}"><figcaption>${escapeHtml(
          lang,
        )}</figcaption>${pre}</figure>`;
      }
      return pre;
    }
    case "callout": {
      const callout = parseCalloutStub(trimmed);
      if (callout) return renderCallout(callout);
      return `<blockquote>${renderInline(trimmed.replace(/^>\s?/gm, ""), marks)}</blockquote>`;
    }
    case "block_quote":
      return `<blockquote>${renderInline(
        trimmed.replace(/^>\s?/gm, ""),
        marks,
      )}</blockquote>`;
    case "list":
    case "task_list": {
      const items = trimmed
        .split(/\n/)
        .map((l) => l.replace(/^\s*([-*+]|\d+\.)\s/, ""))
        .map((l) => `<li>${renderInline(l, marks)}</li>`)
        .join("");
      return `<ul>${items}</ul>`;
    }
    case "table": {
      const table = parseMarkdownTable(trimmed);
      return table ? renderTable(table) : `<pre>${escapeHtml(trimmed)}</pre>`;
    }
    case "html":
      return trimmed;
    case "image": {
      const img = parseImageBlock(trimmed);
      if (!img) return `<p>${renderInline(trimmed, marks)}</p>`;
      const alignClass = img.align ? ` om-img-${img.align}` : "";
      return `<div class="om-img-wrap${alignClass}">${renderImgTag(img)}</div>`;
    }
    default:
      return `<p>${renderInline(trimmed, marks)}</p>`;
  }
};

// Plain rendering: standard Markdown only — no callout/code chrome, no mermaid
// diagrams, no image align/size, and no annotation overlay. Mirrors
// `render_block_plain` in `crates/om-render`; this is the "regular Markdown
// preview" and the raw-export source.
const renderBlockPlain = (kind: BlockKind, source: string): string => {
  const trimmed = source.trimEnd();
  switch (kind) {
    case "heading": {
      const m = /^(#{1,6})\s+(.*)$/m.exec(trimmed);
      if (!m) return `<p>${renderInline(trimmed)}</p>`;
      const level = m[1]!.length;
      return `<h${level}>${renderInline(m[2]!)}</h${level}>`;
    }
    case "thematic_break":
      return "<hr/>";
    case "code": {
      const code = fencedCode(trimmed);
      const body = code?.body ?? trimmed.replace(/^```\w*\n?/, "").replace(/```$/, "");
      const lang = code ? (code.info.split(/\s+/)[0] ?? "") : "";
      return `<pre><code${
        lang ? ` class="language-${escapeAttr(lang)}"` : ""
      }>${escapeHtml(body)}</code></pre>`;
    }
    case "callout":
    case "block_quote":
      return `<blockquote>${renderInline(trimmed.replace(/^>\s?/gm, ""))}</blockquote>`;
    case "list":
    case "task_list": {
      const items = trimmed
        .split(/\n/)
        .map((l) => l.replace(/^\s*([-*+]|\d+\.)\s/, ""))
        .map((l) => `<li>${renderInline(l)}</li>`)
        .join("");
      return `<ul>${items}</ul>`;
    }
    case "table": {
      const table = parseMarkdownTable(trimmed);
      return table ? renderTable(table) : `<pre>${escapeHtml(trimmed)}</pre>`;
    }
    case "html":
      return trimmed;
    case "image": {
      const img = parseImageBlock(trimmed);
      if (!img) return `<p>${renderInline(trimmed)}</p>`;
      return `<p><img src="${escapeAttr(img.src)}" data-om-src="${escapeAttr(
        img.src,
      )}" alt="${escapeAttr(img.alt)}"/></p>`;
    }
    default:
      return `<p>${renderInline(trimmed)}</p>`;
  }
};

// xxhash placeholder: a deterministic, fast 32-bit FNV-1a is enough for M0.
const hashStr = (s: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
};

const rangesForBlock = (annotations: Annotations | undefined, index: number): MarkRange[] => {
  if (!annotations) return [];
  const entry = annotations.blocks.find((block) => block.index === index);
  return entry ? entry.ranges : [];
};

export const parseDocument = (
  source: string,
  path = "(untitled).md",
  annotations?: Annotations,
): DocumentPayload => {
  // Split on blank lines, preserving fenced code blocks as one unit.
  const blocks: Block[] = [];
  const lines = source.split(/\r?\n/);
  let i = 0;
  let offset = 0;

  while (i < lines.length) {
    // Skip blank lines.
    while (i < lines.length && lines[i]!.trim() === "") {
      offset += lines[i]!.length + 1;
      i++;
    }
    if (i >= lines.length) break;

    const start = offset;
    const startLine = lines[i]!;
    let buf = startLine;
    offset += startLine.length + 1;
    i++;

    const fence = /^(```|~~~)/.exec(startLine)?.[1];
    if (fence) {
      while (i < lines.length) {
        const ln = lines[i]!;
        buf += "\n" + ln;
        offset += ln.length + 1;
        i++;
        if (ln.startsWith(fence)) break;
      }
    } else {
      while (i < lines.length && lines[i]!.trim() !== "") {
        buf += "\n" + lines[i]!;
        offset += lines[i]!.length + 1;
        i++;
      }
    }

    const kind: BlockKind = parseImageBlock(buf)
      ? "image"
      : /^\s*>/.test(startLine) && parseCalloutStub(buf)
        ? "callout"
        : blockKindFromLine(startLine);
    const slice = source.slice(start, offset);
    const hash = hashStr(slice);
    const preview = previewMetaForBlock(kind, buf);

    const ranges = rangesForBlock(annotations, blocks.length);
    const richSource =
      ranges.length && overlayEligible(kind) ? injectMarkSentinels(buf, ranges) : null;
    const html = richSource
      ? renderBlock(kind, richSource.text, richSource.placeholders)
      : renderBlock(kind, buf);

    blocks.push({
      id: `b${hash.toString(16).padStart(8, "0")}-${blocks.length}`,
      kind,
      src_range: [start, offset],
      hash,
      source: slice,
      html,
      plain_html: renderBlockPlain(kind, buf),
      ...(preview ? { preview } : {}),
    });
  }

  return { path, blocks };
};
