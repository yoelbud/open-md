import { onMount, onCleanup, Show } from "solid-js";
import { SourcePane } from "./panes/source/SourcePane";
import { IrPane } from "./panes/ir/IrPane";
import { PreviewPane } from "./panes/preview/PreviewPane";
import { MenuBar } from "./menubar/MenuBar";
import { buildMenus } from "./menubar/menus";
import {
  togglePane,
  usePaneVisible,
  usePath,
} from "./store/document";
import { registerShortcuts } from "./ipc/shortcuts";

export const App = () => {
  const path = usePath();
  const visible = usePaneVisible();
  const menus = buildMenus();

  const columns = () => {
    const v = visible();
    const cols = [v.source, v.ir, v.preview].filter(Boolean).length;
    return `repeat(${cols}, minmax(0, 1fr))`;
  };

  onMount(() => {
    const cleanup = registerShortcuts();
    onCleanup(cleanup);
  });

  return (
    <div class="app">
      <div class="titlebar">
        <MenuBar menus={menus} />
        <span class="titlebar-path">{path()}</span>
        <span class="titlebar-spacer" />
        <div class="pane-toggles">
          <button
            classList={{ active: visible().source }}
            onClick={() => togglePane("source")}
            title="Toggle Source pane (Ctrl+1)"
          >
            Source
          </button>
          <button
            classList={{ active: visible().ir }}
            onClick={() => togglePane("ir")}
            title="Toggle IR pane (Ctrl+2)"
          >
            IR
          </button>
          <button
            classList={{ active: visible().preview }}
            onClick={() => togglePane("preview")}
            title="Toggle Preview pane (Ctrl+3)"
          >
            Preview
          </button>
        </div>
      </div>
      <div class="panes" style={{ "grid-template-columns": columns() }}>
        <Show when={visible().source}>
          <SourcePane />
        </Show>
        <Show when={visible().ir}>
          <IrPane />
        </Show>
        <Show when={visible().preview}>
          <PreviewPane />
        </Show>
      </div>
    </div>
  );
};
