import { usePath } from "../store/document";

const FALLBACK_PDF_TITLE = "open-md-preview";

export const previewPdfDocumentTitle = (path: string): string => {
  const leaf = path.split(/[\\/]/).pop()?.trim() || FALLBACK_PDF_TITLE;
  const title = leaf.replace(/\.(md|markdown)$/i, "").trim();
  return title || FALLBACK_PDF_TITLE;
};

export const exportPreviewPdf = () => {
  const previousTitle = document.title;
  let restored = false;
  let restoreTimer: number | undefined;

  const restoreTitle = () => {
    if (restored) return;
    restored = true;
    if (restoreTimer !== undefined) window.clearTimeout(restoreTimer);
    window.removeEventListener("afterprint", restoreTitle);
    document.title = previousTitle;
  };

  document.title = previewPdfDocumentTitle(usePath()());
  window.addEventListener("afterprint", restoreTitle);
  restoreTimer = window.setTimeout(restoreTitle, 3000);

  try {
    window.print();
  } catch (error) {
    restoreTitle();
    throw error;
  }
};
