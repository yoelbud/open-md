// Pure DOCX (OOXML) document builder — zero dependencies.
// Produces a valid .docx file from open-md blocks.
//
// v1 Limitations:
// - Images/math/mermaid: placeholder paragraph with alt text / raw content.
// - Lists use bullet glyph (•) / number prefix + indent (no numbering.xml).
// - Hyperlinks rendered as styled plain text (no clickable field).
// - Front matter: title used as document Title style; raw fence skipped.

import type { Block, BlockKind, MarkdownTable } from "../ipc/types";
import { zipStore, type ZipEntry } from "./zip";

// ─── XML Escaping ────────────────────────────────────────────────────────────

const escapeXml = (s: string): string =>
  s.replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// ─── Inline Markdown Tokenizer ───────────────────────────────────────────────

export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  strike?: boolean;
}

/**
 * Tokenize inline Markdown into runs with formatting.
 * Handles: **bold**, *italic*, `code`, ~~strike~~, and nesting (bold+italic).
 */
export const tokenizeInline = (src: string): Run[] => {
  const runs: Run[] = [];
  let i = 0;

  const pushRun = (text: string, bold: boolean, italic: boolean, code: boolean, strike: boolean) => {
    if (text) runs.push({ text, ...(bold && { bold }), ...(italic && { italic }), ...(code && { code }), ...(strike && { strike }) });
  };

  while (i < src.length) {
    // Inline code (backtick)
    if (src[i] === "`") {
      const end = src.indexOf("`", i + 1);
      if (end !== -1) {
        pushRun(src.slice(i + 1, end), false, false, true, false);
        i = end + 1;
        continue;
      }
    }

    // Strikethrough ~~
    if (src[i] === "~" && src[i + 1] === "~") {
      const end = src.indexOf("~~", i + 2);
      if (end !== -1) {
        const inner = tokenizeInline(src.slice(i + 2, end));
        for (const r of inner) runs.push({ ...r, strike: true });
        i = end + 2;
        continue;
      }
    }

    // Bold+Italic *** or ___
    if ((src[i] === "*" || src[i] === "_") && src[i + 1] === src[i] && src[i + 2] === src[i]) {
      const ch = src[i]!;
      const closing = ch + ch + ch;
      const end = src.indexOf(closing, i + 3);
      if (end !== -1) {
        const inner = tokenizeInline(src.slice(i + 3, end));
        for (const r of inner) runs.push({ ...r, bold: true, italic: true });
        i = end + 3;
        continue;
      }
    }

    // Bold ** or __
    if ((src[i] === "*" || src[i] === "_") && src[i + 1] === src[i]) {
      const ch = src[i]!;
      const closing = ch + ch;
      const end = findClosing(src, closing, i + 2);
      if (end !== -1) {
        const inner = tokenizeInline(src.slice(i + 2, end));
        for (const r of inner) runs.push({ ...r, bold: true });
        i = end + 2;
        continue;
      }
    }

    // Italic * or _
    if (src[i] === "*" || src[i] === "_") {
      const ch = src[i]!;
      const end = findClosingSingle(src, ch, i + 1);
      if (end !== -1) {
        const inner = tokenizeInline(src.slice(i + 1, end));
        for (const r of inner) runs.push({ ...r, italic: true });
        i = end + 1;
        continue;
      }
    }

    // Plain text — consume until next special char
    let j = i + 1;
    while (j < src.length && !"*_`~".includes(src[j]!)) j++;
    pushRun(src.slice(i, j), false, false, false, false);
    i = j;
  }

  return runs;
};

/** Find closing delimiter that isn't preceded by the same char (for ** / __). */
const findClosing = (src: string, delim: string, start: number): number => {
  let idx = start;
  while (idx < src.length) {
    const pos = src.indexOf(delim, idx);
    if (pos === -1) return -1;
    // Don't match *** as a ** close at pos where pos+2 is also the delimiter char
    if (src[pos + delim.length] === delim[0]) { idx = pos + 1; continue; }
    return pos;
  }
  return -1;
};

const findClosingSingle = (src: string, ch: string, start: number): number => {
  let idx = start;
  while (idx < src.length) {
    const pos = src.indexOf(ch, idx);
    if (pos === -1) return -1;
    // Don't match ** or __ (double) as a single close
    if (src[pos + 1] === ch) { idx = pos + 2; continue; }
    // Don't match if preceded by the same char (inside a double)
    if (pos > start && src[pos - 1] === ch) { idx = pos + 1; continue; }
    return pos;
  }
  return -1;
};

// ─── Run → OOXML ────────────────────────────────────────────────────────────

