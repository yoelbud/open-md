import { describe, expect, it } from "vitest";
import { crc32, zipStore } from "../src/export/zip";

describe("zip", () => {
  describe("crc32", () => {
    it("returns 0x00000000 for empty input", () => {
      expect(crc32(new Uint8Array(0))).toBe(0x00000000);
    });

    it("returns 0xCBF43926 for '123456789'", () => {
      const data = new TextEncoder().encode("123456789");
      expect(crc32(data)).toBe(0xcbf43926);
    });

    it("returns correct CRC for 'Hello'", () => {
      const data = new TextEncoder().encode("Hello");
      // Known CRC-32 of "Hello" = 0xF7D18982
      expect(crc32(data)).toBe(0xf7d18982);
    });
  });

  describe("zipStore", () => {
    it("produces a valid ZIP with PK signatures", () => {
      const zip = zipStore([{ name: "test.txt", data: new TextEncoder().encode("hello") }]);
      // Local file header starts with PK\x03\x04
      expect(zip[0]).toBe(0x50); // P
      expect(zip[1]).toBe(0x4b); // K
      expect(zip[2]).toBe(0x03);
      expect(zip[3]).toBe(0x04);
    });

    it("contains central directory signature PK\\x01\\x02", () => {
      const zip = zipStore([{ name: "a.txt", data: new Uint8Array([1, 2, 3]) }]);
      const sig = findSignature(zip, [0x50, 0x4b, 0x01, 0x02]);
      expect(sig).toBeGreaterThan(0);
    });

    it("contains end-of-central-directory signature PK\\x05\\x06", () => {
      const zip = zipStore([{ name: "a.txt", data: new Uint8Array([1, 2, 3]) }]);
      const sig = findSignature(zip, [0x50, 0x4b, 0x05, 0x06]);
      expect(sig).toBeGreaterThan(0);
    });

    it("stores correct entry count in EOCD", () => {
      const entries = [
        { name: "one.txt", data: new TextEncoder().encode("1") },
        { name: "two.txt", data: new TextEncoder().encode("2") },
        { name: "three.txt", data: new TextEncoder().encode("3") },
      ];
      const zip = zipStore(entries);
      const eocd = findSignature(zip, [0x50, 0x4b, 0x05, 0x06]);
      const view = new DataView(zip.buffer, zip.byteOffset);
      // Total entries at EOCD+10
      expect(view.getUint16(eocd + 10, true)).toBe(3);
    });

    it("stores file names in local headers", () => {
      const zip = zipStore([{ name: "hello/world.xml", data: new Uint8Array(0) }]);
      const str = new TextDecoder().decode(zip);
      expect(str).toContain("hello/world.xml");
    });

    it("stores correct CRC and sizes for entry data", () => {
      const data = new TextEncoder().encode("test data");
      const expectedCrc = crc32(data);
      const zip = zipStore([{ name: "f.txt", data }]);
      const view = new DataView(zip.buffer, zip.byteOffset);
      // CRC is at offset 14 in local header
      expect(view.getUint32(14, true)).toBe(expectedCrc);
      // Compressed size at offset 18
      expect(view.getUint32(18, true)).toBe(data.length);
      // Uncompressed size at offset 22
      expect(view.getUint32(22, true)).toBe(data.length);
    });

    it("data is stored uncompressed (retrievable)", () => {
      const text = "The quick brown fox";
      const data = new TextEncoder().encode(text);
      const zip = zipStore([{ name: "q.txt", data }]);
      // The data should appear verbatim after the local header
      const str = new TextDecoder().decode(zip);
      expect(str).toContain(text);
    });

    it("handles empty archive", () => {
      const zip = zipStore([]);
      // Should still have EOCD
      const eocd = findSignature(zip, [0x50, 0x4b, 0x05, 0x06]);
      expect(eocd).toBeGreaterThanOrEqual(0);
      const view = new DataView(zip.buffer, zip.byteOffset);
      expect(view.getUint16(eocd + 10, true)).toBe(0);
    });
  });
});

function findSignature(data: Uint8Array, sig: number[]): number {
  for (let i = 0; i <= data.length - sig.length; i++) {
    if (sig.every((b, j) => data[i + j] === b)) return i;
  }
  return -1;
}
