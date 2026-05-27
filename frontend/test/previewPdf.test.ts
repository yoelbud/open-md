import { beforeEach, describe, expect, it, vi } from "vitest";
import { exportPreviewPdf, previewPdfDocumentTitle } from "../src/ipc/previewPdf";
import { useSetPath } from "../src/store/document";

const setPath = useSetPath();

beforeEach(() => {
  document.title = "open-md";
  setPath("(untitled).md");
  vi.restoreAllMocks();
});

describe("preview PDF export", () => {
  it("derives a readable print title from markdown paths", () => {
    expect(previewPdfDocumentTitle("notes.md")).toBe("notes");
    expect(previewPdfDocumentTitle("C:\\docs\\release-plan.markdown")).toBe("release-plan");
    expect(previewPdfDocumentTitle("")).toBe("open-md-preview");
  });

  it("prints with the current document name and restores the app title", () => {
    setPath("C:\\docs\\release-plan.md");
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);

    exportPreviewPdf();

    expect(print).toHaveBeenCalledOnce();
    expect(document.title).toBe("release-plan");

    window.dispatchEvent(new Event("afterprint"));

    expect(document.title).toBe("open-md");
  });
});
