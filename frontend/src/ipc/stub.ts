// Stub IPC layer. In M0 we don't have a Tauri shell yet, so we ship a tiny
// browser-side Markdown segmenter that mirrors the Rust segmenter's output
// shape. This keeps the frontend buildable and demo-able standalone, and
// gets replaced by `invoke('parse_document', ...)` in M1.

import type { Block, BlockKind, DocumentPayload } from "./types";

const blockKindFromLine = (line: string): BlockKind => {
  if (/^#{1,6}\s/.test(line)) return "heading";
  if (/^(\*{3,}|-{3,}|_{3,})\s*$/.test(line)) return "thematic_break";
  if (/^```/.test(line)) return "code";
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

const renderInline = (s: string): string =>
  escapeHtml(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noreferrer">$1</a>',
    );

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
      const body = trimmed.replace(/^```\w*\n?/, "").replace(/```$/, "");
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
    case "table":
      return `<pre>${escapeHtml(trimmed)}</pre>`;
    case "html":
      return trimmed;
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

    if (/^```/.test(startLine)) {
      while (i < lines.length) {
        const ln = lines[i]!;
        buf += "\n" + ln;
        offset += ln.length + 1;
        i++;
        if (/^```/.test(ln)) break;
      }
    } else {
      while (i < lines.length && lines[i]!.trim() !== "") {
        buf += "\n" + lines[i]!;
        offset += lines[i]!.length + 1;
        i++;
      }
    }

    const kind = blockKindFromLine(startLine);
    const hash = hashStr(buf);
    blocks.push({
      id: `b${hash.toString(16).padStart(8, "0")}-${blocks.length}`,
      kind,
      src_range: [start, offset],
      hash,
      source: buf,
      html: renderBlock(kind, buf),
    });
  }

  return { path, blocks };
};
