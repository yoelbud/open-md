import { describe, it, expect } from "vitest";
import { headingPermalink, headingTextFromEl } from "../src/panes/preview/headingAnchor";

describe("headingPermalink", () => {
  it("generates markdown link with slug", () => {
    expect(headingPermalink("Hello World")).toBe("[Hello World](#hello-world)");
  });

  it("handles punctuation (stripped by slugify)", () => {
    expect(headingPermalink("What's New?")).toBe("[What's New?](#whats-new)");
  });

  it("empty text produces empty slug", () => {
    expect(headingPermalink("")).toBe("[](#)");
  });
});

describe("headingTextFromEl", () => {
  it("extracts trimmed text content", () => {
    const el = document.createElement("h2");
    el.textContent = "  Hello World  ";
    expect(headingTextFromEl(el)).toBe("Hello World");
  });

  it("returns empty string for empty element", () => {
    const el = document.createElement("h1");
    expect(headingTextFromEl(el)).toBe("");
  });
});
