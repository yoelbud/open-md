// Defines the application menu structure wired up to store actions.

import type { MenuDef } from "./MenuBar";
import {
  applyLayoutPreset,
  BLOCK_TEMPLATES,
  canRedo,
  canUndo,
  createMarkdownFile,
  exportMarkdown,
  insertBlockAfter,
  LAYOUT_PRESETS,
  newDocument,
  openFile,
  openFind,
  openFindReplace,
  openProject,
  openProjectDocument,
  redo,
  resetLayout,
  saveFile,
  saveProject,
  toggleDistractionFree,
  toggleFocusMode,
  toggleOutline,
  togglePane,
  toggleScrollSync,
  toggleStatusBar,
  toggleTypewriterMode,
  undo,
  useActiveLayout,
  useDistractionFree,
  useFocusMode,
  useOutlineVisible,
  usePaneVisible,
  useScrollSync,
  useStatusBarVisible,
  useTypewriterMode,
} from "../store/document";
import { exportPreviewPdf } from "../ipc/previewPdf";

export const buildMenus = (): MenuDef[] => {
  const vis = usePaneVisible();
  const activeLayout = useActiveLayout();
  const outlineVis = useOutlineVisible();
  const statusBarVis = useStatusBarVisible();
  const typewriter = useTypewriterMode();
  const focus = useFocusMode();
  const df = useDistractionFree();
  const scrollSyncOn = useScrollSync();

  const insertItems = BLOCK_TEMPLATES.map((t) => ({
    kind: "action" as const,
    label: `${t.icon}  ${t.label}`,
    action: () => insertBlockAfter(null, t.snippet),
  }));

  return [
    {
      label: "File",
      items: [
        { kind: "action", label: "New Untitled",       shortcut: "Ctrl+N", action: newDocument },
        { kind: "action", label: "New Markdown File…", shortcut: "Ctrl+Shift+N", action: () => void createMarkdownFile() },
        { kind: "action", label: "Open File…",         shortcut: "Ctrl+O", action: () => void openFile() },
        { kind: "action", label: "Open Project… (.ommd)", action: () => void openProjectDocument() },
        { kind: "action", label: "Open Folder…",       action: () => void openProject() },
        { kind: "sep" },
        { kind: "action", label: "Save Project (.ommd)", shortcut: "Ctrl+S", action: () => void saveProject() },
        { kind: "action", label: "Save Markdown…",       action: () => void saveFile() },
        { kind: "sep" },
        { kind: "action", label: "Export → Markdown…",      action: () => void exportMarkdown() },
        { kind: "action", label: "Export → PDF…", shortcut: "Ctrl+P", action: exportPreviewPdf },
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
        { kind: "sep" },
        {
          kind: "action",
          label: "Find…",
          shortcut: "Ctrl+F",
          action: openFind,
        },
        {
          kind: "action",
          label: "Find & Replace…",
          shortcut: "Ctrl+H",
          action: openFindReplace,
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
        { kind: "sep" },
        {
          kind: "check",
          label: "Outline panel",
          shortcut: "Ctrl+Shift+O",
          checked: () => outlineVis(),
          action: toggleOutline,
        },
        {
          kind: "check",
          label: "Status bar",
          checked: () => statusBarVis(),
          action: toggleStatusBar,
        },
        { kind: "sep" },
        {
          kind: "check",
          label: "Typewriter mode",
          shortcut: "Alt+T",
          checked: () => typewriter(),
          action: toggleTypewriterMode,
        },
        {
          kind: "check",
          label: "Focus mode",
          shortcut: "Alt+F",
          checked: () => focus(),
          action: toggleFocusMode,
        },
        {
          kind: "check",
          label: "Distraction-free",
          shortcut: "Alt+D",
          checked: () => df(),
          action: toggleDistractionFree,
        },
        {
          kind: "check",
          label: "Scroll sync",
          checked: () => scrollSyncOn(),
          action: toggleScrollSync,
        },
        { kind: "sep" },
        {
          kind: "sub",
          label: "Layout presets",
          children: LAYOUT_PRESETS.map((preset) => ({
            kind: "check" as const,
            label: preset.label,
            checked: () => activeLayout() === preset.id,
            action: () => applyLayoutPreset(preset.id),
          })),
        },
        {
          kind: "action",
          label: "Reset layout",
          action: resetLayout,
        },
      ],
    },
    {
      label: "Insert",
      items: insertItems,
    },
  ];
};
