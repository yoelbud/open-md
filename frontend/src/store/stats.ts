// Pure functions for document statistics: word count, character count, and
// estimated reading time. Operates on the raw Markdown source string.
//
// Word counting strategy: we split on whitespace and count non-empty tokens.
// Markdown syntax (headings markers, link brackets, etc.) is left in — this
// gives a slightly inflated count compared to rendered prose, but is fast,
// deterministic, and avoids the complexity of a full Markdown stripper. The
// trade-off is documented and acceptable for an editor status bar.

/** Count words by splitting on Unicode whitespace and filtering empties. */
export const countWords = (text: string): number => {
  if (!text) return 0;
  // Match sequences of non-whitespace characters.
  const matches = text.match(/\S+/g);
  return matches ? matches.length : 0;
};

/** Count characters (Unicode code points, not UTF-16 code units). */
export const countChars = (text: string): number => {
  if (!text) return 0;
  // Spread handles surrogate pairs correctly for multibyte characters.
  return [...text].length;
};

/** Estimated reading time in minutes at the given words-per-minute rate. */
export const readingTime = (wordCount: number, wpm = 200): number => {
  if (wordCount <= 0 || wpm <= 0) return 0;
  return wordCount / wpm;
};

/** Format reading time as a human-friendly string. */
export const formatReadingTime = (minutes: number): string => {
  if (minutes < 1) return "< 1 min read";
  const rounded = Math.ceil(minutes);
  return `${rounded} min read`;
};

export interface DocumentStats {
  words: number;
  chars: number;
  readingTimeMinutes: number;
}

/** Compute all document statistics from a source string. */
export const computeStats = (text: string): DocumentStats => {
  const words = countWords(text);
  const chars = countChars(text);
  const readingTimeMinutes = readingTime(words);
  return { words, chars, readingTimeMinutes };
};
