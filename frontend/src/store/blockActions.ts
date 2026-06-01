/**
 * Block actions — pure helpers and impure glue for the context menu.
 *
 * Pure functions (turnInto, blockAs*, anchorNameFor, uniqueAnchorName) are
 * heavily unit-tested. The impure wrappers below them call into document.ts
 * and comments.ts store APIs.
 */

import type { Block } from "../ipc/types";
import {
  insertBlockAfter,
  replaceBlockSource,
  useDocument,
} from "./document";
import { parseAnchor, stripAnchor, buildAnchorMap } from "../panes/preview/blockRefs";
import { slugify, parseHeadingText } from "./outline";
import { addComment, useCommentsVisible, toggleCommentsPanel } from "./comments";

// ── Types ────────────────────────────────────────────────────────────────────

export type TurnIntoKind =
  | "paragraph"
  | "h1"
  | "h2"
  | "h3"
  | "quote"
  | "code"
  | "ul"
  | "ol";

// ── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Derive plain text lines from a block's markdown source by stripping
 * structural markers (heading hashes, quote `>`, list markers, code fences).
 */
const extractPlainLines = (source: string): string[] => {
  const lines = source.split("\n");

  // Detect code fence
  if (/^```/.test(lines[0] ?? "")) {
    // Drop opening and closing fence lines
    const inner = lines.slice(1);
    const closeIdx = inner.findIndex((l) => /^```/.test(l));
    const content = closeIdx >= 0 ? inner.slice(0, closeIdx) : inner;
    return content;
  }

  // Heading: strip leading #{1,6}\s from first line
  if (/^#{1,6}\s/.test(lines[0] ?? "")) {
    return [lines[0]!.replace(/^#{1,6}\s+/, ""), ...lines.slice(1)];
  }

  // Quote: strip leading `> ` or `>` per line
  if (/^>\s?/.test(lines[0] ?? "")) {
    return lines.map((l) => l.replace(/^>\s?/, ""));
  }

  // Unordered list: strip leading `- `, `* `, `+ `
  if (/^[-*+]\s/.test(lines[0] ?? "")) {
    return lines.map((l) => l.replace(/^[-*+]\s/, ""));
  }

  // Ordered list: strip leading `\d+. `
  if (/^\d+\.\s/.test(lines[0] ?? "")) {
    return lines.map((l) => l.replace(/^\d+\.\s/, ""));
  }

  return lines;
};

/**
 * Convert a block's markdown source to the target kind.
 * NOTE: operates on stripAnchor(source) — the trailing ^anchor is dropped
 * intentionally; callers wanting to preserve it must re-append.
 */
export const turnInto = (source: string, kind: TurnIntoKind): string => {
  const clean = stripAnchor(source);
  const lines = extractPlainLines(clean);
  const nonEmpty = lines.filter((l) => l.trim() !== "");

  switch (kind) {
    case "paragraph":
      return lines.join("\n").replace(/\s+$/, "");
    case "h1":
      return "# " + nonEmpty.join(" ");
    case "h2":
      return "## " + nonEmpty.join(" ");
    case "h3":
      return "### " + nonEmpty.join(" ");
    case "quote":
      return lines.map((l) => "> " + l).join("\n").replace(/\s+$/, "");
    case "code":
      return "```\n" + lines.join("\n").replace(/\s+$/, "") + "\n```";
    case "ul":
      return nonEmpty.map((l) => "- " + l).join("\n");
    case "ol":
      return nonEmpty.map((l, i) => `${i + 1}. ` + l).join("\n");
  }
};

/** Return block source trimmed of trailing newlines. */
export const blockAsMarkdown = (block: Block): string =>
  block.source.replace(/\n+$/, "");

/** Return block HTML (rich or plain depending on caller). */
export const blockAsHtml = (block: Block, rich: boolean): string =>
  rich ? block.html : block.plain_html;

/** Extract plain text from HTML via a temporary DOM element. */
export const blockAsPlainText = (html: string): string => {
  const d = document.createElement("div");
  d.innerHTML = html;
  return (d.textContent ?? "").trim();
};

/**
 * Derive a deterministic anchor name for a block:
 * - If block already has a ^anchor, use it.
 * - Otherwise slugify the heading text or first 24 chars of source.
 * - Fallback: "block".
 */
export const anchorNameFor = (block: Block): string => {
  const existing = parseAnchor(block.source);
  if (existing) return existing;
  const text = parseHeadingText(block.source) || block.source.slice(0, 24);
  return slugify(text) || "block";
};

/**
 * Given a base name and a set of taken names, return a unique variant.
 * Appends `-2`, `-3`, … if base is already taken.
 */
export const uniqueAnchorName = (base: string, taken: Set<string>): string => {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
};

// ── Clipboard helper ─────────────────────────────────────────────────────────

export const copyText = async (text: string): Promise<void> => {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
  }
};

// ── Impure action glue ───────────────────────────────────────────────────────

const stripTrailingBlank = (s: string): string => s.replace(/\n+$/, "");

export const duplicateBlock = (block: Block) => {
  insertBlockAfter(block, stripTrailingBlank(block.source) + "\n\n");
};

export const turnBlockInto = (block: Block, kind: TurnIntoKind) => {
  replaceBlockSource(block, turnInto(block.source, kind));
};

export const copyBlockReference = async (block: Block): Promise<void> => {
  const blocks = useDocument().blocks;
  let name = parseAnchor(block.source);
  if (!name) {
    const taken = new Set(buildAnchorMap(blocks).keys());
    name = uniqueAnchorName(anchorNameFor(block), taken);
    replaceBlockSource(block, stripTrailingBlank(block.source) + " ^" + name);
  }
  await copyText("[[^" + name + "]]");
};

export const addCommentToBlock = (block: Block) => {
  const body =
    typeof window !== "undefined" ? window.prompt("Add a comment:") : null;
  if (body && body.trim()) {
    addComment({ blockId: block.id, body: body.trim() });
    if (!useCommentsVisible()()) toggleCommentsPanel();
  }
};
