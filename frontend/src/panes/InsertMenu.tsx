import { createSignal, For, Show } from "solid-js";
import { BLOCK_TEMPLATES } from "../store/document";
import type { Block } from "../ipc/types";

type Props = {
  // null = insert at end of document (or wherever caller chooses).
  block: Block | null;
  onPick: (snippet: string) => void;
  label?: string;
};

export const InsertMenu = (props: Props) => {
  const [open, setOpen] = createSignal(false);
  let rootRef: HTMLDivElement | undefined;

  const close = () => setOpen(false);
  const onDocClick = (e: MouseEvent) => {
    if (rootRef && !rootRef.contains(e.target as Node)) close();
  };

  const toggle = () => {
    if (open()) {
      close();
      document.removeEventListener("click", onDocClick);
    } else {
      setOpen(true);
      // Defer to avoid catching the same click that opened the menu.
      setTimeout(() => document.addEventListener("click", onDocClick), 0);
    }
  };

  return (
    <div class="insert-menu" ref={rootRef}>
      <button class="insert-btn" onClick={toggle} title="Insert block">
        + {props.label ?? "Insert"}
      </button>
      <Show when={open()}>
        <div class="insert-popover">
          <For each={BLOCK_TEMPLATES}>
            {(t) => (
              <button
                class="insert-item"
                onClick={async () => {
                  close();
                  const snip = t.getSnippet ? await t.getSnippet() : t.snippet;
                  if (snip) props.onPick(snip);
                }}
              >
                <span class="insert-icon">{t.icon}</span>
                <span>{t.label}</span>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};
