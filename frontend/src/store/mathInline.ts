/**
 * Inline math scanner — splits a text string into alternating text and math
 * segments based on `$...$` delimiters.
 *
 * Guards:
 * - `\$` is treated as an escaped literal dollar (not a delimiter).
 * - Empty delimiters `$$` are skipped (those are block-level display math).
 * - The character immediately inside the dollars must be non-space
 *   (avoids matching currency like "$5 and $7").
 * - Does not match across newlines.
 * - Segments inside `<code>`, `<pre>`, or existing KaTeX output are handled
 *   at the DOM level (not here — this function is text-node only).
 */

export interface MathSegment {
  type: "text" | "math";
  value: string;
}

/**
 * Split a plain-text string into text and inline-math segments.
 *
 * Inline math is delimited by single `$` signs, with the following rules:
 * - The opening `$` must NOT be preceded by `\` (escaped).
 * - The character immediately after the opening `$` must not be whitespace.
 * - The character immediately before the closing `$` must not be whitespace.
 * - The closing `$` must NOT be followed by a digit (avoids "$5" currency).
 * - No `$$` (those are block-level).
 * - No newlines inside the math span.
 */
export function splitInlineMath(text: string): MathSegment[] {
  const segments: MathSegment[] = [];
  let i = 0;
  let textStart = 0;

  while (i < text.length) {
    // Handle escaped dollar
    if (text[i] === "\\" && i + 1 < text.length && text[i + 1] === "$") {
      i += 2;
      continue;
    }

    if (text[i] === "$") {
      // Skip `$$` (block-level display math delimiter)
      if (i + 1 < text.length && text[i + 1] === "$") {
        i += 2;
        continue;
      }

      // Check character immediately after opening $
      const afterOpen = i + 1 < text.length ? text[i + 1] : undefined;
      if (!afterOpen || afterOpen === " " || afterOpen === "\t" || afterOpen === "\n") {
        i++;
        continue;
      }

      // Scan for closing $
      let j = i + 1;
      let found = false;
      while (j < text.length) {
        if (text[j] === "\n") break; // no newlines inside
        if (text[j] === "\\" && j + 1 < text.length && text[j + 1] === "$") {
          j += 2;
          continue;
        }
        if (text[j] === "$") {
          // Closing $ must not be `$$`
          if (j + 1 < text.length && text[j + 1] === "$") {
            j += 2;
            continue;
          }
          // Character before closing $ must not be whitespace
          const beforeClose = text[j - 1];
          if (beforeClose === " " || beforeClose === "\t") {
            j++;
            continue;
          }
          // Character after closing $ must not be a digit (currency guard)
          const afterClose = j + 1 < text.length ? text[j + 1] : undefined;
          if (afterClose && /\d/.test(afterClose)) {
            j++;
            continue;
          }
          found = true;
          break;
        }
        j++;
      }

      if (found) {
        // Flush preceding text
        if (i > textStart) {
          segments.push({ type: "text", value: text.slice(textStart, i) });
        }
        // Extract math content (between the dollars)
        const math = text.slice(i + 1, j);
        segments.push({ type: "math", value: math });
        i = j + 1;
        textStart = i;
      } else {
        i++;
      }
    } else {
      i++;
    }
  }

  // Flush remaining text
  if (textStart < text.length) {
    segments.push({ type: "text", value: text.slice(textStart) });
  }

  return segments;
}
