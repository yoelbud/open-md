import { createSignal, createMemo, For, Show } from "solid-js";
import { useDocument } from "../../store/document";
import { checkBlocks } from "../../store/proofreader";
import type { IssueWithBlock, IssueSeverity } from "../../store/proofreader";

const SEVERITY_ICON: Record<IssueSeverity, string> = {
  error: "🔴",
  warning: "🟡",
  suggestion: "🔵",
};

/**
 * ProofreadPanel — a sidebar panel listing proofreading issues found in prose blocks.
 * Lightweight heuristic style checker (not a full grammar engine).
 * Mirrors the CommentsPanel/OutlinePanel pattern.
 */
export const ProofreadPanel = () => {
  const doc = useDocument;
  const [lastChecked, setLastChecked] = createSignal<IssueWithBlock[]>([]);

  const runCheck = () => {
    const blocks = doc().blocks;
    const issues = checkBlocks(blocks);
    setLastChecked(issues);
  };

  // Run on first mount
  runCheck();

  const issues = () => lastChecked();

  const counts = createMemo(() => {
    const all = issues();
    return {
      error: all.filter((i) => i.severity === "error").length,
      warning: all.filter((i) => i.severity === "warning").length,
      suggestion: all.filter((i) => i.severity === "suggestion").length,
      total: all.length,
    };
  });

  const scrollToBlock = (blockId: string) => {
    const el = document.querySelector(`[data-block-id="${blockId}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div class="proofread-panel">
      <div class="proofread-panel-header">
        <span class="proofread-panel-title">Proofreading</span>
        <button class="proofread-check-btn" onClick={runCheck} title="Re-check document">
          ⟳ Check
        </button>
      </div>
      <div class="proofread-counts">
        <Show when={counts().total === 0}>
          <span class="proofread-clean">✓ No issues found</span>
        </Show>
        <Show when={counts().total > 0}>
          <span class="proofread-count-error">{SEVERITY_ICON.error} {counts().error}</span>
          <span class="proofread-count-warning">{SEVERITY_ICON.warning} {counts().warning}</span>
          <span class="proofread-count-suggestion">{SEVERITY_ICON.suggestion} {counts().suggestion}</span>
        </Show>
      </div>
      <div class="proofread-list">
        <For each={issues()}>
          {(issue) => (
            <button
              class={`proofread-issue proofread-severity-${issue.severity}`}
              onClick={() => scrollToBlock(issue.blockId)}
              title={`Click to scroll to this issue in "${issue.blockId}"`}
            >
              <span class="proofread-issue-icon">{SEVERITY_ICON[issue.severity]}</span>
              <div class="proofread-issue-body">
                <span class="proofread-issue-message">{issue.message}</span>
                <Show when={issue.suggestion}>
                  <span class="proofread-issue-suggestion">
                    → {issue.suggestion}
                  </span>
                </Show>
                <span class="proofread-issue-snippet">"{issue.snippet}"</span>
              </div>
            </button>
          )}
        </For>
      </div>
    </div>
  );
};
