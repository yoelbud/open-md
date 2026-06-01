// Outline utilities: extract heading entries from document blocks for the
// Outline panel and [TOC] rendering.

import type { Block } from "../ipc/types";

export interface HeadingEntry {
  /** Block id for scroll targeting. */
  id: string;
  /** Heading level (1–6). */
  level: number;
  /** Plain text of the heading (without leading `#` markers). */
  text: string;
  /** Character offset in source for editing-point navigation. */
  sourceOffset: number;
  /** Slug for anchor linking (lowercase, hyphenated). */
  slug: string;
}

/** Parse heading level from a heading block's source (count leading `#`). */
export const parseHeadingLevel = (source: string): number => {
  const match = source.match(/^(#{1,6})\s/);
  return match ? match[1]!.length : 1;
};

/** Extract the plain text from a heading block's source. */
export const parseHeadingText = (source: string): string => {
  return source.replace(/^#{1,6}\s+/, "").replace(/\s+$/, "");
};

/** Generate a URL-friendly slug from heading text. */
export const slugify = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

/** Extract all heading entries from a list of blocks. */
export const extractHeadings = (blocks: Block[]): HeadingEntry[] =>
  blocks
    .filter((b) => b.kind === "heading")
    .map((b) => {
      const level = parseHeadingLevel(b.source);
      const text = parseHeadingText(b.source);
      return {
        id: b.id,
        level,
        text,
        sourceOffset: b.src_range[0],
        slug: slugify(text),
      };
    });

/** Check whether a paragraph block's source is exactly `[TOC]`. */
export const isTocToken = (block: Block): boolean =>
  block.kind === "paragraph" && block.source.trim() === "[TOC]";

/** Render [TOC] as an HTML nested list of anchor links. */
export const renderTocHtml = (headings: HeadingEntry[]): string => {
  if (!headings.length) return "<p><em>(empty table of contents)</em></p>";
  const items = headings.map((h) => {
    const indent = "  ".repeat(h.level - 1);
    return `${indent}<li class="toc-level-${h.level}"><a href="#heading-${h.id}">${escapeHtml(h.text)}</a></li>`;
  });
  return `<nav class="om-toc" aria-label="Table of contents"><ul>\n${items.join("\n")}\n</ul></nav>`;
};

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
