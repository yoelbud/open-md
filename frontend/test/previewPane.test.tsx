import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render } from "solid-js/web";
import { PreviewPane } from "../src/panes/preview/PreviewPane";
import { newDocument, useSetSource, useSource } from "../src/store/document";

const setSource = useSetSource();
const nextMicrotask = () => new Promise<void>((resolve) => queueMicrotask(resolve));

let root: HTMLDivElement;
let dispose: (() => void) | undefined;

const mountPreview = () => {
  dispose = render(() => <PreviewPane />, root);
};

const firstPreviewBlock = () => {
  const block = root.querySelector<HTMLElement>(".preview-block");
  expect(block).toBeTruthy();
  return block!;
};

const activePreviewTextarea = () => {
  const textarea = root.querySelector<HTMLTextAreaElement>("textarea.preview-edit-ta");
  expect(textarea).toBeTruthy();
  return textarea!;
};

beforeEach(() => {
  newDocument();
  root = document.createElement("div");
  document.body.append(root);
});

afterEach(() => {
  dispose?.();
  dispose = undefined;
  root.remove();
});

describe("PreviewPane editing", () => {
  it("commits list edits without nesting existing markers", async () => {
    setSource("- parent\n  - child\n\nsecond\n");
    mountPreview();
    await nextMicrotask();

    firstPreviewBlock().click();
    await nextMicrotask();

    const textarea = activePreviewTextarea();
    expect(textarea.value).toBe("- parent\n  - child");

    textarea.value = "- parent\n  - edited child";
    textarea.dispatchEvent(new InputEvent("input", { bubbles: true }));
    textarea.dispatchEvent(new FocusEvent("blur"));
    await nextMicrotask();

    expect(useSource()()).toBe("- parent\n  - edited child\n\nsecond\n");
    expect(useSource()()).not.toContain("- - parent");
  });

  it("commits code-block edits without adding a second fence", async () => {
    setSource("```rust\nfn main() {}\n```\n\nafter\n");
    mountPreview();
    await nextMicrotask();

    firstPreviewBlock().click();
    await nextMicrotask();

    const textarea = activePreviewTextarea();
    expect(textarea.value).toBe("```rust\nfn main() {}\n```");

    textarea.value = "```rust\nfn main() { run(); }\n```";
    textarea.dispatchEvent(new InputEvent("input", { bubbles: true }));
    textarea.dispatchEvent(new FocusEvent("blur"));
    await nextMicrotask();

    expect(useSource()()).toBe("```rust\nfn main() { run(); }\n```\n\nafter\n");
    expect(useSource()().match(/```/g)).toHaveLength(2);
  });
});
