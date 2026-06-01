import { describe, expect, it } from "vitest";
import { toggleWrap, linkifySelection } from "../src/store/selectionActions";

describe("toggleWrap", () => {
  it("wraps a span with ** for bold", () => {
    expect(toggleWrap("hello world", 6, 11, "**")).toBe("hello **world**");
  });

  it("removes ** when span is already bold-wrapped", () => {
    expect(toggleWrap("hello **world**", 8, 13, "**")).toBe("hello world");
  });

  it("round-trips: wrap then unwrap is identity", () => {
    const src = "hello world";
    const wrapped = toggleWrap(src, 6, 11, "**");
    // After wrapping offsets shift: the text "world" is now at 8..13
    const unwrapped = toggleWrap(wrapped, 8, 13, "**");
    expect(unwrapped).toBe(src);
  });

  it("wraps with * for italic", () => {
    expect(toggleWrap("abc def", 4, 7, "*")).toBe("abc *def*");
  });

  it("removes * when already italic-wrapped", () => {
    expect(toggleWrap("abc *def*", 5, 8, "*")).toBe("abc def");
  });

  it("wraps with ` for code", () => {
    expect(toggleWrap("use foo here", 4, 7, "`")).toBe("use `foo` here");
  });

  it("removes ` when already code-wrapped", () => {
    expect(toggleWrap("use `foo` here", 5, 8, "`")).toBe("use foo here");
  });

  it("handles unicode (emoji) before the span with scalar offsets", () => {
    // "🎉 hello" — 🎉 is 1 scalar value
    const src = "🎉 hello";
    // scalar indices: 0=🎉, 1= , 2=h, 3=e, 4=l, 5=l, 6=o
    const result = toggleWrap(src, 2, 7, "**");
    expect(result).toBe("🎉 **hello**");
  });

  it("handles emoji before span: unwrap", () => {
    const src = "🎉 **hello**";
    // scalar: 0=🎉,1= ,2=*,3=*,4=h,5=e,6=l,7=l,8=o,9=*,10=*
    const result = toggleWrap(src, 4, 9, "**");
    expect(result).toBe("🎉 hello");
  });
});

describe("linkifySelection", () => {
  it("wraps selected span as a markdown link", () => {
    expect(linkifySelection("click here now", 6, 10, "https://x.com")).toBe(
      "click [here](https://x.com) now",
    );
  });

  it("works with unicode scalar offsets", () => {
    const src = "🎉 link";
    // scalar: 0=🎉,1= ,2=l,3=i,4=n,5=k
    expect(linkifySelection(src, 2, 6, "http://a")).toBe("🎉 [link](http://a)");
  });
});
