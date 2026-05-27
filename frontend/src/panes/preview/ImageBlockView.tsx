import { createSignal, onCleanup, onMount, Show } from "solid-js";
import type { Block } from "../../ipc/types";
import { parseImageBlock } from "../../ipc/stub";
import {
  formatImageMarkdown,
  pickImageFromFile,
  replaceBlockSource,
} from "../../store/document";
import { resolveAssetSrc } from "../../store/assets";

type Props = {
  block: Block;
  // Called when the user toggles back to "edit the markdown as text".
  onEditSource: () => void;
};

// Presets are pure widths; height stays auto for a natural aspect ratio.
const PRESETS: { label: string; width: string | null }[] = [
  { label: "S", width: "200px" },
  { label: "M", width: "400px" },
  { label: "L", width: "640px" },
  { label: "Full", width: "100%" },
  { label: "Auto", width: null },
];

export const ImageBlockView = (props: Props) => {
  const initial = () => parseImageBlock(props.block.source.trim());

  const [selected, setSelected] = createSignal(false);
  const [dragging, setDragging] = createSignal(false);
  let wrapRef: HTMLDivElement | undefined;
  let imgRef: HTMLImageElement | undefined;

  const commit = (patch: Partial<NonNullable<ReturnType<typeof initial>>>) => {
    const cur = initial();
    if (!cur) return;
    const next = { ...cur, ...patch };
    const trailing = props.block.source.endsWith("\n") ? "\n" : "";
    const md =
      formatImageMarkdown({
        alt: next.alt,
        src: next.src,
        title: next.title,
        width: next.width,
        height: next.height,
        align: next.align,
      }) + trailing;
    replaceBlockSource(props.block, md);
  };

  const dismissOnOutside = (e: MouseEvent) => {
    if (wrapRef && !wrapRef.contains(e.target as Node)) setSelected(false);
  };
  onMount(() => document.addEventListener("mousedown", dismissOnOutside));
  onCleanup(() => document.removeEventListener("mousedown", dismissOnOutside));

  // ── drag-to-resize ──────────────────────────────────────────────────────
  const startResize = (e: MouseEvent) => {
    if (!imgRef) return;
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
    const startX = e.clientX;
    const startW = imgRef.getBoundingClientRect().width;
    const onMove = (ev: MouseEvent) => {
      if (!imgRef) return;
      const w = Math.max(40, Math.round(startW + (ev.clientX - startX)));
      imgRef.style.width = `${w}px`;
      imgRef.style.height = "auto";
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setDragging(false);
      if (!imgRef) return;
      const w = Math.round(imgRef.getBoundingClientRect().width);
      commit({ width: `${w}px`, height: null });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const renderInfo = () => {
    const i = initial();
    if (!i) return "";
    const parts: string[] = [];
    if (i.width) parts.push(`w:${i.width}`);
    if (i.height) parts.push(`h:${i.height}`);
    if (i.align) parts.push(i.align);
    return parts.join(" · ");
  };

  return (
    <div
      ref={wrapRef}
      class="om-img-block"
      classList={{
        selected: selected(),
        dragging: dragging(),
        [`align-${initial()?.align}`]: !!initial()?.align,
      }}
      onClick={(e) => {
        e.stopPropagation();
        setSelected(true);
      }}
    >
      <Show
        when={initial()}
        fallback={
          <div class="om-img-broken" onClick={props.onEditSource}>
            ⚠ image markdown — click to edit
          </div>
        }
      >
        {(img) => (
          <div class="om-img-inner">
            <img
              ref={imgRef}
              src={resolveAssetSrc(img().src)}
              alt={img().alt}
              title={img().title || undefined}
              style={{
                width: img().width ?? undefined,
                height: img().height ?? undefined,
                "max-width": img().width || img().height ? undefined : "100%",
              }}
              draggable={false}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).classList.add("broken");
              }}
            />
            <Show when={selected()}>
              <div class="om-img-handle" onMouseDown={startResize} title="Drag to resize" />
            </Show>
          </div>
        )}
      </Show>

      <Show when={selected() && initial()}>
        <div class="om-img-toolbar" onMouseDown={(e) => e.stopPropagation()}>
          <div class="om-img-toolbar-row">
            <span class="om-img-label">Size</span>
            {PRESETS.map((p) => (
              <button
                class="om-img-btn"
                title={p.label === "Auto" ? "Original size" : `${p.label} (${p.width})`}
                onClick={() => commit({ width: p.width, height: null })}
              >
                {p.label}
              </button>
            ))}
            <input
              class="om-img-num"
              type="text"
              placeholder="e.g. 300 or 50%"
              value={initial()?.width ?? ""}
              onChange={(e) => {
                const v = e.currentTarget.value.trim();
                commit({ width: v || null, height: null });
              }}
            />
          </div>
          <div class="om-img-toolbar-row">
            <span class="om-img-label">Align</span>
            {(["left", "center", "right"] as const).map((a) => (
              <button
                class="om-img-btn"
                classList={{ active: initial()?.align === a }}
                onClick={() =>
                  commit({ align: initial()?.align === a ? null : a })
                }
              >
                {a[0]!.toUpperCase()}
              </button>
            ))}
            <button
              class="om-img-btn"
              title="Edit alt text"
              onClick={() => {
                const cur = initial();
                if (!cur) return;
                const v = prompt("Alt text:", cur.alt);
                if (v !== null) commit({ alt: v });
              }}
            >
              Alt
            </button>
            <button
              class="om-img-btn"
              title="Replace with another image…"
              onClick={async () => {
                const snip = await pickImageFromFile();
                if (!snip) return;
                const parsed = parseImageBlock(snip);
                if (parsed) commit({ src: parsed.src, alt: parsed.alt });
              }}
            >
              Replace
            </button>
            <button
              class="om-img-btn"
              title="Edit raw markdown"
              onClick={props.onEditSource}
            >
              MD
            </button>
            <span class="om-img-info">{renderInfo()}</span>
          </div>
        </div>
      </Show>
    </div>
  );
};
