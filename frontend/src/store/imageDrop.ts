// Helpers for paste and drag-drop image ingestion.
//
// Detects image data in ClipboardEvent / DragEvent, ingests it through the
// asset store, and returns the markdown snippet ready for insertion. Pure
// helpers are split out for testability; the wiring to DOM events lives in
// components (SourcePane / PreviewPane).

import { ingestImageFile, formatImageMarkdown } from "./document";

// ─── Detection helpers ──────────────────────────────────────────────────────

/** Does the mime type look like an image? */
export const isImageMime = (mime: string): boolean =>
  /^image\/(png|jpe?g|gif|webp|svg\+xml|bmp|tiff?)$/i.test(mime);

/** Extract an image File from a paste event's clipboardData, or null. */
export const imageFileFromPaste = (e: ClipboardEvent): File | null => {
  const items = e.clipboardData?.items;
  if (!items) return null;
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    if (item.kind === "file" && isImageMime(item.type)) {
      return item.getAsFile();
    }
  }
  return null;
};

/** Extract image Files from a drop event's dataTransfer. */
export const imageFilesFromDrop = (e: DragEvent): File[] => {
  const dt = e.dataTransfer;
  if (!dt) return [];
  const files: File[] = [];
  for (let i = 0; i < dt.files.length; i++) {
    const f = dt.files[i]!;
    if (isImageMime(f.type)) files.push(f);
  }
  return files;
};

/** Derive a human-friendly hint name from a File. */
export const hintNameFromFile = (file: File): string => {
  if (file.name && file.name !== "image.png") return file.name;
  // Pasted images often have a generic name — use a timestamp hint.
  return `pasted-${Date.now()}`;
};

// ─── Markdown snippet builder ───────────────────────────────────────────────

/** Build the standard `![alt](path)` snippet for an ingested file. */
export const buildImageSnippet = (assetPath: string, altText: string): string =>
  formatImageMarkdown({ alt: altText, src: assetPath });

// ─── Async ingest-and-build convenience ─────────────────────────────────────

/**
 * Ingest a single image file into the asset store and return the markdown
 * snippet. Returns null if ingestion fails.
 */
export const ingestAndBuildSnippet = async (
  file: File | Blob,
  hintName?: string,
): Promise<string | null> => {
  try {
    const name = hintName ?? (file instanceof File ? file.name : "image");
    const path = await ingestImageFile(file, name);
    const alt = name.replace(/\.[^.]+$/, "");
    return buildImageSnippet(path, alt);
  } catch {
    return null;
  }
};
