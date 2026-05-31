import { For, Show, createMemo } from "solid-js";
import { useDocument, setEditingPoint } from "../../store/document";
import { extractHeadings } from "../../store/outline";
import type { HeadingEntry } from "../../store/outline";

/**
 * OutlinePanel displays a table-of-contents derived from heading blocks.
 * Clicking an entry scrolls the Preview pane to that heading and sets the
 * editing point so the Source pane also tracks the location.
 */
export const OutlinePanel = () => {
  const headings = createMemo(() => extractHeadings(useDocument().blocks));

  const handleClick = (entry: HeadingEntry) => {
    // Set editing point so Source pane can scroll to offset.
    setEditingPoint({ pane: "source", sourceOffset: entry.sourceOffset });
    // Scroll the Preview pane to the heading block.
    const el = document.querySelector(`[data-block-id="${entry.id}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <aside class="outline-panel" aria-label="Document outline">
      <div class="outline-panel-header">
        <span class="outline-panel-title">Outline</span>
      </div>
      <Show
        when={headings().length > 0}
        fallback={<p class="outline-panel-empty">No headings in document.</p>}
      >
        <nav class="outline-list" role="list">
          <For each={headings()}>
            {(entry) => (
              <button
                type="button"
                class="outline-entry"
                classList={{ [`outline-level-${entry.level}`]: true }}
                title={`${entry.text} (h${entry.level})`}
                onClick={() => handleClick(entry)}
              >
                {entry.text}
              </button>
            )}
          </For>
        </nav>
      </Show>
    </aside>
  );
};
