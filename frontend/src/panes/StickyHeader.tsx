// Sticky heading breadcrumb bar rendered at the top of each pane body.
// Shows the enclosing heading trail for the topmost-visible block.

import { For, Show } from "solid-js";
import { useStickyTrail } from "../store/stickyScroll";
import { setEditingPoint } from "../store/document";

export const StickyHeader = () => {
  const trail = useStickyTrail;

  return (
    <Show when={trail().length > 0}>
      <div class="om-sticky-header" aria-label="Section breadcrumb">
        <For each={trail()}>
          {(crumb, i) => (
            <>
              <Show when={i() > 0}>
                <span class="om-sticky-sep" aria-hidden="true">›</span>
              </Show>
              <button
                class="om-sticky-crumb"
                data-level={crumb.level}
                title={crumb.text}
                onClick={() =>
                  setEditingPoint({ pane: "ir", sourceOffset: crumb.sourceOffset })
                }
              >
                {crumb.text}
              </button>
            </>
          )}
        </For>
      </div>
    </Show>
  );
};
