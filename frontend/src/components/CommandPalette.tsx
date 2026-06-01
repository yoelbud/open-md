import { createSignal, For, onMount, Show } from "solid-js";
import type { Command } from "../store/commands";
import { filterCommands } from "../store/commands";

type Props = {
  commands: Command[];
  open: boolean;
  onClose: () => void;
};

export const CommandPalette = (props: Props) => {
  const [query, setQuery] = createSignal("");
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  let inputRef: HTMLInputElement | undefined;
  let listRef: HTMLDivElement | undefined;

  const filtered = () => filterCommands(props.commands, query());

  const runCommand = (cmd: Command) => {
    props.onClose();
    cmd.action();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    const items = filtered();
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, items.length - 1));
        scrollToSelected();
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        scrollToSelected();
        break;
      case "Enter":
        e.preventDefault();
        if (items[selectedIndex()]) runCommand(items[selectedIndex()]!);
        break;
      case "Escape":
        e.preventDefault();
        props.onClose();
        break;
    }
  };

  const scrollToSelected = () => {
    requestAnimationFrame(() => {
      const active = listRef?.querySelector("[data-active='true']") as HTMLElement | null;
      active?.scrollIntoView({ block: "nearest" });
    });
  };

  onMount(() => {
    inputRef?.focus();
  });

  // Reset state when opened
  const reset = () => {
    setQuery("");
    setSelectedIndex(0);
    requestAnimationFrame(() => inputRef?.focus());
  };

  // Watch for open changes - use an effect-like approach
  let wasOpen = props.open;
  const checkOpen = () => {
    if (props.open && !wasOpen) reset();
    wasOpen = props.open;
  };

  return (
    <Show when={props.open}>
      {(() => { checkOpen(); return null; })()}
      <div class="command-palette-backdrop" onClick={() => props.onClose()}>
        <div class="command-palette" onClick={(e) => e.stopPropagation()}>
          <input
            ref={inputRef}
            class="command-palette-input"
            type="text"
            placeholder="Type a command…"
            value={query()}
            onInput={(e) => {
              setQuery(e.currentTarget.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
          />
          <div class="command-palette-list" ref={listRef}>
            <For each={filtered()}>
              {(cmd, i) => (
                <button
                  class="command-palette-item"
                  classList={{ active: i() === selectedIndex() }}
                  data-active={i() === selectedIndex()}
                  onClick={() => runCommand(cmd)}
                  onMouseEnter={() => setSelectedIndex(i())}
                >
                  <span class="command-palette-label">{cmd.label}</span>
                  <Show when={cmd.shortcut}>
                    <span class="command-palette-shortcut">{cmd.shortcut}</span>
                  </Show>
                </button>
              )}
            </For>
            <Show when={filtered().length === 0}>
              <div class="command-palette-empty">No matching commands</div>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  );
};
