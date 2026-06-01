/**
 * Pure helpers for text-selection context menu actions.
 * Operates on Unicode scalar offsets (matching charIndex semantics).
 */

/**
 * Toggle a wrap marker (e.g. `**`, `*`, `` ` ``) around a selection span.
 * If the span is already immediately surrounded by the marker, remove it;
 * otherwise wrap it. Uses Array.from for proper Unicode scalar indexing.
 */
export const toggleWrap = (
  source: string,
  start: number,
  end: number,
  marker: string,
): string => {
  const chars = Array.from(source);
  const mLen = marker.length;
  const markerChars = Array.from(marker);

  // Check if already wrapped: chars before start and after end equal marker
  const before = chars.slice(start - mLen, start);
  const after = chars.slice(end, end + mLen);

  if (
    before.length === mLen &&
    after.length === mLen &&
    before.join("") === marker &&
    after.join("") === marker
  ) {
    // Remove the markers
    const result = [
      ...chars.slice(0, start - mLen),
      ...chars.slice(start, end),
      ...chars.slice(end + mLen),
    ];
    return result.join("");
  }

  // Wrap with marker
  const result = [
    ...chars.slice(0, start),
    ...markerChars,
    ...chars.slice(start, end),
    ...markerChars,
    ...chars.slice(end),
  ];
  return result.join("");
};

/**
 * Replace the selected span with a Markdown link: `[<span>](<url>)`.
 */
export const linkifySelection = (
  source: string,
  start: number,
  end: number,
  url: string,
): string => {
  const chars = Array.from(source);
  const span = chars.slice(start, end).join("");
  const link = `[${span}](${url})`;
  const linkChars = Array.from(link);
  const result = [...chars.slice(0, start), ...linkChars, ...chars.slice(end)];
  return result.join("");
};
