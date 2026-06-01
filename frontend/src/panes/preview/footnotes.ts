/**
 * Footnote hover-preview helper.
 *
 * Given a preview container and a footnote reference id, retrieves the
 * rendered body HTML from the matching `.om-fndef` element.
 */

/**
 * Look up the rendered body HTML for a footnote definition within `container`.
 * Returns `null` when no matching definition is found.
 */
export const getFootnoteBody = (container: HTMLElement, id: string): string | null => {
  // Escape the id for use in an attribute selector (avoid CSS.escape which
  // may not be available in all test environments).
  const escaped = id.replace(/([^\w-])/g, "\\$1");
  const def = container.querySelector<HTMLElement>(`.om-fndef[data-om-fndef="${escaped}"]`);
  if (!def) return null;
  const body = def.querySelector<HTMLElement>(".om-fndef-body");
  // If there's a dedicated body span, use it; otherwise use everything after the label.
  if (body) return body.innerHTML;
  // Fallback: clone the definition and remove the label.
  const clone = def.cloneNode(true) as HTMLElement;
  const label = clone.querySelector(".om-fndef-label");
  label?.remove();
  return clone.innerHTML.trim();
};

/**
 * Set up footnote hover-preview tooltips within a preview container.
 * Returns a cleanup function to remove the event listeners.
 */
export const setupFootnoteTooltip = (container: HTMLElement): (() => void) => {
  let tooltip: HTMLElement | null = null;

  const getTooltip = (): HTMLElement => {
    if (tooltip && tooltip.parentElement === container) return tooltip;
    tooltip = container.querySelector<HTMLElement>(".om-fn-tooltip");
    if (!tooltip) {
      tooltip = document.createElement("div");
      tooltip.className = "om-fn-tooltip";
      tooltip.setAttribute("role", "tooltip");
      tooltip.setAttribute("aria-hidden", "true");
      container.appendChild(tooltip);
    }
    return tooltip;
  };

  const show = (ref: HTMLElement) => {
    const id = ref.dataset.omFnref;
    if (!id) return;
    const body = getFootnoteBody(container, id);
    if (!body) return;

    const tip = getTooltip();
    tip.innerHTML = body;
    tip.setAttribute("aria-hidden", "false");
    tip.classList.add("visible");

    // Position near the reference.
    const refRect = ref.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const top = refRect.bottom - containerRect.top + container.scrollTop + 4;
    const left = Math.max(
      0,
      Math.min(
        refRect.left - containerRect.left,
        container.clientWidth - 280,
      ),
    );
    tip.style.top = `${top}px`;
    tip.style.left = `${left}px`;
  };

  const hide = () => {
    if (tooltip) {
      tooltip.classList.remove("visible");
      tooltip.setAttribute("aria-hidden", "true");
    }
  };

  const onPointerEnter = (e: Event) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-om-fnref]");
    if (target) show(target);
  };

  const onPointerLeave = (e: Event) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-om-fnref]");
    if (target) hide();
  };

  const onFocusIn = (e: Event) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-om-fnref]");
    if (target) show(target);
  };

  const onFocusOut = (e: Event) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-om-fnref]");
    if (target) hide();
  };

  container.addEventListener("pointerenter", onPointerEnter, true);
  container.addEventListener("pointerleave", onPointerLeave, true);
  container.addEventListener("focusin", onFocusIn, true);
  container.addEventListener("focusout", onFocusOut, true);

  return () => {
    container.removeEventListener("pointerenter", onPointerEnter, true);
    container.removeEventListener("pointerleave", onPointerLeave, true);
    container.removeEventListener("focusin", onFocusIn, true);
    container.removeEventListener("focusout", onFocusOut, true);
    if (tooltip && tooltip.parentElement) {
      tooltip.parentElement.removeChild(tooltip);
    }
  };
};
