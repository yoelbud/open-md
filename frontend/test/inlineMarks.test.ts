import { describe, expect, it } from "vitest";
import { parseDocument } from "../src/ipc/stub";

describe("inline text marks", () => {
  const html = (src: string) => parseDocument(src).blocks[0]?.html ?? "";

  it("renders subscript ~text~", () => {
    expect(html("H~2~O\n")).toContain("H<sub>2</sub>O");
  });

  it("renders superscript ^text^", () => {
    expect(html("x^2^ end\n")).toContain("x<sup>2</sup> end");
  });

  it("renders inserted ++text++", () => {
    expect(html("some ++added++ text\n")).toContain("some <ins>added</ins> text");
  });

  it("renders highlight ==text==", () => {
    expect(html("this is ==important== info\n")).toContain(
      "this is <mark>important</mark> info",
    );
  });

  it("renders strikethrough ~~text~~", () => {
    expect(html("~~deleted~~\n")).toContain("<del>deleted</del>");
  });

  it("does not apply marks inside code spans", () => {
    const result = html("a `~not sub~` b\n");
    expect(result).toContain("<code>~not sub~</code>");
    expect(result).not.toContain("<sub>");
  });

  it("does not match marks with spaces", () => {
    const result = html("~ nope ~ end\n");
    expect(result).not.toContain("<sub>");
  });

  it("single tilde does not collide with double", () => {
    const result = html("~~strike~~ and ~sub~\n");
    expect(result).toContain("<del>strike</del>");
    expect(result).toContain("<sub>sub</sub>");
  });

  it("handles multiple marks in same paragraph", () => {
    const result = html("^sup^ and ~sub~ and ==hl==\n");
    expect(result).toContain("<sup>sup</sup>");
    expect(result).toContain("<sub>sub</sub>");
    expect(result).toContain("<mark>hl</mark>");
  });
});
