// Application-level keyboard shortcuts.
// Call once from App — registers global keydown handlers.

import {
  canRedo,
  canUndo,
  closeFind,
  createMarkdownFile,
  newDocument,
  openFile,
  openFind,
  openFindReplace,
  redo,
  saveProject,
  toggleDistractionFree,
  toggleFocusMode,
  togglePane,
  toggleTypewriterMode,
  undo,
  useFindOpen,
} from "../store/document";
import { exportPreviewPdf } from "./previewPdf";

export const registerShortcuts = () => {
  const handler = (e: KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;

    switch (e.key.toLowerCase()) {
      case "n":
        e.preventDefault();
        if (e.shiftKey) void createMarkdownFile();
        else newDocument();
        break;
      case "o":
        e.preventDefault();
        void openFile();
        break;
      case "p":
        e.preventDefault();
        exportPreviewPdf();
        break;
      case "s":
        e.preventDefault();
        void saveProject();
        break;
      case "z":
        e.preventDefault();
        if (e.shiftKey) { if (canRedo()) redo(); }
        else            { if (canUndo()) undo(); }
        break;
      case "y":
        e.preventDefault();
        if (canRedo()) redo();
        break;
      case "1":
        e.preventDefault();
        togglePane("source");
        break;
      case "2":
        e.preventDefault();
        togglePane("ir");
        break;
      case "3":
        e.preventDefault();
        togglePane("preview");
        break;
      case "f":
        e.preventDefault();
        openFind();
        break;
      case "h":
        e.preventDefault();
        openFindReplace();
        break;
      case "escape":
        if (useFindOpen()()) closeFind();
        break;
      case "f11":
        e.preventDefault();
        toggleDistractionFree();
        break;
    }

    // Alt-based shortcuts (no Ctrl required)
    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      // handled below
    }
  };

  const altHandler = (e: KeyboardEvent) => {
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    switch (e.key.toLowerCase()) {
      case "t":
        e.preventDefault();
        toggleTypewriterMode();
        break;
      case "f":
        e.preventDefault();
        toggleFocusMode();
        break;
      case "d":
        e.preventDefault();
        toggleDistractionFree();
        break;
    }
  };

  window.addEventListener("keydown", handler);
  window.addEventListener("keydown", altHandler);
  return () => {
    window.removeEventListener("keydown", handler);
    window.removeEventListener("keydown", altHandler);
  };
};
