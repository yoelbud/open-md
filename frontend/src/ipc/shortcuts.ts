// Application-level keyboard shortcuts.
// Call once from App — registers global keydown handlers.

import {
  canRedo,
  canUndo,
  createMarkdownFile,
  newDocument,
  openFile,
  redo,
  saveProject,
  togglePane,
  undo,
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
    }
  };
  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
};
