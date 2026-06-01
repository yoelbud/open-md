import { createSignal, For, Show } from "solid-js";
import type { JSX } from "solid-js";
import { BLOCK_TEMPLATES } from "../../store/document";
import type { BlockTemplate } from "../../store/document";
import { detectSlashTrigger, filterTemplates } from "../../store/slash";

export type SlashMenuState = {
  open: boolean;
  items: BlockTemplate[];
  selectedIndex: number;
  queryStart: number; // char offset of the "/"
  query: string;
  anchorTop: number;
  anchorLeft: number;
};

const INITIAL_STATE: SlashMenuState = {
  open: false,
  items: [],
  selectedIndex: 0,
  queryStart: 0,
  query: "",
  anchorTop: 0,
  anchorLeft: 0,
};

type Props = {
  state: SlashMenuState;
  onSelect: (template: BlockTemplate) => void;
  onDismiss: () => void;
};

export const SlashMenu = (props: Props) => {
  return (
    <Show when={props.state.open && props.state.items.length > 0}>
      <div
        class="slash-menu"
        style={{
          position: "absolute",
          top: `${props.state.anchorTop}px`,
          left: `${props.state.anchorLeft}px`,
          "z-index": "1000",
        } as JSX.CSSProperties}
      >
        <For each={props.state.items}>
          {(t, i) => (
            <button
              class="slash-menu-item"
              classList={{ active: i() === props.state.selectedIndex }}
              onMouseDown={(e) => {
                e.preventDefault(); // don't blur textarea
                props.onSelect(t);
              }}
            >
              <span class="slash-menu-icon">{t.icon}</span>
              <span class="slash-menu-label">{t.label}</span>
            </button>
          )}
        </For>
      </div>
    </Show>
  );
};

/**
 * Compute a rough anchor position for the slash menu relative to the textarea.
 * We approximate using line height and character width from the textarea metrics.
 */
export const computeSlashAnchor = (
  ta: HTMLTextAreaElement,
  queryStart: number,
): { top: number; left: number } => {
  const style = window.getComputedStyle(ta);
  const lineHeight = Number.parseFloat(style.lineHeight) || 20;
  const paddingTop = Number.parseFloat(style.paddingTop) || 0;
  const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;

  // Determine line number of the slash
  const textBefore = ta.value.slice(0, queryStart);
  const line = textBefore.split("\n").length - 1;

  // Column of the slash on the line
  const lastNewline = textBefore.lastIndexOf("\n");
  const col = queryStart - (lastNewline + 1);

  // Approximate char width (monospace assumed)
  const fontSize = Number.parseFloat(style.fontSize) || 14;
  const charWidth = fontSize * 0.6;

  const top = paddingTop + (line + 1) * lineHeight - ta.scrollTop;
  const left = paddingLeft + col * charWidth;

  return { top: Math.max(0, top), left: Math.max(0, left) };
};

/**
 * Hook-like helper that manages slash menu state for a textarea.
 * Returns handlers to integrate into textarea events.
 */
export const createSlashMenuController = () => {
  const [state, setState] = createSignal<SlashMenuState>({ ...INITIAL_STATE });

  const dismiss = () => setState({ ...INITIAL_STATE });

  const update = (ta: HTMLTextAreaElement) => {
    const text = ta.value;
    const caret = ta.selectionStart;
    const trigger = detectSlashTrigger(text, caret);

    if (!trigger) {
      if (state().open) dismiss();
      return;
    }

    const items = filterTemplates(BLOCK_TEMPLATES, trigger.query);
    const anchor = computeSlashAnchor(ta, trigger.queryStart);

    setState({
      open: true,
      items,
      selectedIndex: Math.min(state().selectedIndex, Math.max(0, items.length - 1)),
      queryStart: trigger.queryStart,
      query: trigger.query,
      anchorTop: anchor.top,
      anchorLeft: anchor.left,
    });
  };

  const handleKeyDown = (e: KeyboardEvent, ta: HTMLTextAreaElement): boolean => {
    const s = state();
    if (!s.open || s.items.length === 0) return false;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setState({ ...s, selectedIndex: (s.selectedIndex + 1) % s.items.length });
      return true;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setState({ ...s, selectedIndex: (s.selectedIndex - 1 + s.items.length) % s.items.length });
      return true;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      const selected = s.items[s.selectedIndex];
      if (selected) selectItem(selected, ta);
      return true;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      dismiss();
      return true;
    }
    return false;
  };

  const selectItem = (template: BlockTemplate, ta: HTMLTextAreaElement): string | null => {
    const s = state();
    // Replace "/query" with the template snippet
    const text = ta.value;
    const replaceEnd = ta.selectionStart;
    const replaceStart = s.queryStart;

    // The snippet typically ends with \n\n; for inline replacement we trim the trailing newlines
    const snippet = template.snippet.replace(/\n+$/, "");
    const before = text.slice(0, replaceStart);
    const after = text.slice(replaceEnd);
    const newText = before + snippet + after;

    // Compute caret position
    const caretPos = template.caret != null
      ? replaceStart + template.caret
      : replaceStart + snippet.length;

    dismiss();

    // Return the info needed for the caller to set source and caret
    return newText + "|" + caretPos; // use the return object pattern instead
  };

  // Better API: returns the replacement info
  const getReplacementForItem = (template: BlockTemplate, ta: HTMLTextAreaElement): {
    newText: string;
    caretPos: number;
  } | null => {
    const s = state();
    if (!s.open) return null;

    const text = ta.value;
    const replaceEnd = ta.selectionStart;
    const replaceStart = s.queryStart;

    const snippet = template.snippet.replace(/\n+$/, "");
    const before = text.slice(0, replaceStart);
    const after = text.slice(replaceEnd);
    const newText = before + snippet + after;

    const caretPos = template.caret != null
      ? replaceStart + template.caret
      : replaceStart + snippet.length;

    dismiss();
    return { newText, caretPos };
  };

  return { state, update, handleKeyDown, dismiss, getReplacementForItem };
};
