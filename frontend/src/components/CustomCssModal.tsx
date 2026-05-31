import { createSignal, Show } from "solid-js";
import { useCustomCss, setCustomCss } from "../store/theme";

type Props = {
  open: boolean;
  onClose: () => void;
};

export const CustomCssModal = (props: Props) => {
  const currentCss = useCustomCss();
  const [draft, setDraft] = createSignal("");

  const handleOpen = () => {
    setDraft(currentCss());
  };

  const handleSave = () => {
    setCustomCss(draft());
    props.onClose();
  };

  const handleCancel = () => {
    props.onClose();
  };

  return (
    <Show when={props.open}>
      <div class="custom-css-backdrop" onClick={handleCancel} ref={() => handleOpen()}>
        <div class="custom-css-modal" onClick={(e) => e.stopPropagation()}>
          <div class="custom-css-header">
            <span class="custom-css-title">Custom CSS</span>
            <button class="custom-css-close" onClick={handleCancel} title="Close">✕</button>
          </div>
          <textarea
            class="custom-css-editor mono"
            placeholder="/* Your custom CSS here — applied live to the app */
:root {
  --accent: #10b981;
}"
            value={draft()}
            onInput={(e) => setDraft(e.currentTarget.value)}
            spellcheck={false}
          />
          <div class="custom-css-footer">
            <button class="custom-css-btn" onClick={handleCancel}>Cancel</button>
            <button class="custom-css-btn primary" onClick={handleSave}>Apply & Save</button>
          </div>
        </div>
      </div>
    </Show>
  );
};
