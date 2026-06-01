import { describe, expect, it, beforeEach } from "vitest";
import { createRoot } from "solid-js";
import {
  applyWorkspaceMode,
  closePresentation,
  initLayoutPersistence,
  togglePane,
  togglePresentation,
  useActiveMode,
  useCommentsVisible,
  useOutlineVisible,
  usePaneVisible,
  usePresentationActive,
  useProofreadVisible,
  WORKSPACE_MODES,
} from "../src/store/document";

describe("workspace modes", () => {
  beforeEach(() => {
    // Start each test from a known, non-presenting state.
    closePresentation();
    applyWorkspaceMode("document");
  });

  it("exposes the five expected modes", () => {
    expect(WORKSPACE_MODES.map((m) => m.id)).toEqual([
      "write",
      "document",
      "review",
      "present",
      "inspect",
    ]);
  });

  it("Write mode shows source + preview, hides the IR pane and panels", () => {
    applyWorkspaceMode("write");
    expect(useActiveMode()()).toBe("write");
    const vis = usePaneVisible()();
    expect(vis.source).toBe(true);
    expect(vis.preview).toBe(true);
    expect(vis.ir).toBe(false);
    expect(useOutlineVisible()()).toBe(false);
    expect(useCommentsVisible()()).toBe(false);
    expect(useProofreadVisible()()).toBe(false);
  });

  it("Document mode opens the outline", () => {
    applyWorkspaceMode("document");
    expect(useActiveMode()()).toBe("document");
    expect(useOutlineVisible()()).toBe(true);
  });

  it("Review mode opens comments and proofreading", () => {
    applyWorkspaceMode("review");
    expect(useActiveMode()()).toBe("review");
    expect(useCommentsVisible()()).toBe(true);
    expect(useProofreadVisible()()).toBe(true);
  });

  it("Inspect mode reveals the IR pane", () => {
    applyWorkspaceMode("inspect");
    expect(useActiveMode()()).toBe("inspect");
    expect(usePaneVisible()().ir).toBe(true);
  });

  it("Present mode activates the presentation overlay", () => {
    applyWorkspaceMode("present");
    expect(useActiveMode()()).toBe("present");
    expect(usePresentationActive()()).toBe(true);
  });

  it("closing the presentation restores the previous mode", () => {
    applyWorkspaceMode("review");
    applyWorkspaceMode("present");
    expect(usePresentationActive()()).toBe(true);
    closePresentation();
    expect(usePresentationActive()()).toBe(false);
    expect(useActiveMode()()).toBe("review");
  });

  it("togglePresentation toggles the overlay", () => {
    expect(usePresentationActive()()).toBe(false);
    togglePresentation();
    expect(usePresentationActive()()).toBe(true);
    togglePresentation();
    expect(usePresentationActive()()).toBe(false);
  });

  it("manual pane edits clear the active mode", () => {
    applyWorkspaceMode("write");
    expect(useActiveMode()()).toBe("write");
    togglePane("ir");
    expect(useActiveMode()()).toBeNull();
  });

  it("does not persist the transient present mode", async () => {
    if (
      typeof localStorage === "undefined" ||
      typeof localStorage.setItem !== "function" ||
      typeof localStorage.getItem !== "function"
    ) {
      return;
    }
    const dispose = createRoot((d) => {
      initLayoutPersistence();
      return d;
    });
    try {
      applyWorkspaceMode("review");
      applyWorkspaceMode("present");
      // Let the Solid persistence effect flush to localStorage.
      await new Promise((resolve) => setTimeout(resolve, 0));
      const raw = localStorage.getItem("open-md:layout");
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw as string) as { mode: string | null };
      // The underlying workspace ("review"), not the transient "present", persists.
      expect(parsed.mode).toBe("review");
    } finally {
      closePresentation();
      dispose();
    }
  });
});
