/**
 * Reusable right-click context menu — controller + component.
 * Renders a fixed-position popup clamped to viewport.
 * Dismisses on outside click, Escape, window blur, or scroll.
 */

import { createSignal, For, onCleanup, onMount, Show } from "solid-js";

// ── Controller (module-level signal, following MarkToolbar pattern) ──────────

export interface CtxItem {
  label: string;
  action?: () => void;
  danger?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
  submenu?: CtxItem[];
}

export interface CtxMenuState {
  x: number;
  y: number;
  items: CtxItem[];
}

const [menuState, setMenuState] = createSignal<CtxMenuState | null>(null);

export const requestContextMenu = (state: CtxMenuState) => setMenuState(state);
export const dismissContextMenu = () => setMenuState(null);
export const useContextMenu = () => menuState;

// ── Component ───────────────────────────────────────────────────────────────

const SubMenu = (props: { items: CtxItem[] }) => (
  <div class="om-context-submenu" role="menu">
    <For each={props.items}>
      {(item) => <MenuItem item={item} />}
    </For>
  </div>
);

const MenuItem = (props: { item: CtxItem }) => {
  const item = props.item;
  const handleClick = () => {
    if (item.disabled) return;
    item.action?.();
    dismissContextMenu();
  };

  return (
    <>
      {item.separatorBefore && <div class="om-context-sep" role="separator" />}
      <button
        type="button"
        class="om-context-item"
        classList={{ danger: item.danger ?? false }}
        disabled={item.disabled}
        role="menuitem"
        onClick={handleClick}
      >
        <span class="om-context-item-label">{item.label}</span>
        {item.submenu && <span class="om-context-item-caret">›</span>}
        {item.submenu && <SubMenu items={item.submenu} />}
      </button>
    </>
  );
};

export const ContextMenu = () => {
  const menu = useContextMenu();
  let rootRef: HTMLDivElement | undefined;

  const clampX = () => {
    const m = menu();
    if (!m) return 0;
    return Math.min(m.x, window.innerWidth - 220);
  };

  const clampY = () => {
    const m = menu();
    if (!m) return 0;
    return Math.min(m.y, window.innerHeight - 300);
  };

  onMount(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!menu()) return;
      if (rootRef && rootRef.contains(e.target as Node)) return;
      dismissContextMenu();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismissContextMenu();
    };
    const onBlur = () => dismissContextMenu();
    const onScroll = () => dismissContextMenu();

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("blur", onBlur);
    window.addEventListener("scroll", onScroll, true);

    onCleanup(() => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("scroll", onScroll, true);
    });
  });

  return (
    <Show when={menu()}>
      <div
        ref={rootRef}
        class="om-context-menu"
        role="menu"
        style={{ left: `${clampX()}px`, top: `${clampY()}px` }}
      >
        <For each={menu()!.items}>
          {(item) => <MenuItem item={item} />}
        </For>
      </div>
    </Show>
  );
};
