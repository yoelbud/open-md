// Slides export action layer — bridges DOM capture with the pure deck builder.
// Handles side-effects (DOM access, file save) keeping Tauri-specific bits isolated.

import { buildExportCss, exportTitle } from "./htmlExport";
import { buildSlidesHtml, splitIntoSlides } from "./slidesExport";
import { exportHtml, useDocument, usePath } from "../store/document";
import { useThemeId } from "../store/theme";
import appCssRaw from "../style.css?raw";
import type { Block } from "../ipc/types";

/**
 * Capture per-block rendered HTML from the live preview DOM.
 * Falls back to `block.html` when a DOM element isn't found.
 */
const captureBlockHtmlMap = (blocks: Block[]): Map<string, string> => {
  const map = new Map<string, string>();
  if (typeof document === "undefined") return map;

  for (const block of blocks) {
    const el = document.querySelector(`[data-block-id="${block.id}"]`);
    map.set(block.id, el ? el.innerHTML : block.html);
  }
  return map;
};

/**
 * Assemble a standalone HTML slide deck from the current preview state and
 * trigger export (save dialog or download).
 */
export const exportSlidesAction = async (): Promise<void> => {
  const blocks = useDocument().blocks;
  if (!blocks || blocks.length === 0) return;

  const blockHtmlMap = captureBlockHtmlMap(blocks);
  const slides = splitIntoSlides(blocks, blockHtmlMap);
  if (slides.length === 0) return;

  const filePath = usePath()();
  const title = exportTitle(filePath);
  const theme = useThemeId()();
  const css = buildExportCss(appCssRaw);

  const html = buildSlidesHtml({ slides, css, title, theme });
  await exportHtml(html);
};
