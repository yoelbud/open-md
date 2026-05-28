// Markdown image helpers shared by the parser fallback and preview image UI.

// Inline-image regex with optional title and optional Maruku-style "=WxH"
// size hint. Captures: 1=alt, 2=url, 3=title (no quotes), 4=size token (no "=").
//   ![alt](src)
//   ![alt](src "title")
//   ![alt](src =300x200)         px sizes
//   ![alt](src "title" =50%x)    percent + auto
export const IMAGE_MARKDOWN_RE =
  /!\[([^\]]*)\]\(\s*([^()\s"']+)(?:\s+"([^"]*)")?(?:\s+=([0-9]*%?x[0-9]*%?))?\s*\)/g;

export type ParsedImage = {
  alt: string;
  src: string;
  title: string;
  width: string | null;
  height: string | null;
  align: "left" | "center" | "right" | null;
};

// Parse a CSS dimension out of "300", "300px", "50%", "" (empty/auto).
export const parseImageDimension = (s: string | undefined): string | null => {
  if (!s) return null;
  if (/^\d+%$/.test(s)) return s;
  if (/^\d+$/.test(s)) return `${s}px`;
  return null;
};

// Pull the trailing {.center} / {.left} / {.right} class attr off a string.
// Returns [stripped, align] where align is "left" | "center" | "right" | null.
const stripAlignAttr = (s: string): [string, ParsedImage["align"]] => {
  const m = /\{\s*\.(left|center|right)\s*\}\s*$/.exec(s);
  if (!m) return [s, null];
  return [s.slice(0, m.index).trimEnd(), m[1] as ParsedImage["align"]];
};

// Parse a full image-only block source (without trailing newlines). Returns
// null if the buffer isn't a single image (possibly with a trailing {.align}).
export const parseImageBlock = (raw: string): ParsedImage | null => {
  const [stripped, align] = stripAlignAttr(raw.trim());
  const re = new RegExp(`^${IMAGE_MARKDOWN_RE.source}$`);
  const m = re.exec(stripped);
  if (!m) return null;
  const [w, h] = (m[4] ?? "x").split("x");
  return {
    alt: m[1] ?? "",
    src: m[2] ?? "",
    title: m[3] ?? "",
    width: parseImageDimension(w),
    height: parseImageDimension(h),
    align,
  };
};
