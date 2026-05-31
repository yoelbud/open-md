// Pure helpers for the slash-command menu trigger detection and filtering.
// All functions are stateless and unit-testable.

import type { BlockTemplate } from "./document";

export interface SlashTrigger {
  /** The character offset where the "/" starts. */
  queryStart: number;
  /** The typed query text after the "/" (may be empty). */
  query: string;
}

/**
 * Detect whether the caret is currently in a slash-command context.
 * A slash triggers when:
 * - "/" is at the start of a line (column 0), OR
 * - "/" follows only whitespace on the current line.
 *
 * Returns null if no active slash trigger, otherwise the trigger info.
 */
export const detectSlashTrigger = (
  text: string,
  caretOffset: number,
): SlashTrigger | null => {
  if (caretOffset < 0 || caretOffset > text.length) return null;

  // Find the start of the current line.
  let lineStart = caretOffset;
  while (lineStart > 0 && text[lineStart - 1] !== "\n") {
    lineStart--;
  }

  // Get the text from line start to caret.
  const lineBeforeCaret = text.slice(lineStart, caretOffset);

  // Match: optional whitespace, then "/" followed by the query (no spaces in query).
  const match = /^(\s*)\/([\S]*)$/.exec(lineBeforeCaret);
  if (!match) return null;

  const slashPos = lineStart + match[1]!.length;
  const query = match[2]!;

  return { queryStart: slashPos, query };
};

/**
 * Filter the block templates by the given query string.
 * Matches against the template id and label (case-insensitive substring match).
 * Returns all templates if query is empty.
 */
export const filterTemplates = (
  templates: BlockTemplate[],
  query: string,
): BlockTemplate[] => {
  if (!query) return templates;
  const lower = query.toLowerCase();
  return templates.filter(
    (t) =>
      t.id.toLowerCase().includes(lower) ||
      t.label.toLowerCase().includes(lower),
  );
};
