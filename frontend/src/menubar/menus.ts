// Defines the application menu structure wired up to store actions.

import type { MenuDef } from "./MenuBar";
import {
  BLOCK_TEMPLATES,
  canRedo,
  canUndo,
  insertBlockAfter,
  newDocument,
  openFile,
  redo,
  saveFile,
  togglePane,
  undo,
  usePaneVisible,
} from "../store/document";

export const buildMenus = (): MenuDef[] => {
  const vis = usePaneVisible();

  const insertItems = BLOCK_TEMPLATES.map((t) => ({
    kind: "action" as const,
    label: `${t.icon}  ${t.label}`,
    action: () => insertBlockAfter(null, t.snippet),
  }));

  return [
    {
      label: "File",
      items: [
        { kind: "action", label: "New",       shortcut: "Ctrl+N", action: newDocument },
        { kind: "action", label: "Open…",     shortcut: "Ctrl+O", action: () => void openFile() },
        { kind: "sep" },
        { kind: "action", label: "Save",      shortcut: "Ctrl+S", action: () => void saveFile() },
        { kind: "sep" },
        { kind: "action", label: "Exit",      danger: true,       action: () => window.close() },
      ],
    },
    {
      label: "Edit",
      items: [
        {
          kind: "action",
          label: "Undo",
          shortcut: "Ctrl+Z",
          action: () => { if (canUndo()) undo(); },
        },
        {
          kind: "action",
          label: "Redo",
          shortcut: "Ctrl+Y",
          action: () => { if (canRedo()) redo(); },
        },
      ],
    },
    {
      label: "View",
      items: [
        {
          kind: "check",
          label: "Source pane",
          shortcut: "Ctrl+1",
          checked: () => vis().source,
          action: () => togglePane("source"),
        },
        {
          kind: "check",
          label: "IR pane",
          shortcut: "Ctrl+2",
          checked: () => vis().ir,
          action: () => togglePane("ir"),
        },
        {
          kind: "check",
          label: "Preview pane",
          shortcut: "Ctrl+3",
          checked: () => vis().preview,
          action: () => togglePane("preview"),
        },
      ],
    },
    {
      label: "Insert",
      items: insertItems,
    },
  ];
};
