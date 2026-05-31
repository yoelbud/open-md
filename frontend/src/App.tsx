import { createSignal, createEffect, For, onCleanup, onMount, Show } from "solid-js";
import type { JSX } from "solid-js";
import { SourcePane } from "./panes/source/SourcePane";
import { IrPane } from "./panes/ir/IrPane";
import { PreviewPane } from "./panes/preview/PreviewPane";
import { PrintPreview } from "./panes/preview/PrintPreview";
import { MarkToolbar } from "./panes/MarkToolbar";
import { ProjectSidebar } from "./panes/project/ProjectSidebar";
import { OutlinePanel } from "./panes/outline/OutlinePanel";
import { StatusBar } from "./components/StatusBar";
import { CommandPalette } from "./components/CommandPalette";
import { RecoveryBanner } from "./components/RecoveryBanner";
import { CustomCssModal } from "./components/CustomCssModal";
import { MenuBar } from "./menubar/MenuBar";
import { buildMenus } from "./menubar/menus";
import {
  applyLayoutPreset,
  LAYOUT_PRESETS,
  movePane,
  movePaneRelative,
  PANE_IDS,
  resetPaneSizes,
  resizePanePair,
  togglePane,
  useActiveLayout,
  useOutlineVisible,
  usePaneSizes,
  usePaneVisible,
  useSource,
  useStatusBarVisible,
  useVisiblePanes,
  usePath,
  useSetSource,
} from "./store/document";
import type { PaneDropPosition, PaneId, PaneMoveDirection } from "./store/document";
import { registerShortcuts } from "./ipc/shortcuts";
import { flattenMenus } from "./store/commands";
import type { Command } from "./store/commands";
import {
  debounce,
  loadDraft,
  saveDraft,
  clearDraft,
  shouldOfferRecovery,
} from "./store/autosave";
import type { Draft } from "./store/autosave";

const PANE_DRAG_TYPE = "application/x-open-md-pane";
const PANE_LABELS: Record<PaneId, string> = {
  source: "Source",
  ir: "IR",
  preview: "Preview",
};

const isPaneId = (value: string): value is PaneId =>
  PANE_IDS.some((id) => id === value);

