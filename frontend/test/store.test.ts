import { describe, expect, it, beforeEach } from "vitest";
import {
  BLOCK_TEMPLATES,
  canRedo,
  canUndo,
  insertBlockAfter,
  insertBlockAtStart,
  newDocument,
  redo,
  replaceBlockSource,
  togglePane,
  undo,
  useDocument,
  usePaneVisible,
  usePath,
  useSetSource,
  useSource,
} from "../src/store/document";

const setSource = useSetSource();

beforeEach(() => {
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

  it("newDocument clears path and source", () => {
    newDocument();
    expect(useSource()()).toBe("");
    expect(usePath()()).toBe("(untitled).md");
  });
});