const runToXml = (run: Run): string => {
  const rPrParts: string[] = [];
  if (run.bold) rPrParts.push("<w:b/>");
  if (run.italic) rPrParts.push("<w:i/>");
  if (run.strike) rPrParts.push("<w:strike/>");
  if (run.code) rPrParts.push('<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/>');
  const rPr = rPrParts.length ? `<w:rPr>${rPrParts.join("")}</w:rPr>` : "";
  return `<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(run.text)}</w:t></w:r>`;
};

const runsToXml = (runs: Run[]): string => runs.map(runToXml).join("");

const inlineToXml = (text: string): string => runsToXml(tokenizeInline(text));

// ─── Paragraph helpers ───────────────────────────────────────────────────────

const paragraph = (content: string, style?: string, extraPPr?: string): string => {
  const pPrParts: string[] = [];
  if (style) pPrParts.push(`<w:pStyle w:val="${style}"/>`);
  if (extraPPr) pPrParts.push(extraPPr);
  const pPr = pPrParts.length ? `<w:pPr>${pPrParts.join("")}</w:pPr>` : "";
  return `<w:p>${pPr}${content}</w:p>`;
};

const textParagraph = (text: string, style?: string, extraPPr?: string): string =>
  paragraph(inlineToXml(text), style, extraPPr);

// ─── Block → OOXML paragraphs ───────────────────────────────────────────────

const headingLevel = (source: string): number => {
  const match = source.match(/^(#{1,6})\s/);
  return match ? match[1]!.length : 1;
};

const headingText = (source: string): string =>
  source.replace(/^#{1,6}\s+/, "").trim();

const codeBlockContent = (source: string): string => {
  const lines = source.split("\n");
  // Remove opening/closing fences
  const start = lines.findIndex((l) => l.trimStart().startsWith("```") || l.trimStart().startsWith("~~~"));
  const end = lines.length - 1 - [...lines].reverse().findIndex((l) => l.trimStart().startsWith("```") || l.trimStart().startsWith("~~~"));
  if (start >= 0 && end > start) return lines.slice(start + 1, end).join("\n");
  return source;
};

const blockQuoteText = (source: string): string =>
  source.split("\n").map((l) => l.replace(/^>\s?/, "")).join("\n");

const buildListParagraphs = (source: string): string => {
  const lines = source.split("\n");
  const paras: string[] = [];
  for (const line of lines) {
    const bullet = line.match(/^(\s*)[-*+]\s+(.*)/);
    const ordered = line.match(/^(\s*)\d+[.)]\s+(.*)/);
    if (bullet) {
      const indent = Math.floor(bullet[1]!.length / 2);
      const indXml = indent > 0 ? `<w:ind w:left="${720 * (indent + 1)}"/>` : `<w:ind w:left="720"/>`;
      const prefix = runsToXml([{ text: "\u2022 " }]);
      paras.push(paragraph(prefix + inlineToXml(bullet[2]!), "ListBullet", indXml));
    } else if (ordered) {
      const indent = Math.floor(ordered[1]!.length / 2);
      const indXml = indent > 0 ? `<w:ind w:left="${720 * (indent + 1)}"/>` : `<w:ind w:left="720"/>`;
      const numMatch = line.match(/^(\s*)(\d+)[.)]/);
      const num = numMatch ? numMatch[2]! : "1";
      const prefix = runsToXml([{ text: `${num}. ` }]);
      paras.push(paragraph(prefix + inlineToXml(ordered[2]!), "ListNumber", indXml));
    } else if (line.trim()) {
      // Continuation line
      paras.push(textParagraph(line.trim(), "Normal", '<w:ind w:left="720"/>'));
    }
  }
  return paras.join("");
};

const buildTaskListParagraphs = (source: string): string => {
  const lines = source.split("\n");
  const paras: string[] = [];
  for (const line of lines) {
    const match = line.match(/^[-*+]\s+\[([ xX])\]\s+(.*)/);
    if (match) {
      const checked = match[1] !== " ";
      const prefix = checked ? "\u2611 " : "\u2610 ";
      paras.push(paragraph(
        runsToXml([{ text: prefix }]) + inlineToXml(match[2]!),
        "ListBullet",
        '<w:ind w:left="720"/>',
      ));
    } else if (line.trim()) {
      paras.push(textParagraph(line.trim()));
    }
  }
  return paras.join("");
};

const buildTableXml = (table: MarkdownTable): string => {
  const cellXml = (text: string): string =>
    `<w:tc><w:p>${inlineToXml(text)}</w:p></w:tc>`;

  const rowXml = (cells: string[]): string =>
    `<w:tr>${cells.map(cellXml).join("")}</w:tr>`;

  const headerRow = rowXml(table.headers);
  const bodyRows = table.rows.map(rowXml).join("");

  return `<w:tbl><w:tblPr><w:tblBorders>` +
    `<w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/>` +
    `<w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/>` +
    `<w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>` +
    `<w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/>` +
    `<w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/>` +
    `<w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>` +
    `</w:tblBorders></w:tblPr>${headerRow}${bodyRows}</w:tbl>`;
};

const parseTableFromSource = (source: string): MarkdownTable | null => {
  const lines = source.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return null;

  const splitRow = (line: string): string[] => {
    const trimmed = line.replace(/^\|/, "").replace(/\|$/, "");
    return trimmed.split("|").map((c) => c.trim());
  };

  const headers = splitRow(lines[0]!);
  // line[1] is the separator
  const rows = lines.slice(2).map(splitRow);
  const alignments = headers.map(() => "default" as const);
  return { headers, alignments, rows };
};

const blockToXml = (block: Block): string => {
  const kind: BlockKind = block.kind;
  const source = block.source;

  switch (kind) {
    case "heading": {
      const level = headingLevel(source);
      const text = headingText(source);
      return textParagraph(text, `Heading${level}`);
    }
    case "paragraph":
      return textParagraph(source);
    case "list":
      return buildListParagraphs(source);
    case "task_list":
      return buildTaskListParagraphs(source);
    case "code": {
      const code = codeBlockContent(source);
      const lines = code.split("\n");
      return lines.map((line) => paragraph(
        runsToXml([{ text: line || " ", code: true }]),
        "Code",
      )).join("");
    }
    case "block_quote":
    case "callout": {
      const text = blockQuoteText(source);
      const lines = text.split("\n").filter((l) => l.trim());
      return lines.map((l) => textParagraph(l, "Quote")).join("");
    }
    case "table": {
      const table = block.preview?.table ?? parseTableFromSource(source);
      if (table) return buildTableXml(table);
      return textParagraph(source);
    }
    case "thematic_break":
      return paragraph("", "Normal",
        '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="auto"/></w:pBdr>');
    case "front_matter": {
      // Extract title from YAML-like front matter
      const titleMatch = source.match(/title:\s*(.+)/i);
      if (titleMatch) return textParagraph(titleMatch[1]!.trim(), "Title");
      return ""; // Skip raw fence
    }
    case "image": {
      const alt = source.match(/!\[([^\]]*)\]/)?.[1] || "image";
      return textParagraph(`[Image: ${alt}]`, "Normal");
    }
    case "math":
      return textParagraph(`[Math: ${source.replace(/^\$\$\n?|\n?\$\$$/g, "").slice(0, 80)}…]`, "Normal");
    case "html":
      return textParagraph(source, "Normal");
    case "unknown":
    default:
      return textParagraph(source);
  }
};

