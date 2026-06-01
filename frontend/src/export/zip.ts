// Minimal store-only (uncompressed) ZIP writer — pure TypeScript, zero deps.
// Produces a valid ZIP archive with method 0 (stored) entries, correct CRC-32,
// local file headers, central directory, and end-of-central-directory record.

/**
 * Compute CRC-32 using the standard polynomial 0xEDB88320 (reflected).
 */
const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
    table[i] = c;
  }
  return table;
})();

export const crc32 = (data: Uint8Array): number => {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ (CRC_TABLE[(crc ^ data[i]!) & 0xff]!);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/**
 * Build a store-only ZIP archive from the given entries.
 * All entries use compression method 0 (stored).
 */
export const zipStore = (entries: ZipEntry[]): Uint8Array => {
  const encoder = new TextEncoder();

  // Pre-compute sizes
  interface PreparedEntry {
    nameBytes: Uint8Array;
    data: Uint8Array;
    crc: number;
    localOffset: number;
  }

  const prepared: PreparedEntry[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const crcVal = crc32(entry.data);
    prepared.push({ nameBytes, data: entry.data, crc: crcVal, localOffset: offset });
    // Local file header: 30 bytes + name length + data length
    offset += 30 + nameBytes.length + entry.data.length;
  }

  // Central directory size
  let centralSize = 0;
  for (const p of prepared) {
    centralSize += 46 + p.nameBytes.length;
  }

  // Total: local headers + data + central directory + EOCD (22 bytes)
  const totalSize = offset + centralSize + 22;
  const buf = new Uint8Array(totalSize);
  const view = new DataView(buf.buffer);

  let pos = 0;

  // Write local file headers + data
  for (const p of prepared) {
    // Local file header signature
    view.setUint32(pos, 0x04034b50, true); pos += 4;
    // Version needed (2.0)
    view.setUint16(pos, 20, true); pos += 2;
    // General purpose bit flag
    view.setUint16(pos, 0, true); pos += 2;
    // Compression method (0 = stored)
    view.setUint16(pos, 0, true); pos += 2;
    // Last mod time / date (zero — not significant)
    view.setUint16(pos, 0, true); pos += 2;
    view.setUint16(pos, 0, true); pos += 2;
    // CRC-32
    view.setUint32(pos, p.crc, true); pos += 4;
    // Compressed size (same as uncompressed for stored)
    view.setUint32(pos, p.data.length, true); pos += 4;
    // Uncompressed size
    view.setUint32(pos, p.data.length, true); pos += 4;
    // File name length
    view.setUint16(pos, p.nameBytes.length, true); pos += 2;
    // Extra field length
    view.setUint16(pos, 0, true); pos += 2;
    // File name
    buf.set(p.nameBytes, pos); pos += p.nameBytes.length;
    // File data
    buf.set(p.data, pos); pos += p.data.length;
  }

  // Write central directory
  const centralStart = pos;
  for (const p of prepared) {
    // Central directory header signature
    view.setUint32(pos, 0x02014b50, true); pos += 4;
    // Version made by (2.0)
    view.setUint16(pos, 20, true); pos += 2;
    // Version needed (2.0)
    view.setUint16(pos, 20, true); pos += 2;
    // General purpose bit flag
    view.setUint16(pos, 0, true); pos += 2;
    // Compression method
    view.setUint16(pos, 0, true); pos += 2;
    // Last mod time / date
    view.setUint16(pos, 0, true); pos += 2;
    view.setUint16(pos, 0, true); pos += 2;
    // CRC-32
    view.setUint32(pos, p.crc, true); pos += 4;
    // Compressed size
    view.setUint32(pos, p.data.length, true); pos += 4;
    // Uncompressed size
    view.setUint32(pos, p.data.length, true); pos += 4;
    // File name length
    view.setUint16(pos, p.nameBytes.length, true); pos += 2;
    // Extra field length
    view.setUint16(pos, 0, true); pos += 2;
    // File comment length
    view.setUint16(pos, 0, true); pos += 2;
    // Disk number start
    view.setUint16(pos, 0, true); pos += 2;
    // Internal file attributes
    view.setUint16(pos, 0, true); pos += 2;
    // External file attributes
    view.setUint32(pos, 0, true); pos += 4;
    // Relative offset of local header
    view.setUint32(pos, p.localOffset, true); pos += 4;
    // File name
    buf.set(p.nameBytes, pos); pos += p.nameBytes.length;
  }

  // End of central directory record
  view.setUint32(pos, 0x06054b50, true); pos += 4;
  // Disk number
  view.setUint16(pos, 0, true); pos += 2;
  // Disk where central directory starts
  view.setUint16(pos, 0, true); pos += 2;
  // Number of central directory records on this disk
  view.setUint16(pos, entries.length, true); pos += 2;
  // Total number of central directory records
  view.setUint16(pos, entries.length, true); pos += 2;
  // Size of central directory
  view.setUint32(pos, centralSize, true); pos += 4;
  // Offset of start of central directory
  view.setUint32(pos, centralStart, true); pos += 4;
  // Comment length
  view.setUint16(pos, 0, true); pos += 2;

  return buf;
};
