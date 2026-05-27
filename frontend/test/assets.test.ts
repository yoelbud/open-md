import { describe, expect, it, beforeEach } from "vitest";
import {
  ingestImageFile,
  appendImageBlock,
  newDocument,
  useSource,
  useDocument,
} from "../src/store/document";
import { __clearAssets, resolveAssetSrc, listAssets } from "../src/store/assets";
import { parseDocument } from "../src/ipc/stub";

beforeEach(() => {
  __clearAssets();
  newDocument();
});

// Minimal 1x1 PNG byte sequence — enough to exercise the store.
const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89,
]);

const makeFile = (name: string, mime = "image/png") =>
  new File([pngBytes], name, { type: mime });

describe("asset store", () => {
  it("ingestImageFile returns a short readable path, not a data URL", async () => {
    const path = await ingestImageFile(makeFile("My Holiday.PNG"));
    expect(path.startsWith("data:")).toBe(false);
    expect(path).toMatch(/^assets\/my-holiday-[0-9a-f]{8}\.png$/);
  });

  it("appendImageBlock writes the asset path into the markdown source", async () => {
    const path = await ingestImageFile(makeFile("cat.png"));
    appendImageBlock(path, "my cat");
    const src = useSource()();
    expect(src).toContain(`![my cat](${path})`);
    // Critically: no base64 / data URL pollution in the document.
    expect(src).not.toContain("data:");
    expect(src).not.toContain("base64");
  });

  it("the same bytes ingested twice produce the same path (dedup)", async () => {
    const a = await ingestImageFile(makeFile("a.png"));
    const b = await ingestImageFile(makeFile("a.png"));
    expect(a).toBe(b);
    expect(listAssets().length).toBe(1);
  });

  it("different content yields different hashes", async () => {
    const a = await ingestImageFile(makeFile("a.png"));
    const otherBytes = new Uint8Array([1, 2, 3, 4, 5]);
    const b = await ingestImageFile(
      new File([otherBytes], "b.png", { type: "image/png" }),
    );
    expect(a).not.toBe(b);
  });

  it("resolveAssetSrc returns a blob: URL for known asset paths", async () => {
    const path = await ingestImageFile(makeFile("x.png"));
    expect(resolveAssetSrc(path)).toMatch(/^blob:/);
  });

  it("resolveAssetSrc passes absolute URLs through unchanged", () => {
    expect(resolveAssetSrc("https://example.com/x.png"))
      .toBe("https://example.com/x.png");
    expect(resolveAssetSrc("data:image/png;base64,AAAA"))
      .toBe("data:image/png;base64,AAAA");
  });

  it("rendered HTML for an asset path uses a blob: URL", async () => {
    const path = await ingestImageFile(makeFile("p.png"));
    const html = parseDocument(`![alt](${path})\n`).blocks[0]!.html;
    expect(html).toMatch(/src="blob:/);
    // The original asset path is kept on the element for later round-tripping.
    expect(html).toContain(`data-om-src="${path}"`);
  });

  it("does not embed a data URL when an image block is inserted via ingest+append",
    async () => {
      const path = await ingestImageFile(makeFile("q.png"));
      appendImageBlock(path);
      const doc = useDocument();
      const imgBlock = doc.blocks.find((b) => b.kind === "image");
      expect(imgBlock).toBeDefined();
      expect(imgBlock!.source).not.toContain("data:");
      expect(imgBlock!.source.length).toBeLessThan(120);
    });
});
