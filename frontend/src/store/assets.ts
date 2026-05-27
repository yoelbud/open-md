// In-memory asset store.
//
// Local images (file picker, paste, drag-drop) are kept as Blobs here, keyed
// by a short readable path like "assets/photo-ab12cd34.png". That path is
// what we write into the Markdown source — so the document stays small and
// readable instead of being polluted with megabyte-long data: URLs.
//
// At render time, paths under `assets/` are resolved to blob: URLs through
// `resolveAssetSrc()`. When Tauri is wired up in M1, the same paths will be
// flushed to disk next to the .md file and the resolver will fall through.

type Entry = { blob: Blob; url: string };

const assets = new Map<string, Entry>();
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((fn) => fn());

export const onAssetsChange = (fn: () => void) => {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
};

// Best-effort extension from MIME or filename hint.
const extFromMime = (mime: string): string => {
  const m = /^image\/([a-z0-9.+-]+)$/i.exec(mime);
  if (!m) return "bin";
  const sub = m[1]!.toLowerCase();
  if (sub === "jpeg") return "jpg";
  if (sub === "svg+xml") return "svg";
  return sub;
};

const sanitizeStem = (name: string): string => {
  const stem = name.replace(/\.[^.]+$/, "");
  const clean = stem
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
  return clean || "image";
};

// 32-bit FNV-1a over a Uint8Array — plenty for de-duping pasted images.
const hashBytes = (bytes: Uint8Array): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 0).toString(16).padStart(8, "0");
};

const readBlobBytes = async (blob: Blob): Promise<Uint8Array> => {
  if (typeof (blob as any).arrayBuffer === "function") {
    return new Uint8Array(await (blob as any).arrayBuffer());
  }
  // Fallback for environments where Blob lacks .arrayBuffer() (e.g. jsdom).
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
};

const makeObjectUrl = (blob: Blob): string => {
  if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
    return URL.createObjectURL(blob);
  }
  // jsdom test environment: synthesize a stable, recognisable placeholder.
  return `blob:om-mem/${Math.random().toString(36).slice(2)}`;
};

const revokeObjectUrl = (url: string) => {
  if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
    URL.revokeObjectURL(url);
  }
};

// Store a blob and return its asset path. Idempotent: same bytes → same path.
export const storeAsset = async (
  blob: Blob,
  hintName = "image",
): Promise<string> => {
  const buf = await readBlobBytes(blob);
  const stem = sanitizeStem(hintName);
  const ext = extFromMime(blob.type || "image/png");
  const path = `assets/${stem}-${hashBytes(buf)}.${ext}`;
  if (!assets.has(path)) {
    const url = makeObjectUrl(blob);
    assets.set(path, { blob, url });
    notify();
  }
  return path;
};

// Resolve a markdown image src to something the browser can actually load.
// Returns the original src for absolute URLs, data:/blob:/file: URLs, and
// unknown paths. Asset paths we recognise are mapped to their blob: URL.
export const resolveAssetSrc = (src: string): string => {
  if (!src) return src;
  if (/^(data:|https?:|file:|blob:)/i.test(src)) return src;
  const hit = assets.get(src);
  return hit ? hit.url : src;
};

export const isAssetPath = (src: string): boolean => assets.has(src);

export const listAssets = (): string[] => Array.from(assets.keys()).sort();

// Used by tests so a clean slate is possible.
export const __clearAssets = () => {
  for (const e of assets.values()) revokeObjectUrl(e.url);
  assets.clear();
  notify();
};
