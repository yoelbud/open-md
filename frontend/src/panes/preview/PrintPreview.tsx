import { Index } from "solid-js";
import { useDocument } from "../../store/document";

const printableHtml = (html: string) => html.replace(/\sloading="lazy"/g, "");

export const PrintPreview = () => {
  const doc = useDocument;

  return (
    <article class="print-preview" aria-hidden="true">
      <Index each={doc().blocks}>
        {(block) => (
          <div
            class="print-preview-row"
            innerHTML={printableHtml(block().html)}
          />
        )}
      </Index>
    </article>
  );
};
