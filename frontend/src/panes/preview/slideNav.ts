// Pure slide-navigation helpers for the live Presentation overlay.
// Kept side-effect free so they can be unit tested without a DOM.

/** Clamp an arbitrary index into the valid `[0, count - 1]` range. */
export const clampSlideIndex = (index: number, count: number): number => {
  if (count <= 0) return 0;
  if (!Number.isFinite(index)) return 0;
  return Math.min(count - 1, Math.max(0, Math.trunc(index)));
};

/** Next slide index (stops at the last slide). */
export const nextSlide = (index: number, count: number): number =>
  clampSlideIndex(index + 1, count);

/** Previous slide index (stops at the first slide). */
export const prevSlide = (index: number, count: number): number =>
  clampSlideIndex(index - 1, count);

/** First slide index. */
export const firstSlide = (): number => 0;

/** Last slide index. */
export const lastSlide = (count: number): number => clampSlideIndex(count - 1, count);

export type SlideNavIntent = "next" | "prev" | "first" | "last" | "exit" | null;

/**
 * Map a keyboard event key to a navigation intent. Returns `null` for keys the
 * overlay does not handle so callers can ignore them.
 */
export const slideNavIntent = (key: string): SlideNavIntent => {
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
    case "PageDown":
    case " ":
    case "Spacebar":
      return "next";
    case "ArrowLeft":
    case "ArrowUp":
    case "PageUp":
      return "prev";
    case "Home":
      return "first";
    case "End":
      return "last";
    case "Escape":
      return "exit";
    default:
      return null;
  }
};

/** Apply a navigation intent to the current index, returning the new index. */
export const applySlideNav = (
  intent: SlideNavIntent,
  index: number,
  count: number,
): number => {
  switch (intent) {
    case "next":
      return nextSlide(index, count);
    case "prev":
      return prevSlide(index, count);
    case "first":
      return firstSlide();
    case "last":
      return lastSlide(count);
    default:
      return clampSlideIndex(index, count);
  }
};
