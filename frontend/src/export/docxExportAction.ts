// DOCX export action layer — bridges the store with the pure DOCX builder.
// Handles side-effects (file save/download) so that docx.ts remains pure.

import { buildDocx } from "./docx";
import { exportTitle } from "./htmlExport";
import { usePath, useDocument } from "../store/document";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Download a binary file via a temporary <a> link.
 */
const downloadBinary = (filename: string, data: Uint8Array, mime: string): void => {
  const blob = new Blob([new Uint8Array(data)], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
};

interface WindowWithSaveFilePicker {
  showSaveFilePicker?: (opts: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<{ createWritable: () => Promise<{ write: (data: BlobPart) => Promise<void>; close: () => Promise<void> }> }>;
}

/**
 * Attempt to save binary data via the File System Access API picker.
 * Returns true if handled (saved or user-cancelled), false if API unavailable.
 */
const writeBinaryViaPicker = async (
  suggestedName: string,
  description: string,
  accept: Record<string, string[]>,
  data: Uint8Array,
): Promise<boolean> => {
  const savePicker = (window as unknown as WindowWithSaveFilePicker).showSaveFilePicker;
  if (!savePicker) return false;
  try {
    const handle = await savePicker({ suggestedName, types: [{ description, accept }] });
    const writable = await handle.createWritable();
    await writable.write(new Blob([new Uint8Array(data)], { type: DOCX_MIME }));
    await writable.close();
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return true;
    throw error;
  }
};

/**
 * Build and export the current document as a .docx file.
 */
export const exportDocxAction = async (): Promise<void> => {
  const filePath = usePath()();
  const title = exportTitle(filePath);
  const doc = useDocument();
  const blocks = doc.blocks;

  const docxBytes = buildDocx(blocks, { title });

  const suggested = `${filePath.replace(/\\/g, "/").split("/").pop()?.replace(/\.(ommd|md|markdown)$/i, "") || "document"}.docx`;

  try {
    const wrote = await writeBinaryViaPicker(
      suggested,
      "Word Document",
      { [DOCX_MIME]: [".docx"] },
      docxBytes,
    );
    if (wrote) return;
  } catch {
    // Fall through to download
  }

  downloadBinary(suggested, docxBytes, DOCX_MIME);
};
