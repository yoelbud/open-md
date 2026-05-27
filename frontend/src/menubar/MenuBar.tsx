import { createSignal, For, onCleanup, Show } from "solid-js";

export type MenuItemDef =
  | { kind: "action"; label: string; shortcut?: string; danger?: boolean; action: () => void }
  | { kind: "sep" }
  | { kind: "check";  label: string; shortcut?: string; checked: () => boolean; action: () => void }
  | { kind: "sub";    label: string; children: MenuItemDef[] };

export type MenuDef = { label: string; items: MenuItemDef[] };

// ── single menu item ─────────────────────────────────────────────────────────

const MenuItem = (props: { item: MenuItemDef; onClose: () => void }) => {
  if (props.item.kind === "sep") return <div class="menu-sep" />;

  if (props.item.kind === "sub") {
    const [open, setOpen] = createSignal(false);
    return (
      <div
        class="menu-item has-sub"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <span class="menu-check" />
        <span>{props.item.label}</span>
        <span class="menu-arrow">›</span>
        <Show when={open()}>
          <div class="menu-sub-popover">
            <For each={props.item.children}>
              {(child) => <MenuItem item={child} onClose={props.onClose} />}
            </For>
          </div>
        </Show>
      </div>
    );
  }

  if (props.item.kind === "check") {
    const item = props.item;
    return (
      <button
        class="menu-item"
        onClick={() => { item.action(); props.onClose(); }}
      >
        <span class="menu-check">{item.checked() ? "✓" : ""}</span>
        <span>{item.label}</span>
        {item.shortcut && (
          <span class="menu-shortcut">{item.shortcut}</span>
        )}
      </button>
    );
  }

  // kind === "action"
  const item = props.item as { kind: "action"; label: string; shortcut?: string; danger?: boolean; action: () => void };
  return (
    <button
      class="menu-item"
      classList={{ danger: !!item.danger }}
      onClick={() => { item.action(); props.onClose(); }}
    >
      <span class="menu-check" />
      <span>{item.label}</span>
      {item.shortcut && (
        <span class="menu-shortcut">{item.shortcut}</span>
      )}
    </button>
  );
};

const MenuDropdown = (props: {
  menu: MenuDef;
  open: boolean;
  onClose: () => void;
}) => (
  <Show when={props.open}>
    <div class="menu-dropdown">
      <For each={props.menu.items}>
        {(item) => <MenuItem item={item} onClose={props.onClose} />}
      </For>
    </div>
  </Show>
);

// ── menubar root ──────────────────────────────────────────────────────────────

type Props = { menus: MenuDef[] };

export const MenuBar = (props: Props) => {
  const [openIdx, setOpenIdx] = createSignal<number | null>(null);
  let barRef: HTMLDivElement | undefined;

  const close = () => setOpenIdx(null);

  const onDocClick = (e: MouseEvent) => {
    if (barRef && !barRef.contains(e.target as Node)) close();
  };

  const toggle = (i: number) => {
    if (openIdx() === i) {
      close();
      document.removeEventListener("click", onDocClick);
    } else {
      setOpenIdx(i);
      setTimeout(() => document.addEventListener("click", onDocClick), 0);
    }
  };

  onCleanup(() => document.removeEventListener("click", onDocClick));

  return (
    <div class="menubar" ref={barRef}>
      <For each={props.menus}>
        {(menu, i) => (
          <div class="menubar-item" classList={{ open: openIdx() === i() }}>
            <button
              class="menubar-btn"
              onClick={() => toggle(i())}
              onMouseEnter={() => { if (openIdx() !== null) setOpenIdx(i()); }}
            >
              {menu.label}
            </button>
            <MenuDropdown menu={menu} open={openIdx() === i()} onClose={close} />
          </div>
        )}
      </For>
    </div>
  );
};
