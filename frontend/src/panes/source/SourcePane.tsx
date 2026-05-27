import { createMemo, createSignal, onCleanup, onMount, Show } from "solid-js";
import type { JSX } from "solid-js";
import {
  clearEditingPoint,
  setEditingPoint,
  useEditingPoint,
  useSetSource,
  useSource,
} from "../../store/document";

type PaneProps = {
  layoutControls?: JSX.Element;
};

type SourceMetrics = {
  lineHeight: number;
  paddingTop: number;
};

const DEFAULT_SOURCE_METRICS: SourceMetrics = {
  lineHeight: 19.5,
  paddingTop: 14,
};

export const SourcePane = (props: PaneProps) => {
  const source = useSource();
  const setSource = useSetSource();
  const editingPoint = useEditingPoint();
  const [scrollTop, setScrollTop] = createSignal(0);
  const [metrics, setMetrics] = createSignal<SourceMetrics>(DEFAULT_SOURCE_METRICS);
  let ta: HTMLTextAreaElement | undefined;

  const updateMetrics = () => {
    if (!ta) return;
    const style = window.getComputedStyle(ta);
    const fontSize = Number.parseFloat(style.fontSize);
    const lineHeight = Number.parseFloat(style.lineHeight);
    const paddingTop = Number.parseFloat(style.paddingTop);
    setMetrics({
      lineHeight: Number.isFinite(lineHeight)
        ? lineHeight
        : (Number.isFinite(fontSize) ? fontSize : 13) * 1.5,
      paddingTop: Number.isFinite(paddingTop)
        ? paddingTop
        : DEFAULT_SOURCE_METRICS.paddingTop,
    });
  };

  const markEditingPoint = (target = ta) => {
    if (!target) return;
    setEditingPoint({
      pane: "source",
      sourceOffset: target.selectionStart,
    });
  };

  const markerLine = createMemo(() => {
    const point = editingPoint();
    if (!point || point.pane === "source") return null;
    const offset = Math.min(point.sourceOffset, source().length);
    return source().slice(0, offset).split("\n").length - 1;
  });

  const markerStyle = (): JSX.CSSProperties => {
    const line = markerLine();
    if (line === null) return {};
    const currentMetrics = metrics();
    return {
      height: `${currentMetrics.lineHeight}px`,
      transform: `translateY(${
        currentMetrics.paddingTop + line * currentMetrics.lineHeight - scrollTop()
      }px)`,
    };
  };

  onMount(() => {
    updateMetrics();
    window.addEventListener("resize", updateMetrics);
    onCleanup(() => window.removeEventListener("resize", updateMetrics));
  });

  return (
    <div class="pane">
      <div class="pane-header">
        <span>Source</span>
        <span class="header-actions">{props.layoutControls}</span>
      </div>
      <div class="pane-body source-editor">
        <Show when={markerLine() !== null}>
          <div class="source-edit-marker" style={markerStyle()} aria-hidden="true" />
        </Show>
        <textarea
          ref={ta}
          class="source-editor-textarea mono"
          spellcheck={false}
          value={source()}
          onFocus={(e) => {
            updateMetrics();
            markEditingPoint(e.currentTarget);
          }}
          onInput={(e) => {
            setSource(e.currentTarget.value);
            markEditingPoint(e.currentTarget);
          }}
          onSelect={(e) => markEditingPoint(e.currentTarget)}
          onKeyUp={(e) => markEditingPoint(e.currentTarget)}
          onMouseUp={(e) => markEditingPoint(e.currentTarget)}
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
          onBlur={() => clearEditingPoint("source")}
        />
      </div>
    </div>
  );
};
