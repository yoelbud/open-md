import type { Annotations, Block, DocumentPayload } from "./types";
import { parseDocument as parseDocumentStub } from "./stub";
import { parseMarkdownTable } from "../markdown/table";
import { resolveAssetSrc } from "../store/assets";

const UNTITLED_PATH = "(untitled).md";

type ParseDocument = (
  source: string,
  path?: string,
  annotations?: Annotations,
) => DocumentPayload;

let parseImpl: ParseDocument = parseDocumentStub;
let runtimeName = "typescript-stub";

const isNumberPair = (value: unknown): value is [number, number] =>
  Array.isArray(value) &&
  value.length === 2 &&
  typeof value[0] === "number" &&
  typeof value[1] === "number";

const isBlock = (value: unknown): value is Block => {
  if (!value || typeof value !== "object") return false;
  const block = value as Partial<Block>;
  return (
    typeof block.id === "string" &&
    typeof block.kind === "string" &&
    isNumberPair(block.src_range) &&
    typeof block.hash === "number" &&
    typeof block.source === "string" &&
    typeof block.html === "string" &&
    typeof block.plain_html === "string"
  );
};

const isDocumentPayload = (value: unknown): value is DocumentPayload => {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<DocumentPayload>;
  return (
    typeof payload.path === "string" &&
    Array.isArray(payload.blocks) &&
    payload.blocks.every(isBlock)
  );
};

const decodeDocumentPayload = (json: string): DocumentPayload => {
  const payload: unknown = JSON.parse(json);
  if (!isDocumentPayload(payload)) {
    throw new Error("WASM engine returned an invalid document payload");
  }
  return payload;
};

const escapeAttr = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const attrValue = (tag: string, name: string): string | null => {
  const match = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return match ? match[1]!.replace(/&quot;/g, "\"").replace(/&amp;/g, "&") : null;
};

const setAttr = (tag: string, name: string, value: string): string => {
  const escaped = escapeAttr(value);
  const attrPattern = new RegExp(`(\\s${name}=")[^"]*(")`);
  if (attrPattern.test(tag)) {
    return tag.replace(attrPattern, (_m, prefix: string, suffix: string) => `${prefix}${escaped}${suffix}`);
  }
  return tag.replace(/\/?>$/, ` ${name}="${escaped}"/>`);
};

const resolveRenderedImageSources = (html: string): string =>
  html.replace(/<img\b[^>]*>/gi, (tag) => {
    const markdownSrc = attrValue(tag, "data-om-src") ?? attrValue(tag, "src");
    if (!markdownSrc) return tag;
    let next = setAttr(tag, "src", resolveAssetSrc(markdownSrc));
    if (!attrValue(next, "data-om-src")) {
      next = setAttr(next, "data-om-src", markdownSrc);
    }
    return next;
  });

const enrichBlock = (block: Block): Block => {
  const html = resolveRenderedImageSources(block.html);
  const plainHtml = resolveRenderedImageSources(block.plain_html);
  const table = block.kind === "table" && !block.preview?.table
    ? parseMarkdownTable(block.source)
    : null;
  if (html === block.html && plainHtml === block.plain_html && !table) return block;

  const preview = table
    ? { ...(block.preview ?? {}), table }
    : block.preview;
  return {
    ...block,
    html,
    plain_html: plainHtml,
    ...(preview ? { preview } : {}),
  };
};

const normalizeDocumentPayload = (payload: DocumentPayload): DocumentPayload => ({
  ...payload,
  blocks: payload.blocks.map(enrichBlock),
});

const EMPTY_ANNOTATIONS: Annotations = { blocks: [] };

export const initMarkdownEngine = async (): Promise<void> => {
  try {
    const wasm = await import(/* @vite-ignore */ "../wasm/om_wasm.js");
    await wasm.default();
    parseImpl = (source: string, path = UNTITLED_PATH, annotations?: Annotations) =>
      decodeDocumentPayload(
        wasm.render_project_json(
          source,
          path,
          JSON.stringify(annotations ?? EMPTY_ANNOTATIONS),
        ) as string,
      );
    runtimeName = "wasm";
  } catch {
    console.warn("[open-md] WASM engine unavailable, using TypeScript stub");
  }
};

export const markdownEngineRuntime = () => runtimeName;

export const parseDocument = (
  source: string,
  path = UNTITLED_PATH,
  annotations?: Annotations,
): DocumentPayload => normalizeDocumentPayload(parseImpl(source, path, annotations));
