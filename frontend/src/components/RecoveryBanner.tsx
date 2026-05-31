import { Show } from "solid-js";
import type { Draft } from "../store/autosave";

type Props = {
  draft: Draft | null;
  onRestore: () => void;
  onDismiss: () => void;
};

export const RecoveryBanner = (props: Props) => (
  <Show when={props.draft}>
    {(draft) => (
      <div class="recovery-banner" role="alert">
        <span>
          Unsaved draft recovered (saved{" "}
          {new Date(draft().savedAt).toLocaleTimeString()}).
        </span>
        <button type="button" onClick={props.onRestore}>
          Restore
        </button>
        <button type="button" onClick={props.onDismiss}>
          Dismiss
        </button>
      </div>
    )}
  </Show>
);
