// Stub IPC layer. In M0 we don't have a Tauri shell yet, so we ship a tiny
// browser-side Markdown segmenter that mirrors the Rust segmenter's output
// shape. This keeps the frontend buildable and demo-able standalone, and
// gets replaced by `invoke('parse_document', ...)` in M1.

import type { Block, BlockKind, BlockPreviewMeta, DocumentPayload, MarkdownTable } from "./types";
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

const renderInline = (s: string): string => {
  // Pull images out first (before escaping) so we can emit raw <img> tags.
  const placeholders: string[] = [];
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
    return `\u0000IMG${placeholders.length - 1}\u0000`;
  });
  return escapeHtml(withImgs)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noreferrer">$1</a>',
    )
    .replace(/\u0000IMG(\d+)\u0000/g, (_m, i) => placeholders[+i] ?? "");
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

const renderBlock = (kind: BlockKind, source: string): string => {
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
      if (code && isMermaidInfo(code.info)) {
        return `<pre class="mermaid" data-om-mermaid>${escapeHtml(body)}</pre>`;
      }
      return `<pre><code>${escapeHtml(body)}</code></pre>`;
    }
    case "block_quote":
      return `<blockquote>${renderInline(
        trimmed.replace(/^>\s?/gm, ""),
      )}</blockquote>`;
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
      const alignClass = img.align ? ` om-img-${img.align}` : "";
      return `<div class="om-img-wrap${alignClass}">${renderImgTag(img)}</div>`;
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

export const parseDocument = (
  source: string,
  path = "(untitled).md",
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

    const kind: BlockKind = parseImageBlock(buf) ? "image" : blockKindFromLine(startLine);
    const slice = source.slice(start, offset);
    const hash = hashStr(slice);
    const preview = previewMetaForBlock(kind, buf);
    blocks.push({
      id: `b${hash.toString(16).padStart(8, "0")}-${blocks.length}`,
      kind,
      src_range: [start, offset],
      hash,
      source: slice,
      html: renderBlock(kind, buf),
      ...(preview ? { preview } : {}),
    });
  }

  return { path, blocks };
};
