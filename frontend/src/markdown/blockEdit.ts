// Single adapter layer between a block's raw Markdown source and the value an
// editor (plain-text textarea, table grid, image toolbar) works with.
//
// The whole point of this module is isolation: editors must not reimplement
// "how do I map source <-> editor value", and the structural trailing-newline
// rule lives here in exactly one place. All edits still flow through
// `replaceBlockSource` in the store as the single mutation point.

import type { Block } from "../ipc/types";

type BlockSource = Pick<Block, "source">;

const hasTrailingNewline = (value: string): boolean => value.endsWith("\n");

// Re-attach the block's structural trailing newline to a freshly produced body.
// A block keeps its trailing newline iff the original source had one; we never
// add a second newline if the body already ends with one.
export const withBlockTrailing = (block: BlockSource, body: string): string => {
  if (!hasTrailingNewline(block.source) || hasTrailingNewline(body)) return body;
  return `${body}\n`;
};

// Raw block source -> value for a plain-text editor. Strips exactly one
// structural trailing newline so the textarea shows the editable body verbatim,
// including any block markers (`#`, `-`, ```` ``` ````) the user should keep.
export const toEditableText = (block: BlockSource): string =>
  hasTrailingNewline(block.source) ? block.source.slice(0, -1) : block.source;

// Plain-text editor value -> new block source. Normalizes non-breaking spaces
// (browsers insert these around contenteditable/whitespace edits) and restores
// the structural trailing newline. It deliberately does NOT re-add block syntax:
// the editor already operates on raw source, so a list stays a list and a code
// block stays a single fenced block.
export const fromEditableText = (block: BlockSource, value: string): string =>
  withBlockTrailing(block, value.replace(/\u00a0/g, " "));
