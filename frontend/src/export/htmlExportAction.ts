// HTML export action layer — bridges DOM capture with the pure builder.
// This module handles side-effects (DOM access, file save, clipboard) so that
// the core builder remains a pure, testable function.

import {
  buildExportCss,
  buildStandaloneHtml,
  capturePreviewHtml,
  copyHtmlToClipboard,
  exportTitle,
} from "./htmlExport";
import { exportHtml, usePath } from "../store/document";
import { useThemeId } from "../store/theme";
import appCssRaw from "../style.css?raw";

/**
 * Assemble a standalone HTML document from the current preview state and
 * trigger export (save dialog or download).
 */
export const exportHtmlAction = async (): Promise<void> => {
  const bodyHtml = capturePreviewHtml();
  if (!bodyHtml) return;

  const filePath = usePath()();
  const title = exportTitle(filePath);
  const theme = useThemeId()();
  const css = buildExportCss(appCssRaw);

  const html = buildStandaloneHtml({ title, bodyHtml, css, theme });
  await exportHtml(html);
};

/**
 * Copy the preview's rendered HTML to the clipboard as rich text.
 */
export const copyAsHtmlAction = async (): Promise<void> => {
  const bodyHtml = capturePreviewHtml();
  if (!bodyHtml) return;

  // Wrap in minimal styling for paste targets that interpret text/html
  const wrapped = `<div class="om-export">${bodyHtml}</div>`;
  await copyHtmlToClipboard(wrapped);
};
