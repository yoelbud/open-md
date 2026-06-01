import { For, Show } from "solid-js";
import {
  newDocument,
  openExampleProject,
  openFile,
  openProject,
  openRecent,
  WORKSPACE_MODES,
  applyWorkspaceMode,
} from "../store/document";
import type { WorkspaceMode } from "../store/document";
import { clearRecents, removeRecent, useRecents } from "../store/recents";
import type { RecentKind } from "../store/recents";

const KIND_LABEL: Record<RecentKind, string> = {
  file: "File",
  project: "Project file",
  example: "Example",
};

const formatWhen = (at: number): string => {
  const diffMs = Date.now() - at;
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
};

export const WelcomeScreen = () => {
  const recents = useRecents();

  const startInMode = (mode: WorkspaceMode) => {
    newDocument();
    applyWorkspaceMode(mode);
  };

  return (
    <div class="welcome" role="region" aria-label="Welcome">
      <div class="welcome-card">
        <h1 class="welcome-title">open-md</h1>
        <p class="welcome-tagline">
          Document your repo, review it against git, and present it — all local,
          all Markdown.
        </p>

        <div class="welcome-actions">
          <button type="button" class="welcome-action primary" onClick={() => newDocument()}>
            <span class="welcome-action-icon" aria-hidden="true">📝</span>
            <span class="welcome-action-text">
              <span class="welcome-action-label">New document</span>
              <span class="welcome-action-hint">Start writing on a blank page</span>
            </span>
          </button>
          <button type="button" class="welcome-action" onClick={() => void openFile()}>
            <span class="welcome-action-icon" aria-hidden="true">📂</span>
            <span class="welcome-action-text">
              <span class="welcome-action-label">Open file…</span>
              <span class="welcome-action-hint">Open a Markdown file</span>
            </span>
          </button>
          <button type="button" class="welcome-action" onClick={() => void openProject()}>
            <span class="welcome-action-icon" aria-hidden="true">🗂️</span>
            <span class="welcome-action-text">
              <span class="welcome-action-label">Open folder…</span>
              <span class="welcome-action-hint">Browse a folder of Markdown</span>
            </span>
          </button>
          <button type="button" class="welcome-action" onClick={() => openExampleProject()}>
            <span class="welcome-action-icon" aria-hidden="true">✨</span>
            <span class="welcome-action-text">
              <span class="welcome-action-label">Open example project</span>
              <span class="welcome-action-hint">Tour what open-md can do</span>
            </span>
          </button>
        </div>

        <p class="welcome-modes-caption">Start in a mode</p>
        <div class="welcome-modes" role="group" aria-label="Start in a workspace mode">
          <For each={WORKSPACE_MODES}>
            {(mode) => (
              <button
                type="button"
                class="welcome-mode"
                onClick={() => startInMode(mode.id)}
              >
                <span class="welcome-mode-label">{mode.label}</span>
                <span class="welcome-mode-hint">{mode.description}</span>
              </button>
            )}
          </For>
        </div>

        <Show when={recents().length > 0}>
          <div class="welcome-recents">
            <div class="welcome-recents-header">
              <span class="welcome-recents-title">Recent</span>
              <button type="button" class="welcome-recents-clear" onClick={() => clearRecents()}>
                Clear
              </button>
            </div>
            <ul class="welcome-recents-list">
              <For each={recents()}>
                {(item) => (
                  <li class="welcome-recent">
                    <button
                      type="button"
                      class="welcome-recent-open"
                      title={item.path}
                      onClick={() => void openRecent(item.path)}
                    >
                      <span class="welcome-recent-label">{item.label}</span>
                      <span class="welcome-recent-meta">
                        {KIND_LABEL[item.kind]} · {formatWhen(item.at)}
                      </span>
                    </button>
                    <button
                      type="button"
                      class="welcome-recent-remove"
                      title="Remove from recent"
                      aria-label={`Remove ${item.label} from recent`}
                      onClick={() => removeRecent(item.path)}
                    >
                      ✕
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </div>
        </Show>
      </div>
    </div>
  );
};
