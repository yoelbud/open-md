import { useSource, useSetSource } from "../../store/document";

export const SourcePane = () => {
  const source = useSource();
  const setSource = useSetSource();
  return (
    <div class="pane">
      <div class="pane-header">Source</div>
      <textarea
        class="pane-body mono"
        spellcheck={false}
        style={{
          background: "transparent",
          color: "inherit",
          border: "none",
          outline: "none",
          resize: "none",
        }}
        value={source()}
        onInput={(e) => setSource(e.currentTarget.value)}
      />
    </div>
  );
};
