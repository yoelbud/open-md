// Paged HTML export action layer — bridges DOM capture with the pure paged builder.
// Handles side-effects (DOM access, file save) keeping Tauri-specific bits isolated.

import { buildExportCss, capturePreviewHtml, exportTitle } from "./htmlExport";
import { buildPagedHtml, DEFAULT_PAGE_CONFIG } from "./pagination";
import { exportHtml, usePath } from "../store/document";
import { useThemeId } from "../store/theme";
import { usePageConfig } from "../store/pagination";
import appCssRaw from "../style.css?raw";

/**
 * Assemble a standalone paged HTML document from the current preview state
 * and trigger export (save dialog or download).
 *
 * The exported document:
 * - Uses CSS `@page` rules for correct print/PDF pagination.
 * - Shows visual page frames with page numbers when viewed in a browser.
 * - Honors explicit page break markers (`<!-- pagebreak -->`, `\pagebreak`).
 * - Applies `break-inside: avoid` for headings, tables, figures, and code blocks.
 */
export const exportPagedHtmlAction = async (): Promise<void> => {
  const bodyHtml = capturePreviewHtml();
  if (!bodyHtml) return;

  const filePath = usePath()();
  const title = exportTitle(filePath);
  const theme = useThemeId()();
  const css = buildExportCss(appCssRaw);
  const pageConfig = usePageConfig()() ?? DEFAULT_PAGE_CONFIG;

  const html = buildPagedHtml({ bodyHtml, css, title, theme, pageConfig });
  await exportHtml(html);
};
