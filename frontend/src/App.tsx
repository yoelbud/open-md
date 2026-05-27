import { SourcePane } from "./panes/source/SourcePane";
import { IrPane } from "./panes/ir/IrPane";
import { PreviewPane } from "./panes/preview/PreviewPane";
import { openFile, usePath } from "./store/document";

export const App = () => {
  const path = usePath();
  return (
    <div class="app">
      <div class="toolbar">
        <button onClick={openFile}>Open…</button>
        <span class="path">{path()}</span>
      </div>
      <div class="panes">
        <SourcePane />
        <IrPane />
        <PreviewPane />
      </div>
    </div>
  );
};
