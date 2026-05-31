import { createMemo } from "solid-js";
import { useSource } from "../store/document";
import { computeStats, formatReadingTime } from "../store/stats";

/**
 * StatusBar displays word count, character count, and estimated reading time
 * at the bottom of the application window. Reactively recomputes as the
 * document source changes.
 */
export const StatusBar = () => {
  const source = useSource();
  const stats = createMemo(() => computeStats(source()));

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
    </footer>
  );
};
