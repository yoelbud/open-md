import { For, Show } from "solid-js";
import {
  createMarkdownFile,
  openProject,
  openProjectFile,
  useActiveProjectFile,
  useProjectFiles,
  useProjectRoot,
} from "../../store/document";

export const ProjectSidebar = () => {
  const root = useProjectRoot();
  const files = useProjectFiles();
  const activeFile = useActiveProjectFile();

  return (
    <aside class="project-sidebar" aria-label="Project files">
      <div class="project-sidebar-header">
        <div>
          <span class="project-sidebar-title">Project</span>
          <Show when={root()} fallback={<span class="project-sidebar-root">No folder open</span>}>
            {(projectRoot) => <span class="project-sidebar-root">{projectRoot()}</span>}
          </Show>
        </div>
        <div class="project-sidebar-actions">
          <button type="button" onClick={() => void openProject()}>
            Open
          </button>
          <button type="button" onClick={() => void createMarkdownFile()}>
            New
          </button>
        </div>
      </div>
      <Show
        when={files().length > 0}
        fallback={<p class="project-sidebar-empty">Open a folder to list Markdown files.</p>}
      >
        <div class="project-file-list" role="list">
          <For each={files()}>
            {(file) => (
              <button
                type="button"
                class="project-file"
                classList={{ active: activeFile() === file.path }}
                title={file.path}
                onClick={() => void openProjectFile(file)}
              >
                {file.relativePath}
              </button>
            )}
          </For>
        </div>
      </Show>
    </aside>
  );
};