export const App = () => {
  const path = usePath();
  const source = useSource();
  const setSource = useSetSource();
  const visible = usePaneVisible();
  const visiblePanes = useVisiblePanes();
  const sizes = usePaneSizes();
  const activeLayout = useActiveLayout();
  const outlineVisible = useOutlineVisible();
  const statusBarVisible = useStatusBarVisible();
  const menus = buildMenus({ onOpenCustomCss: () => setCustomCssOpen(true) });
  const [paletteOpen, setPaletteOpen] = createSignal(false);
  const [customCssOpen, setCustomCssOpen] = createSignal(false);
  const [recoveryDraft, setRecoveryDraft] = createSignal<Draft | null>(null);
  const [draggingPane, setDraggingPane] = createSignal<PaneId | null>(null);
  const [dropTarget, setDropTarget] = createSignal<{
    id: PaneId;
    position: PaneDropPosition;
  } | null>(null);
  let panesRef: HTMLDivElement | undefined;

  // Command palette: derive commands from menu tree
  const commands = (): Command[] => {
    const extra: Command[] = [
      { id: "palette-cmd", label: "Command Palette", shortcut: "Ctrl+Shift+P", action: () => setPaletteOpen(true) },
    ];
    return [...flattenMenus(menus), ...extra];
  };

  // Auto-save: debounce writes to localStorage
  const autosave = debounce((src: string, p: string) => saveDraft(src, p), 1500);
  createEffect(() => {
    const src = source();
    const p = path();
    autosave.run(src, p);
  });

  // Recovery check at startup
  onMount(() => {
    const draft = loadDraft();
    if (shouldOfferRecovery(draft, source())) {
      setRecoveryDraft(draft);
    }
  });

  const handleRestore = () => {
    const draft = recoveryDraft();
    if (draft) {
      setSource(draft.source);
    }
    setRecoveryDraft(null);
    clearDraft();
  };

  const handleDismissRecovery = () => {
    setRecoveryDraft(null);
    clearDraft();
  };

  const columns = () => {
    const panes = visiblePanes();
    const currentSizes = sizes();
    return panes
      .flatMap((id, index) => {
        const column = `minmax(220px, ${currentSizes[id]}fr)`;
        return index < panes.length - 1 ? [column, "10px"] : [column];
      })
      .join(" ");
  };

  const canMovePane = (id: PaneId, direction: PaneMoveDirection) => {
    const panes = visiblePanes();
    const index = panes.indexOf(id);
    if (index < 0) return false;
    return direction < 0 ? index > 0 : index < panes.length - 1;
  };

  const startResize = (e: PointerEvent, leftId: PaneId, rightId: PaneId) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    const rect = panesRef?.getBoundingClientRect();
    const width = Math.max(rect?.width ?? window.innerWidth, 1);
    const totalSize = visiblePanes().reduce((sum, id) => sum + sizes()[id], 0);
    let lastX = e.clientX;
    document.body.classList.add("resizing-panes");

    const onPointerMove = (moveEvent: PointerEvent) => {
      const deltaPixels = moveEvent.clientX - lastX;
      lastX = moveEvent.clientX;
      resizePanePair(leftId, rightId, (deltaPixels / width) * totalSize);
    };

    const stopResize = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
      document.body.classList.remove("resizing-panes");
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
  };

  const startPaneDrag = (e: DragEvent, id: PaneId) => {
    setDraggingPane(id);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData(PANE_DRAG_TYPE, id);
    }
  };

  const clearPaneDrag = () => {
    setDraggingPane(null);
    setDropTarget(null);
  };

  const paneDropPosition = (e: DragEvent): PaneDropPosition => {
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    return e.clientX < rect.left + rect.width / 2 ? "before" : "after";
  };

  const handlePaneDragOver = (e: DragEvent, id: PaneId) => {
    const dragging = draggingPane();
    if (!dragging || dragging === id) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = "move";
    setDropTarget({ id, position: paneDropPosition(e) });
  };

  const handlePaneDrop = (e: DragEvent, id: PaneId) => {
    const fromData = e.dataTransfer?.getData(PANE_DRAG_TYPE) ?? "";
    const dragging = isPaneId(fromData) ? fromData : draggingPane();
    if (!dragging || dragging === id) {
      clearPaneDrag();
      return;
    }
    e.preventDefault();
    const target = dropTarget();
    movePaneRelative(
      dragging,
      id,
      target?.id === id ? target.position : paneDropPosition(e),
    );
    clearPaneDrag();
  };

  const isDropTarget = (id: PaneId, position: PaneDropPosition) => {
    const target = dropTarget();
    return target?.id === id && target.position === position;
  };

  const PaneControls = (props: { id: PaneId }) => (
    <span class="layout-pane-controls">
      <button
        type="button"
        class="pane-icon-btn pane-drag-grip"
        draggable={true}
        title={`Drag ${PANE_LABELS[props.id]} pane to move it`}
        aria-label={`Drag ${PANE_LABELS[props.id]} pane to move it`}
        onDragStart={(e) => startPaneDrag(e, props.id)}
        onDragEnd={clearPaneDrag}
      >
        ⋮⋮
      </button>
      <button
        type="button"
        class="pane-icon-btn"
        disabled={!canMovePane(props.id, -1)}
        title="Move pane left"
        aria-label={`Move ${PANE_LABELS[props.id]} pane left`}
        onClick={() => movePane(props.id, -1)}
      >
        ←
      </button>
      <button
        type="button"
        class="pane-icon-btn"
        disabled={!canMovePane(props.id, 1)}
        title="Move pane right"
        aria-label={`Move ${PANE_LABELS[props.id]} pane right`}
        onClick={() => movePane(props.id, 1)}
      >
        →
      </button>
    </span>
  );

  const renderPane = (id: PaneId): JSX.Element => {
    const layoutControls = <PaneControls id={id} />;
    switch (id) {
      case "source":
        return <SourcePane layoutControls={layoutControls} />;
      case "ir":
        return <IrPane layoutControls={layoutControls} />;
      case "preview":
        return <PreviewPane layoutControls={layoutControls} />;
    }
  };

  onMount(() => {
    const cleanup = registerShortcuts();
    onCleanup(cleanup);

    // Command palette shortcut (Ctrl+Shift+P)
    const paletteHandler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", paletteHandler);
    onCleanup(() => window.removeEventListener("keydown", paletteHandler));

    // Cleanup autosave debounce on unmount
    onCleanup(() => autosave.cancel());
  });

  return (
    <>
    <div class="app" classList={{ "has-status-bar": statusBarVisible() }}>
      <Show when={recoveryDraft()}>
        <RecoveryBanner
          draft={recoveryDraft()}
          onRestore={handleRestore}
          onDismiss={handleDismissRecovery}
        />
      </Show>
      <div class="titlebar">
        <MenuBar menus={menus} />
        <span class="titlebar-path">{path()}</span>
        <span class="titlebar-spacer" />
        <div class="titlebar-controls">
          <div class="layout-presets" role="group" aria-label="Layout presets">
            <For each={LAYOUT_PRESETS}>
              {(preset) => (
                <button
                  type="button"
                  classList={{ active: activeLayout() === preset.id }}
                  onClick={() => applyLayoutPreset(preset.id)}
                  title={preset.description}
                >
                  {preset.label}
                </button>
              )}
            </For>
            <Show when={activeLayout() === "custom"}>
              <span class="layout-custom" title="Current pane order or sizing differs from a preset">
                Custom
              </span>
            </Show>
          </div>
          <div class="pane-toggles" role="group" aria-label="Pane visibility">
            <button
              type="button"
              classList={{ active: visible().source }}
              onClick={() => togglePane("source")}
              title="Toggle Source pane (Ctrl+1)"
            >
              Source
            </button>
            <button
              type="button"
              classList={{ active: visible().ir }}
              onClick={() => togglePane("ir")}
              title="Toggle IR pane (Ctrl+2)"
            >
              IR
            </button>
            <button
              type="button"
              classList={{ active: visible().preview }}
              onClick={() => togglePane("preview")}
              title="Toggle Preview pane (Ctrl+3)"
            >
              Preview
            </button>
          </div>
        </div>
      </div>
      <div class="workspace">
        <ProjectSidebar />
        <Show when={outlineVisible()}>
          <OutlinePanel />
        </Show>
        <div
          ref={panesRef}
          class="panes"
          style={{ "grid-template-columns": columns() }}
        >
          <For each={visiblePanes()}>
            {(id, index) => {
              const nextPane = () => visiblePanes()[index() + 1];
              return (
                <>
                  <div
                    class="pane-frame"
                    data-pane-id={id}
                    classList={{
                      dragging: draggingPane() === id,
                      "drop-before": isDropTarget(id, "before"),
                      "drop-after": isDropTarget(id, "after"),
                    }}
                    onDragOver={(e) => handlePaneDragOver(e, id)}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                        setDropTarget(null);
                      }
                    }}
                    onDrop={(e) => handlePaneDrop(e, id)}
                  >
                    {renderPane(id)}
                  </div>
                  <Show when={nextPane()}>
                    {(rightId) => (
                      <div
                        class="pane-resizer"
                        role="separator"
                        aria-orientation="vertical"
                        title="Drag to resize panes · double-click to reset sizes"
                        onPointerDown={(e) => startResize(e, id, rightId())}
                        onDblClick={resetPaneSizes}
                      >
                        <span />
                      </div>
                    )}
                  </Show>
                </>
              );
            }}
          </For>
        </div>
      </div>
      <Show when={statusBarVisible()}>
        <StatusBar />
      </Show>
    </div>
    <PrintPreview />
    <MarkToolbar />
    <CommandPalette commands={commands()} open={paletteOpen()} onClose={() => setPaletteOpen(false)} />
    <CustomCssModal open={customCssOpen()} onClose={() => setCustomCssOpen(false)} />
    </>
  );
};
