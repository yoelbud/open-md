import { createMemo, createEffect } from "solid-js";
import { useSource, usePath } from "../store/document";
import { computeStats, formatReadingTime } from "../store/stats";
import { useGitAvailable, useGitBranch, useGitStatusLabel, refreshGitStatus } from "../store/git";

/**
 * StatusBar displays word count, character count, and estimated reading time
 * at the bottom of the application window. Reactively recomputes as the
 * document source changes.
 */
export const StatusBar = () => {
  const source = useSource();
  const path = usePath();
  const stats = createMemo(() => computeStats(source()));
  const gitAvailable = useGitAvailable();
  const gitBranch = useGitBranch();
  const gitStatusLabel = useGitStatusLabel();

  // Refresh git status when the document path or source changes.
  createEffect(() => {
    // Track both signals so the effect re-runs on changes.
    path();
    source();
    void refreshGitStatus();
  });

  return (
    <footer class="status-bar" aria-label="Document statistics">
      <span class="status-bar-item" title="Word count">
        {stats().words.toLocaleString()} words
      </span>
      <span class="status-bar-sep" aria-hidden="true">·</span>
      <span class="status-bar-item" title="Character count">
        {stats().chars.toLocaleString()} chars
      </span>
      <span class="status-bar-sep" aria-hidden="true">·</span>
      <span class="status-bar-item" title="Estimated reading time (~200 wpm)">
        {formatReadingTime(stats().readingTimeMinutes)}
      </span>
      {gitAvailable() && (
        <>
          <span class="status-bar-sep" aria-hidden="true">·</span>
          <span class="status-bar-item" title="Git branch and status">
            ⎇ {gitBranch() ?? "—"} · {gitStatusLabel()}
          </span>
        </>
      )}
    </footer>
  );
};