// ─── OOXML Parts ─────────────────────────────────────────────────────────────

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:rPr><w:sz w:val="24"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/>
    <w:basedOn w:val="Normal"/>
    <w:rPr><w:b/><w:sz w:val="56"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="48"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="200" w:after="100"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="36"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="160" w:after="80"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="30"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading4">
    <w:name w:val="heading 4"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="120" w:after="60"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="26"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading5">
    <w:name w:val="heading 5"/>
    <w:basedOn w:val="Normal"/>
    <w:rPr><w:b/><w:sz w:val="24"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading6">
    <w:name w:val="heading 6"/>
    <w:basedOn w:val="Normal"/>
    <w:rPr><w:b/><w:i/><w:sz w:val="24"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Code">
    <w:name w:val="Code"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/><w:sz w:val="20"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Quote">
    <w:name w:val="Quote"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:ind w:left="720"/><w:pBdr><w:left w:val="single" w:sz="12" w:space="4" w:color="AAAAAA"/></w:pBdr></w:pPr>
    <w:rPr><w:i/><w:color w:val="555555"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="ListBullet">
    <w:name w:val="List Bullet"/>
    <w:basedOn w:val="Normal"/>
  </w:style>
  <w:style w:type="paragraph" w:styleId="ListNumber">
    <w:name w:val="List Number"/>
    <w:basedOn w:val="Normal"/>
  </w:style>
</w:styles>`;

// ─── Public API ──────────────────────────────────────────────────────────────

export interface DocxOptions {
  title?: string;
}

/**
 * Build a .docx file (Uint8Array) from the given blocks.
 */
export const buildDocx = (blocks: Block[], opts?: DocxOptions): Uint8Array => {
  const title = opts?.title || "Document";
  const bodyParagraphs = blocks.map(blockToXml).join("");

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${bodyParagraphs}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const encoder = new TextEncoder();
  const entries: ZipEntry[] = [
    { name: "[Content_Types].xml", data: encoder.encode(CONTENT_TYPES) },
    { name: "_rels/.rels", data: encoder.encode(RELS) },
    { name: "word/document.xml", data: encoder.encode(documentXml) },
    { name: "word/_rels/document.xml.rels", data: encoder.encode(DOC_RELS) },
    { name: "word/styles.xml", data: encoder.encode(STYLES) },
  ];

  // Suppress unused variable warning — title is used as document metadata context
  void title;

  return zipStore(entries);
};
