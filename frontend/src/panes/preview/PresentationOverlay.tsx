// Live, in-app Presentation mode: a fullscreen slide deck rendered from the
// current document. Reuses the same per-block HTML the Preview pane shows and
// the pure `splitIntoSlides` builder used by the standalone slides export, so
// what you present matches what you see — no whole-document reparse.

import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import {
  closePresentation,
  useDocument,
  usePresentationActive,
} from "../../store/document";
import { splitIntoSlides } from "../../export/slidesExport";
import type { Slide } from "../../export/slidesExport";
import type { Block } from "../../ipc/types";
import {
  applySlideNav,
  clampSlideIndex,
  nextSlide,
  prevSlide,
  slideNavIntent,
} from "./slideNav";

/** Capture the live per-block rendered HTML from the Preview DOM. */
const captureBlockHtmlMap = (blocks: Block[]): Map<string, string> => {
  const map = new Map<string, string>();
  if (typeof document === "undefined") return map;
  for (const block of blocks) {
    const el = document.querySelector(`[data-block-id="${block.id}"]`);
    map.set(block.id, el ? el.innerHTML : block.html);
  }
  return map;
};

export const PresentationOverlay = () => {
  const active = usePresentationActive();
  const doc = useDocument;

  const [index, setIndex] = createSignal(0);

  // Recompute the deck whenever the overlay opens or the document changes while
  // open. When closed this stays empty so we do no work in the background.
  const slides = createMemo<Slide[]>(() => {
    if (!active()) return [];
    const blocks = doc().blocks ?? [];
    if (blocks.length === 0) return [];
    return splitIntoSlides(blocks, captureBlockHtmlMap(blocks));
  });

  const count = () => slides().length;

  // Reset to the first slide each time the deck (re)opens, and keep the index in
  // range if the document shrinks while presenting.
  createEffect(() => {
    if (active()) setIndex((i) => clampSlideIndex(i, count()));
    else setIndex(0);
  });

  const current = () => slides()[clampSlideIndex(index(), count())];

  const go = (next: number) => setIndex(clampSlideIndex(next, count()));

  let stageRef: HTMLDivElement | undefined;

  createEffect(() => {
    if (!active()) return;
    // Move focus into the overlay so it owns keyboard input while presenting.
    stageRef?.focus();
    const onKey = (e: KeyboardEvent) => {
      const intent = slideNavIntent(e.key);
      if (!intent) return;
      // Capture-phase + stopImmediatePropagation keeps these keys from also
      // reaching the editor underneath (e.g. moving a hidden CodeMirror caret).
      e.preventDefault();
      e.stopImmediatePropagation();
      if (intent === "exit") {
        closePresentation();
        return;
      }
      setIndex((i) => applySlideNav(intent, i, count()));
    };
    window.addEventListener("keydown", onKey, true);
    onCleanup(() => window.removeEventListener("keydown", onKey, true));
  });

  return (
    <Show when={active()}>
      <div
        class="presentation-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="Presentation"
        tabindex={-1}
        ref={stageRef}
      >
        <Show
          when={count() > 0}
          fallback={
            <div class="presentation-empty">
              <p>Nothing to present yet.</p>
              <p class="presentation-empty-hint">
                Add some content — slides split on <code>H1</code>/<code>H2</code>{" "}
                headings and <code>---</code> dividers.
              </p>
              <button type="button" class="presentation-exit-btn" onClick={closePresentation}>
                Close (Esc)
              </button>
            </div>
          }
        >
          <div class="presentation-stage">
            <button
              type="button"
              class="presentation-zone presentation-zone-prev"
              aria-label="Previous slide"
              disabled={index() <= 0}
              onClick={() => go(prevSlide(index(), count()))}
            />
            <article class="presentation-slide preview">
              <For each={current()?.htmlFragments ?? []}>
                {(fragment) => <div innerHTML={fragment} />}
              </For>
            </article>
            <button
              type="button"
              class="presentation-zone presentation-zone-next"
              aria-label="Next slide"
              disabled={index() >= count() - 1}
              onClick={() => go(nextSlide(index(), count()))}
            />
          </div>

          <div class="presentation-progress" aria-hidden="true">
            <div
              class="presentation-progress-fill"
              style={{ width: `${((index() + 1) / count()) * 100}%` }}
            />
          </div>

          <div class="presentation-controls">
            <button
              type="button"
              class="presentation-ctl"
              aria-label="Previous slide"
              disabled={index() <= 0}
              onClick={() => go(prevSlide(index(), count()))}
            >
              ‹
            </button>
            <span class="presentation-counter">
              {index() + 1} / {count()}
            </span>
            <button
              type="button"
              class="presentation-ctl"
              aria-label="Next slide"
              disabled={index() >= count() - 1}
              onClick={() => go(nextSlide(index(), count()))}
            >
              ›
            </button>
            <button
              type="button"
              class="presentation-exit-btn"
              onClick={closePresentation}
            >
              Exit (Esc)
            </button>
          </div>
        </Show>
      </div>
    </Show>
  );
};
