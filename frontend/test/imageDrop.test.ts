import { describe, it, expect } from "vitest";
import {
  isImageMime,
  hintNameFromFile,
  buildImageSnippet,
} from "../src/store/imageDrop";

describe("isImageMime", () => {
  it("accepts common image types", () => {
    expect(isImageMime("image/png")).toBe(true);
    expect(isImageMime("image/jpeg")).toBe(true);
    expect(isImageMime("image/jpg")).toBe(true);
    expect(isImageMime("image/gif")).toBe(true);
    expect(isImageMime("image/webp")).toBe(true);
    expect(isImageMime("image/svg+xml")).toBe(true);
    expect(isImageMime("image/bmp")).toBe(true);
    expect(isImageMime("image/tiff")).toBe(true);
  });

  it("rejects non-image types", () => {
    expect(isImageMime("text/plain")).toBe(false);
    expect(isImageMime("application/pdf")).toBe(false);
    expect(isImageMime("video/mp4")).toBe(false);
    expect(isImageMime("")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isImageMime("image/PNG")).toBe(true);
    expect(isImageMime("IMAGE/JPEG")).toBe(true);
  });
});

describe("hintNameFromFile", () => {
  it("uses the file name when meaningful", () => {
    const file = new File([], "holiday.png", { type: "image/png" });
    expect(hintNameFromFile(file)).toBe("holiday.png");
  });

  it("generates a timestamp name for generic pasted images", () => {
    const file = new File([], "image.png", { type: "image/png" });
    const hint = hintNameFromFile(file);
    expect(hint).toMatch(/^pasted-\d+$/);
  });

  it("uses the file name even if unusual", () => {
    const file = new File([], "screenshot-2024.webp", { type: "image/webp" });
    expect(hintNameFromFile(file)).toBe("screenshot-2024.webp");
  });
});

describe("buildImageSnippet", () => {
  it("builds standard markdown image syntax", () => {
    const result = buildImageSnippet("assets/cat-abcdef01.png", "my cat");
    expect(result).toBe("![my cat](assets/cat-abcdef01.png)");
  });

  it("handles empty alt text", () => {
    const result = buildImageSnippet("assets/x-12345678.jpg", "");
    expect(result).toBe("![](assets/x-12345678.jpg)");
  });

  it("does not include data URLs in the snippet", () => {
    const result = buildImageSnippet("assets/photo-aabbccdd.png", "photo");
    expect(result).not.toContain("data:");
    expect(result).not.toContain("base64");
  });
});
