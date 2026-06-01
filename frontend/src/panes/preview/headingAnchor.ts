/**
 * Heading permalink affordance.
 *
 * On hover of a heading in the preview pane, shows a small "#" button
 * that copies a Markdown link to that section to the clipboard.
 */

import { slugify } from "../../store/outline";

/** Build a Markdown link to a heading section. */
export const headingPermalink = (text: string): string =>
  `[${text}](#${slugify(text)})`;

/** Extract trimmed text content from a heading element. */
export const headingTextFromEl = (el: HTMLElement): string =>
  el.textContent?.trim() ?? "";

/**
 * Set up delegated heading-anchor affordance within a preview container.
 * Returns a cleanup function that removes listeners and the button element.
 */
export const setupHeadingAnchors = (container: HTMLElement): (() => void) => {
  const btn = document.createElement("button");
  btn.className = "om-head-anchor";
  btn.type = "button";
  btn.textContent = "#";
  btn.style.display = "none";
  container.appendChild(btn);

  let currentHeading: HTMLElement | null = null;
  let resetTimer: ReturnType<typeof setTimeout> | null = null;

  const show = (heading: HTMLElement) => {
    currentHeading = heading;
    const text = headingTextFromEl(heading);
    btn.dataset.text = text;
    btn.textContent = "#";

    // Position at leading edge of heading, absolute within container.
    const headingRect = heading.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const top = headingRect.top - containerRect.top + container.scrollTop;
    btn.style.top = `${top}px`;
    btn.style.left = `${Math.max(0, headingRect.left - containerRect.left - 24)}px`;
    btn.style.display = "";
    btn.classList.add("visible");
  };

  const hide = () => {
    currentHeading = null;
    btn.classList.remove("visible");
    btn.style.display = "none";
  };

  const onPointerEnter = (e: Event) => {
    const target = e.target as HTMLElement;
    // Ignore events on the button itself.
    if (btn.contains(target)) return;
    const heading = target.closest?.("h1,h2,h3,h4,h5,h6") as HTMLElement | null;
    if (heading && container.contains(heading)) {
      show(heading);
    }
  };

  const onPointerLeave = (e: Event) => {
    const target = e.target as HTMLElement;
    if (btn.contains(target)) return;
    const heading = target.closest?.("h1,h2,h3,h4,h5,h6") as HTMLElement | null;
    if (heading) {
      // Check if pointer moved to the button (relatedTarget).
      const related = (e as PointerEvent).relatedTarget as HTMLElement | null;
      if (related && btn.contains(related)) return;
      hide();
    }
  };

  const onBtnLeave = (e: PointerEvent) => {
    const related = e.relatedTarget as HTMLElement | null;
    if (related && currentHeading?.contains(related)) return;
    hide();
  };

  const onBtnClick = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const text = btn.dataset.text ?? "";
    const link = headingPermalink(text);
    if (typeof navigator?.clipboard?.writeText === "function") {
      navigator.clipboard.writeText(link).catch(() => {});
    }
    btn.textContent = "✓";
    if (resetTimer) clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      btn.textContent = "#";
    }, 1000);
  };

  container.addEventListener("pointerenter", onPointerEnter, true);
  container.addEventListener("pointerleave", onPointerLeave, true);
  btn.addEventListener("pointerleave", onBtnLeave);
  btn.addEventListener("click", onBtnClick);

  return () => {
    container.removeEventListener("pointerenter", onPointerEnter, true);
    container.removeEventListener("pointerleave", onPointerLeave, true);
    btn.removeEventListener("pointerleave", onBtnLeave);
    btn.removeEventListener("click", onBtnClick);
    if (resetTimer) clearTimeout(resetTimer);
    if (btn.parentElement) btn.parentElement.removeChild(btn);
  };
};
