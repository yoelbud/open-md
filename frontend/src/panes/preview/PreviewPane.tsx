import { For } from "solid-js";
import { useDocument } from "../../store/document";

export const PreviewPane = () => {
  const doc = useDocument;
  return (
    <div class="pane">
      <div class="pane-header">Preview</div>
      <div class="pane-body preview">
        <For each={doc().blocks}>
          {(b) => (
            // Per-block component so future incremental updates can swap a
            // single block's innerHTML without re-rendering the whole doc.
            <div data-block-id={b.id} innerHTML={b.html} />
          )}
        </For>
      </div>
    </div>
  );
};
