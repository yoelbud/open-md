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
  openExampleProject,
  openFile,
  openFind,
  openFindReplace,
  openProject,
  openProjectDocument,
  redo,
  resetLayout,
  saveFile,
  saveProject,
  toggleComments,
  toggleDistractionFree,
  toggleFocusMode,
  toggleOutline,
  togglePane,
  toggleProofread,
  toggleScrollSync,
  toggleStatusBar,
  toggleTypewriterMode,
  undo,
  useActiveLayout,
  useCommentsVisible,
  useDistractionFree,
  useFocusMode,
  useOutlineVisible,
  usePaneVisible,
  useProofreadVisible,
  useScrollSync,
  useStatusBarVisible,
  useTypewriterMode,
} from "../store/document";
import { toggleSpellcheck, useSpellcheck } from "../store/spellcheck";
import { exportPreviewPdf } from "../ipc/previewPdf";
import { exportHtmlAction, copyAsHtmlAction } from "../export/htmlExportAction";
import { exportDocxAction } from "../export/docxExportAction";
import { exportSlidesAction } from "../export/slidesExportAction";
import { exportPagedHtmlAction } from "../export/pagedExportAction";
import { THEME_PRESETS, setTheme, useThemeId } from "../store/theme";
import { toggleDiffMode, useDiffMode } from "../store/diff";
import { togglePagedMode, usePagedMode } from "../store/pagination";
import { diffAgainstHead } from "../store/git";
import { toggleSticky, useStickyEnabled } from "../store/stickyScroll";

export const buildMenus = (opts?: { onOpenCustomCss?: () => void }): MenuDef[] => {
  const vis = usePaneVisible();
  const activeLayout = useActiveLayout();
  const outlineVis = useOutlineVisible();
  const commentsVis = useCommentsVisible();
  const proofreadVis = useProofreadVisible();
  const statusBarVis = useStatusBarVisible();
  const typewriter = useTypewriterMode();
  const focus = useFocusMode();
  const df = useDistractionFree();
  const scrollSyncOn = useScrollSync();
  const spellcheckOn = useSpellcheck();
  const currentTheme = useThemeId();
  const diffModeOn = useDiffMode();
  const pagedModeOn = usePagedMode();
  const stickyOn = useStickyEnabled();

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
        { kind: "action", label: "Open Example Project", action: () => openExampleProject() },
        { kind: "sep" },
        { kind: "action", label: "Save Project (.ommd)", shortcut: "Ctrl+S", action: () => void saveProject() },
        { kind: "action", label: "Save Markdown…",       action: () => void saveFile() },
        { kind: "sep" },
        { kind: "action", label: "Export → Markdown…",      action: () => void exportMarkdown() },
        { kind: "action", label: "Export → HTML…",           action: () => void exportHtmlAction() },
        { kind: "action", label: "Export → Word (.docx)…",    action: () => void exportDocxAction() },
        { kind: "action", label: "Export → Slides…",         action: () => void exportSlidesAction() },
        { kind: "action", label: "Export → Paged HTML (Print)…", action: () => void exportPagedHtmlAction() },
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
        { kind: "sep" },
        {
          kind: "action",
          label: "Copy as HTML",
          action: () => void copyAsHtmlAction(),
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
          label: "Comments panel",
          shortcut: "Ctrl+Shift+M",
          checked: () => commentsVis(),
          action: toggleComments,
        },
        {
          kind: "check",
          label: "Proofreading panel",
          shortcut: "Ctrl+Shift+P",
          checked: () => proofreadVis(),
          action: toggleProofread,
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
        {
          kind: "check",
          label: "Sticky Headings",
          checked: () => stickyOn(),
          action: toggleSticky,
        },
        {
          kind: "check",
          label: "Spellcheck",
          checked: () => spellcheckOn(),
          action: toggleSpellcheck,
        },
        {
          kind: "check",
          label: "Show Changes (Diff)",
          shortcut: "Alt+G",
          checked: () => diffModeOn(),
          action: toggleDiffMode,
        },
        {
          kind: "action",
          label: "Diff Against Last Commit",
          action: () => void diffAgainstHead(),
        },
        {
          kind: "check",
          label: "Paged layout",
          shortcut: "Alt+P",
          checked: () => pagedModeOn(),
          action: togglePagedMode,
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
        { kind: "sep" },
        {
          kind: "sub",
          label: "Theme",
          children: THEME_PRESETS.map((preset) => ({
            kind: "check" as const,
            label: preset.label,
            checked: () => currentTheme() === preset.id,
            action: () => setTheme(preset.id),
          })),
        },
        {
          kind: "action",
          label: "Custom CSS…",
          action: () => opts?.onOpenCustomCss?.(),
        },
      ],
    },
    {
      label: "Insert",
      items: insertItems,
    },
  ];
};
