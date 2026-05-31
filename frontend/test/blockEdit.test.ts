import { describe, expect, it } from "vitest";
import { fromEditableText, toEditableText, withBlockTrailing } from "../src/markdown/blockEdit";
import type { Block } from "../src/ipc/types";

const blockWithSource = (source: string): Pick<Block, "source"> => ({ source });

describe("blockEdit text round-trips", () => {
  it("round-trips a nested list without adding another list marker", () => {
    const block = blockWithSource("- parent\n  - child\n");
    const value = toEditableText(block);

    expect(value).toBe("- parent\n  - child");
    expect(fromEditableText(block, value)).toBe(block.source);
  });

  it("round-trips a task list keeping its checkbox markers", () => {
    const block = blockWithSource("- [ ] todo\n- [x] done\n");

    expect(fromEditableText(block, toEditableText(block))).toBe("- [ ] todo\n- [x] done\n");
  });

  it("round-trips a fenced code block without adding a second fence", () => {
    const block = blockWithSource("```ts\nconst x = 1;\n```\n");
    const value = toEditableText(block);

    expect(value).toBe("```ts\nconst x = 1;\n```");
    expect(fromEditableText(block, value)).toBe(block.source);
  });

  it("keeps an edited code body inside the same single fenced block", () => {
    const block = blockWithSource("```rust\nfn main() {}\n```\n");

    expect(fromEditableText(block, "```rust\nfn main() { run(); }\n```")).toBe(
      "```rust\nfn main() { run(); }\n```\n",
    );
  });

  it("round-trips headings, quotes, and paragraphs unchanged", () => {
    const examples = ["# Heading\n", "> quoted\n> line\n", "Just a paragraph.\n"];

    for (const source of examples) {
      const block = blockWithSource(source);
      expect(fromEditableText(block, toEditableText(block))).toBe(source);
    }
  });

  it("preserves a block that has no structural trailing newline", () => {
    const block = blockWithSource("- last item");

    expect(toEditableText(block)).toBe("- last item");
    expect(fromEditableText(block, "- last item edited")).toBe("- last item edited");
  });

  it("normalizes non-breaking spaces without changing block structure", () => {
    const block = blockWithSource("- item\n");

    expect(fromEditableText(block, "- item\u00a0edited")).toBe("- item edited\n");
  });

  it("does not double the trailing newline when the value already ends with one", () => {
    const block = blockWithSource("# Heading\n");

    expect(fromEditableText(block, "# Heading\n")).toBe("# Heading\n");
  });
});

describe("withBlockTrailing for structured editors", () => {
  it("re-attaches the trailing newline to a formatted table body", () => {
    const block = blockWithSource("| a |\n| - |\n| 1 |\n");
    const body = "| a | b |\n| - | - |\n| 1 | 2 |";

    expect(withBlockTrailing(block, body)).toBe(`${body}\n`);
  });

  it("omits the trailing newline when the source block had none", () => {
    const block = blockWithSource("![alt](img.png)");

    expect(withBlockTrailing(block, "![alt](img.png \"t\")")).toBe("![alt](img.png \"t\")");
  });

  it("does not add a second newline when the body already ends with one", () => {
    const block = blockWithSource("| a |\n| - |\n");

    expect(withBlockTrailing(block, "| a |\n| - |\n")).toBe("| a |\n| - |\n");
  });
});
