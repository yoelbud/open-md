import { describe, expect, it, beforeEach } from "vitest";
import {
  applyLayoutPreset,
  BLOCK_TEMPLATES,
  canRedo,
  canUndo,
  insertBlockAfter,
  insertBlockAtStart,
  LAYOUT_PRESETS,
  movePane,
  newDocument,
  applyProject,
  loadMarkdownFile,
  useProjectFiles,
  useProjectRoot,
  useActiveProjectFile,
  PANE_SIZE_MIN,
  redo,
  replaceBlockSource,
  resetLayout,
  resetPreviewTypography,
  resizePanePair,
  setPreviewTypography,
  togglePane,
  undo,
  useActiveLayout,
  useDocument,
  usePaneOrder,
  usePaneSizes,
  usePaneVisible,
  useVisiblePanes,
  usePath,
  usePreviewSettings,
  useSetSource,
  useSource,
} from "../src/store/document";

const setSource = useSetSource();

beforeEach(() => {
  resetLayout();
  resetPreviewTypography();
  newDocument();
  setSource("# H\n\nfirst\n\nsecond\n");
});

describe("document store", () => {
  it("exposes the current source", () => {
    expect(useSource()()).toContain("# H");
  });

  it("supports undo/redo on edits", () => {
    setSource("# H\n\nedited\n\nsecond\n");
    expect(canUndo()).toBe(true);
    undo();
    expect(useSource()()).toContain("first");
    expect(canRedo()).toBe(true);
    redo();
    expect(useSource()()).toContain("edited");
  });

  it("replaceBlockSource swaps only the targeted block", () => {
    const doc = useDocument();
    const para = doc.blocks.find((b) => b.source.startsWith("first"));
    expect(para).toBeDefined();
    replaceBlockSource(para!, "REPLACED\n\n");
    expect(useSource()()).toContain("REPLACED");
    expect(useSource()()).toContain("second");
  });

  it("insertBlockAtStart prepends", () => {
    insertBlockAtStart("# NEW\n\n");
    expect(useSource()().startsWith("# NEW")).toBe(true);
  });

  it("insertBlockAfter places the snippet after the given block", () => {
    const block = useDocument().blocks[0]!;
    insertBlockAfter(block, "## INSERTED\n\n");
    const idx = useSource()().indexOf("## INSERTED");
    expect(idx).toBeGreaterThan(0);
    expect(useSource()().slice(0, idx)).toContain("# H");
  });

  it("togglePane never hides the last visible pane", () => {
    togglePane("ir");
    togglePane("preview");
    expect(usePaneVisible()()).toEqual({
      source: true,
      ir: false,
      preview: false,
    });
    togglePane("source");
    expect(usePaneVisible()().source).toBe(true);
  });

  it("applies layout presets with order, sizes, visibility, and active state", () => {
    applyLayoutPreset("write");

    expect(useActiveLayout()()).toBe("write");
    expect(usePaneOrder()()).toEqual(["source", "preview", "ir"]);
    expect(useVisiblePanes()()).toEqual(["source", "preview"]);
    expect(usePaneVisible()()).toEqual({
      source: true,
      ir: false,
      preview: true,
    });
    expect(usePaneSizes()().preview).toBeGreaterThan(usePaneSizes()().ir);
  });

  it("moves panes relative to the visible layout and marks it custom", () => {
    movePane("preview", -1);

    expect(usePaneOrder()()).toEqual(["source", "preview", "ir"]);
    expect(useVisiblePanes()()).toEqual(["source", "preview", "ir"]);
    expect(useActiveLayout()()).toBe("custom");
  });

  it("resizes pane pairs while clamping to the minimum pane size", () => {
    resizePanePair("source", "ir", 0.25);
    expect(usePaneSizes()().source).toBeCloseTo(1.25, 2);
    expect(usePaneSizes()().ir).toBeCloseTo(0.75, 2);
    expect(useActiveLayout()()).toBe("custom");

    resizePanePair("source", "ir", -10);
    expect(usePaneSizes()().source).toBe(PANE_SIZE_MIN);
    expect(usePaneSizes()().ir).toBeGreaterThan(PANE_SIZE_MIN);
  });

  it("resetLayout restores the balanced preset", () => {
    applyLayoutPreset("review");
    movePane("source", 1);

    resetLayout();

    expect(useActiveLayout()()).toBe("balanced");
    expect(usePaneOrder()()).toEqual(["source", "ir", "preview"]);
    expect(useVisiblePanes()()).toEqual(["source", "ir", "preview"]);
  });

  it("BLOCK_TEMPLATES each have non-empty label + either snippet or getSnippet", () => {
    expect(BLOCK_TEMPLATES.length).toBeGreaterThan(0);
    for (const t of BLOCK_TEMPLATES) {
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.icon.length).toBeGreaterThan(0);
      // Either a static snippet or an async producer must be defined.
      const hasSnippet = t.snippet.length > 0;
      const hasProducer = typeof t.getSnippet === "function";
      expect(hasSnippet || hasProducer).toBe(true);
    }
  });

  it("BLOCK_TEMPLATES have unique ids", () => {
    const ids = new Set(BLOCK_TEMPLATES.map((t) => t.id));
    expect(ids.size).toBe(BLOCK_TEMPLATES.length);
  });

  it("LAYOUT_PRESETS have unique ids and at least one visible pane", () => {
    const ids = new Set(LAYOUT_PRESETS.map((preset) => preset.id));
    expect(ids.size).toBe(LAYOUT_PRESETS.length);
    for (const preset of LAYOUT_PRESETS) {
      expect(Object.values(preset.visible).some(Boolean)).toBe(true);
      expect(preset.order).toHaveLength(3);
    }
  });

  it("newDocument clears path and source", () => {
    newDocument();
    expect(useSource()()).toBe("");
    expect(usePath()()).toBe("(untitled).md");
  });

  it("tracks project files separately from the current document", () => {
    applyProject({
      root: "C:/project",
      files: [
        { path: "C:/project/a.md", relativePath: "a.md" },
        { path: "C:/project/sub/b.md", relativePath: "sub/b.md" },
      ],
    });
    expect(useProjectRoot()()).toBe("C:/project");
    expect(useProjectFiles()()).toHaveLength(2);
    expect(useActiveProjectFile()()).toBeNull();

    loadMarkdownFile({ path: "C:/project/a.md", source: "# A" });
    expect(useSource()()).toBe("# A");
    expect(usePath()()).toBe("C:/project/a.md");
    expect(useActiveProjectFile()()).toBe("C:/project/a.md");
  });

  it("keeps preview typography as IR metadata instead of markdown source", () => {
    const before = useSource()();

    setPreviewTypography({ fontFamily: "serif", fontSizePx: 22, lineHeight: 1.9, contentWidth: "wide" });

    expect(useSource()()).toBe(before);
    expect(usePreviewSettings()()).toEqual({
      fontFamily: "serif",
      fontSizePx: 22,
      lineHeight: 1.9,
      contentWidth: "wide",
    });
    expect(useDocument().preview).toEqual(usePreviewSettings()());
  });

  it("clamps invalid preview typography values", () => {
    setPreviewTypography({ fontSizePx: 99, lineHeight: 9 });

    expect(usePreviewSettings()().fontSizePx).toBe(28);
    expect(usePreviewSettings()().lineHeight).toBe(2.2);
  });
});
