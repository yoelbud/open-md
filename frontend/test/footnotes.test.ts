import { describe, expect, it, beforeEach } from "vitest";
import { getFootnoteBody } from "../src/panes/preview/footnotes";

describe("getFootnoteBody", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
  });

  it("returns body HTML from a matching om-fndef element", () => {
    container.innerHTML = `
      <div class="om-fndef" id="fn-1" data-om-fndef="1">
        <span class="om-fndef-label">1.</span>
        <span class="om-fndef-body">This is the <strong>note</strong>.</span>
      </div>
    `;
    const body = getFootnoteBody(container, "1");
    expect(body).toContain("This is the <strong>note</strong>.");
  });

  it("returns null when no matching definition exists", () => {
    container.innerHTML = `<p>No footnotes here.</p>`;
    expect(getFootnoteBody(container, "1")).toBeNull();
  });

  it("handles special characters in footnote id", () => {
    container.innerHTML = `
      <div class="om-fndef" id="fn-abc" data-om-fndef="abc">
        <span class="om-fndef-label">abc.</span>
        <span class="om-fndef-body">Body text.</span>
      </div>
    `;
    expect(getFootnoteBody(container, "abc")).toBe("Body text.");
  });

  it("falls back to cloning when no om-fndef-body span", () => {
    container.innerHTML = `
      <div class="om-fndef" id="fn-2" data-om-fndef="2">
        <span class="om-fndef-label">2.</span> Fallback body.
      </div>
    `;
    const body = getFootnoteBody(container, "2");
    expect(body).toContain("Fallback body.");
    expect(body).not.toContain("om-fndef-label");
  });
});
