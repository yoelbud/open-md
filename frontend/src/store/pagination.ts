// Pagination preview state — mirrors the pattern in store/document.ts for
// preview settings. Manages paged mode toggle + page size/orientation config.

import { createSignal } from "solid-js";
import type { PageConfig, PageOrientation, PageSize } from "../export/pagination";
import { DEFAULT_PAGE_CONFIG } from "../export/pagination";

// --- Signals -----------------------------------------------------------------

const [pagedMode, setPagedModeRaw] = createSignal(false);
const [pageConfig, setPageConfigRaw] = createSignal<PageConfig>({ ...DEFAULT_PAGE_CONFIG });

// --- Public API --------------------------------------------------------------

/** Whether the preview pane is in paged layout mode. */
export const usePagedMode = () => pagedMode;

/** Current page configuration (size + orientation). */
export const usePageConfig = () => pageConfig;

/** Toggle paged preview mode on/off. */
export const togglePagedMode = () => {
  setPagedModeRaw((prev) => !prev);
};

/** Set paged mode explicitly. */
export const setPagedMode = (on: boolean) => {
  setPagedModeRaw(on);
};

/** Update page size. */
export const setPageSize = (size: PageSize) => {
  setPageConfigRaw((prev) => ({ ...prev, size }));
};

/** Update page orientation. */
export const setPageOrientation = (orientation: PageOrientation) => {
  setPageConfigRaw((prev) => ({ ...prev, orientation }));
};

/** Reset page config to defaults. */
export const resetPageConfig = () => {
  setPageConfigRaw({ ...DEFAULT_PAGE_CONFIG });
};
