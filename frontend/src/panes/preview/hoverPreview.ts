/**
 * Hover preview popovers for block references, citations, and math.
 *
 * Pure resolver helpers are exported for unit-testing.
 * `setupHoverPreviews` installs delegated pointer/focus handlers on the
 * preview container — mirrors the pattern in `./footnotes.ts`.
 */

import type { Block } from "../../ipc/types";
import type { BibEntry } from "../../store/citations";
import { useDocument } from "../../store/document";
import { buildAnchorMap, stripAnchorFromHtml } from "./blockRefs";
import { extractBibliography, formatReference } from "../../store/citations";

// ── Pure resolver helpers ────────────────────────────────────────────────────

/** Extract anchor NAME from href like `#ref-NAME`. */
export const refNameFromHref = (href: string | null): string | null => {
  if (!href) return null;
  const m = href.match(/^#ref-([A-Za-z0-9_-]+)$/);
  return m ? (m[1] ?? null) : null;
};

/** Extract cite KEY from href like `#cite-KEY`. */
export const citeKeyFromHref = (href: string | null): string | null => {
  if (!href) return null;
  const m = href.match(/^#cite-([A-Za-z0-9_-]+)$/);
  return m ? (m[1] ?? null) : null;
};

/**
 * Resolve a block-reference preview: find the anchored block and return its
 * rendered HTML with the anchor marker stripped.
 */
export const resolveRefPreviewHtml = (blocks: Block[], name: string): string | null => {
  const anchorMap = buildAnchorMap(blocks);
  const blockId = anchorMap.get(name);
  if (!blockId) return null;
  const block = blocks.find((b) => b.id === blockId);
  if (!block) return null;
  return stripAnchorFromHtml(block.html);
};

/** Resolve a citation hover to its full reference HTML. */
export const resolveCiteHtml = (bib: Map<string, BibEntry>, key: string): string | null => {
  const entry = bib.get(key);
  if (!entry) return null;
  return formatReference(entry);
};

/** Return trimmed LaTeX source, or null if empty/absent. */
export const mathTexPreview = (tex: string | null): string | null => {
  if (!tex) return null;
  const trimmed = tex.trim();
  return trimmed.length > 0 ? trimmed : null;
};

// ── Delegated hover handler ──────────────────────────────────────────────────

const SELECTOR = ".om-ref-link, .om-cite, [data-om-tex]";

/**
 * Set up hover preview popovers within a preview container.
 * Returns a cleanup function to remove listeners and the popover element.
 */
export const setupHoverPreviews = (container: HTMLElement): (() => void) => {
  let popover: HTMLElement | null = null;

  const getPopover = (): HTMLElement => {
    if (popover && popover.parentElement === container) return popover;
    popover = container.querySelector<HTMLElement>(".om-hover-popover");
    if (!popover) {
      popover = document.createElement("div");
      popover.className = "om-hover-popover";
      popover.setAttribute("role", "tooltip");
      popover.setAttribute("aria-hidden", "true");
      container.appendChild(popover);
    }
    return popover;
  };

  const show = (target: HTMLElement) => {
    let html: string | null = null;
    let isRaw = false; // when true, set via textContent (escaped)

    if (target.matches(".om-ref-link")) {
      const href = target.getAttribute("href");
      const name = refNameFromHref(href);
      if (name) {
        html = resolveRefPreviewHtml(useDocument().blocks, name);
      }
    } else if (target.matches(".om-cite")) {
      const href = target.getAttribute("href");
      const key = citeKeyFromHref(href);
      if (key) {
        const bib = extractBibliography(useDocument().blocks);
        html = resolveCiteHtml(bib, key);
      }
    } else if (target.hasAttribute("data-om-tex")) {
      const tex = mathTexPreview(target.getAttribute("data-om-tex"));
      if (tex) {
        // Use textContent for safety — build the code element manually.
        isRaw = true;
        html = tex;
      }
    }

    if (!html) return;

    const tip = getPopover();
    if (isRaw) {
      tip.textContent = ""; // clear
      const code = document.createElement("code");
      code.className = "om-hover-tex";
      code.textContent = html;
      tip.appendChild(code);
    } else {
      tip.innerHTML = html;
    }
    tip.setAttribute("aria-hidden", "false");
    tip.classList.add("visible");

    // Position near the hovered element.
    const refRect = target.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const top = refRect.bottom - containerRect.top + container.scrollTop + 4;
    const left = Math.max(
      0,
      Math.min(
        refRect.left - containerRect.left,
        container.clientWidth - 340,
      ),
    );
    tip.style.top = `${top}px`;
    tip.style.left = `${left}px`;
  };

  const hide = () => {
    if (popover) {
      popover.classList.remove("visible");
      popover.setAttribute("aria-hidden", "true");
    }
  };

  const onPointerEnter = (e: Event) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>(SELECTOR);
    if (target) show(target);
  };

  const onPointerLeave = (e: Event) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>(SELECTOR);
    if (target) hide();
  };

  const onFocusIn = (e: Event) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>(SELECTOR);
    if (target) show(target);
  };

  const onFocusOut = (e: Event) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>(SELECTOR);
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
    if (popover && popover.parentElement) {
      popover.parentElement.removeChild(popover);
    }
  };
};
