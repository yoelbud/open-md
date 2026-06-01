// Pure search/match logic for Find & Replace.

export type SearchMatch = { start: number; end: number };

export type SearchOptions = {
  regex: boolean;
  caseSensitive: boolean;
};

/**
 * Find all non-overlapping matches of `query` in `text`.
 * Returns an empty array for empty query or invalid regex.
 * Zero-width matches are skipped to avoid infinite loops.
 */
export const findMatches = (
  text: string,
  query: string,
  options: SearchOptions,
): SearchMatch[] => {
  if (!query) return [];

  if (options.regex) {
    let re: RegExp;
    try {
      re = new RegExp(query, options.caseSensitive ? "g" : "gi");
    } catch {
      return [];
    }
    const results: SearchMatch[] = [];
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      if (match[0].length === 0) {
        // Advance past zero-width match to prevent infinite loop.
        re.lastIndex = match.index + 1;
        continue;
      }
      results.push({ start: match.index, end: match.index + match[0].length });
    }
    return results;
  }

  // Plain text search.
  const haystack = options.caseSensitive ? text : text.toLowerCase();
  const needle = options.caseSensitive ? query : query.toLowerCase();
  if (!needle) return [];

  const results: SearchMatch[] = [];
  let pos = 0;
  while (pos <= haystack.length - needle.length) {
    const idx = haystack.indexOf(needle, pos);
    if (idx < 0) break;
    results.push({ start: idx, end: idx + needle.length });
    pos = idx + needle.length;
  }
  return results;
};

/**
 * Given a sorted list of matches and a cursor position, find the index of the
 * next match at or after `cursor`. Wraps around. Returns -1 if no matches.
 */
export const nextMatchIndex = (
  matches: SearchMatch[],
  cursor: number,
): number => {
  if (matches.length === 0) return -1;
  for (let i = 0; i < matches.length; i++) {
    if (matches[i]!.start >= cursor) return i;
  }
  return 0; // wrap
};

/**
 * Previous match (at or before cursor start). Wraps around.
 */
export const prevMatchIndex = (
  matches: SearchMatch[],
  cursor: number,
): number => {
  if (matches.length === 0) return -1;
  for (let i = matches.length - 1; i >= 0; i--) {
    if (matches[i]!.start < cursor) return i;
  }
  return matches.length - 1; // wrap
};
