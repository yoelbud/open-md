import { describe, expect, it } from "vitest";
import {
  turnInto,
  blockAsMarkdown,
  blockAsPlainText,
  anchorNameFor,
  uniqueAnchorName,
} from "../src/store/blockActions";
import type { Block } from "../src/ipc/types";

const block = (over: Partial<Block>): Block => ({
  id: over.id ?? "b1",
  kind: over.kind ?? "paragraph",
  src_range: over.src_range ?? [0, 0],
  hash: over.hash ?? 0,
  source: over.source ?? "",
  html: over.html ?? "<p>hello</p>",
  plain_html: over.plain_html ?? "<p>hello</p>",
});

// ── turnInto ──────────────────────────────────────────────────────────────────

describe("turnInto", () => {
  describe("from paragraph", () => {
    const src = "Hello world";

    it("→ paragraph (no-op)", () => {
      expect(turnInto(src, "paragraph")).toBe("Hello world");
    });

    it("→ h1", () => {
      expect(turnInto(src, "h1")).toBe("# Hello world");
    });

    it("→ h2", () => {
      expect(turnInto(src, "h2")).toBe("## Hello world");
    });

    it("→ h3", () => {
      expect(turnInto(src, "h3")).toBe("### Hello world");
    });

    it("→ quote", () => {
      expect(turnInto(src, "quote")).toBe("> Hello world");
    });

    it("→ code", () => {
      expect(turnInto(src, "code")).toBe("```\nHello world\n```");
    });

    it("→ ul", () => {
      expect(turnInto(src, "ul")).toBe("- Hello world");
    });

    it("→ ol", () => {
      expect(turnInto(src, "ol")).toBe("1. Hello world");
    });
  });

  describe("from heading", () => {
    const src = "## My Heading";

    it("→ paragraph strips hashes", () => {
      expect(turnInto(src, "paragraph")).toBe("My Heading");
    });

    it("→ h1 re-levels", () => {
      expect(turnInto(src, "h1")).toBe("# My Heading");
    });

    it("→ h3 re-levels", () => {
      expect(turnInto(src, "h3")).toBe("### My Heading");
    });

    it("→ quote", () => {
      expect(turnInto(src, "quote")).toBe("> My Heading");
    });
  });

  describe("from bullet list", () => {
    const src = "- item one\n- item two\n- item three";

    it("→ paragraph joins lines", () => {
      expect(turnInto(src, "paragraph")).toBe("item one\nitem two\nitem three");
    });

    it("→ ol renumbers", () => {
      expect(turnInto(src, "ol")).toBe("1. item one\n2. item two\n3. item three");
    });

    it("→ quote", () => {
      expect(turnInto(src, "quote")).toBe("> item one\n> item two\n> item three");
    });

    it("→ code wraps in fence", () => {
      expect(turnInto(src, "code")).toBe("```\nitem one\nitem two\nitem three\n```");
    });

    it("→ h2 collapses to single line", () => {
      expect(turnInto(src, "h2")).toBe("## item one item two item three");
    });
  });

  describe("from ordered list", () => {
    const src = "1. first\n2. second";

    it("→ ul", () => {
      expect(turnInto(src, "ul")).toBe("- first\n- second");
    });

    it("→ paragraph", () => {
      expect(turnInto(src, "paragraph")).toBe("first\nsecond");
    });
  });

  describe("from quote", () => {
    const src = "> quoted line\n> another";

    it("→ paragraph strips >", () => {
      expect(turnInto(src, "paragraph")).toBe("quoted line\nanother");
    });

    it("→ ul", () => {
      expect(turnInto(src, "ul")).toBe("- quoted line\n- another");
    });
  });

  describe("from code block", () => {
    const src = "```js\nconsole.log('hi');\nreturn 42;\n```";

    it("→ paragraph", () => {
      expect(turnInto(src, "paragraph")).toBe("console.log('hi');\nreturn 42;");
    });

    it("→ ul", () => {
      expect(turnInto(src, "ul")).toBe("- console.log('hi');\n- return 42;");
    });

    it("→ quote", () => {
      expect(turnInto(src, "quote")).toBe("> console.log('hi');\n> return 42;");
    });
  });

  describe("multi-line paragraph", () => {
    const src = "line one\nline two\nline three";

    it("→ h1 collapses all lines into one", () => {
      expect(turnInto(src, "h1")).toBe("# line one line two line three");
    });

    it("→ ul gives each line a bullet", () => {
      expect(turnInto(src, "ul")).toBe("- line one\n- line two\n- line three");
    });
  });

  describe("anchor handling", () => {
    it("strips trailing ^anchor from source before conversion", () => {
      const src = "Hello world ^my-anchor";
      expect(turnInto(src, "h1")).toBe("# Hello world");
    });
  });

  describe("trailing whitespace", () => {
    it("trims trailing whitespace from paragraph output", () => {
      const src = "Hello  \n";
      expect(turnInto(src, "paragraph")).toBe("Hello");
    });
  });
});

// ── blockAsMarkdown ─────────────────────────────────────────────────────────

describe("blockAsMarkdown", () => {
  it("returns source trimmed of trailing newlines", () => {
    expect(blockAsMarkdown(block({ source: "# Hello\n\n" }))).toBe("# Hello");
  });

  it("preserves internal newlines", () => {
    expect(blockAsMarkdown(block({ source: "- a\n- b\n" }))).toBe("- a\n- b");
  });
});

// ── blockAsPlainText ────────────────────────────────────────────────────────

describe("blockAsPlainText", () => {
  it("strips HTML tags", () => {
    expect(blockAsPlainText("<p>Hello <strong>world</strong></p>")).toBe("Hello world");
  });

  it("returns empty string from empty HTML", () => {
    expect(blockAsPlainText("")).toBe("");
  });

  it("trims whitespace", () => {
    expect(blockAsPlainText("<p>  spaces  </p>")).toBe("spaces");
  });
});

// ── anchorNameFor ───────────────────────────────────────────────────────────

describe("anchorNameFor", () => {
  it("returns existing anchor if present", () => {
    expect(anchorNameFor(block({ source: "Hello ^existing-name" }))).toBe("existing-name");
  });

  it("slugifies heading text", () => {
    expect(anchorNameFor(block({ source: "## My Heading" }))).toBe("my-heading");
  });

  it("slugifies first 24 chars of source for non-headings", () => {
    expect(anchorNameFor(block({ source: "Some paragraph text" }))).toBe("some-paragraph-text");
  });

  it("falls back to 'block' when slug is empty", () => {
    expect(anchorNameFor(block({ source: "!!!" }))).toBe("block");
  });
});

// ── uniqueAnchorName ────────────────────────────────────────────────────────

describe("uniqueAnchorName", () => {
  it("returns base when not taken", () => {
    expect(uniqueAnchorName("foo", new Set(["bar"]))).toBe("foo");
  });

  it("appends -2 on first collision", () => {
    expect(uniqueAnchorName("foo", new Set(["foo"]))).toBe("foo-2");
  });

  it("increments until free", () => {
    expect(uniqueAnchorName("foo", new Set(["foo", "foo-2", "foo-3"]))).toBe("foo-4");
  });

  it("handles empty taken set", () => {
    expect(uniqueAnchorName("x", new Set())).toBe("x");
  });
});
