import { For } from "solid-js";
import { useDocument } from "../../store/document";

export const IrPane = () => {
  const doc = useDocument;
  return (
    <div class="pane">
      <div class="pane-header">Intermediate representation</div>
      <div class="pane-body">
        <For each={doc().blocks}>
          {(b) => (
            <div class="ir-block">
              <div class="ir-block-head">
                <span class="ir-block-kind">{b.kind}</span>
                <span>#{b.id}</span>
                <span>
                  [{b.src_range[0]}..{b.src_range[1]})
                </span>
                <span>hash={b.hash.toString(16)}</span>
              </div>
              <div class="ir-block-body">{b.source}</div>
            </div>
          )}
        </For>
      </div>
    </div>
  );
};
