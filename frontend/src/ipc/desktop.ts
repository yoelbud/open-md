import { invoke } from "@tauri-apps/api/core";

type TauriWindow = Window & {
  __TAURI__?: unknown;
  __TAURI_INTERNALS__?: unknown;
};

export interface LoadedMarkdownFile {
  path: string;
  source: string;
}

export interface SavedMarkdownFile {
  path: string;
}

export interface ProjectFile {
  path: string;
  relativePath: string;
}

export interface ProjectPayload {
  root: string;
  files: ProjectFile[];
}

export const isDesktopRuntime = () => {
  if (typeof window === "undefined") return false;
  const tauriWindow = window as TauriWindow;
  return Boolean(tauriWindow.__TAURI_INTERNALS__ || tauriWindow.__TAURI__);
};

const invokeIfDesktop = async <T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T | null> => {
  if (!isDesktopRuntime()) return null;
  return invoke<T>(command, args);
};

export const createMarkdownFile = (projectRoot: string | null) =>
  invokeIfDesktop<LoadedMarkdownFile | null>("new_markdown_file", { projectRoot });

export const openMarkdownFile = () =>
  invokeIfDesktop<LoadedMarkdownFile | null>("open_markdown_file");

export const saveMarkdownFile = (path: string | null, source: string) =>
  invokeIfDesktop<SavedMarkdownFile | null>("save_markdown_file", { path, source });

export const openProjectFolder = () =>
  invokeIfDesktop<ProjectPayload | null>("open_project_folder");

export const loadProjectFile = (path: string) =>
  invokeIfDesktop<LoadedMarkdownFile>("load_project_file", { path });

export interface GitFileStatus {
  isRepo: boolean;
  branch: string | null;
  statusCode: string | null;
}

export const gitFileStatus = (path: string) =>
  invokeIfDesktop<GitFileStatus | null>("git_file_status", { path });

export const gitHeadContent = (path: string) =>
  invokeIfDesktop<string | null>("git_head_content", { path });
