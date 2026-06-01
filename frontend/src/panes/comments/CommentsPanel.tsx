import { createSignal, createMemo, For, Show } from "solid-js";
import {
  useComments,
  updateComment,
  deleteComment,
  toggleResolved,
  addReply,
} from "../../store/comments";
import type { Comment } from "../../store/comments";
import { useDocument } from "../../store/document";

type FilterMode = "all" | "unresolved";

/**
 * CommentsPanel — a sidebar listing all comments for the current document.
 * Mirrors the OutlinePanel structure.
 */
export const CommentsPanel = () => {
  const [filter, setFilter] = createSignal<FilterMode>("all");
  const [editingId, setEditingId] = createSignal<string | null>(null);
  const [editBody, setEditBody] = createSignal("");
  const [replyingId, setReplyingId] = createSignal<string | null>(null);
  const [replyBody, setReplyBody] = createSignal("");

  const doc = useDocument;
  const allComments = useComments();

  // Order comments by block position in the document.
  const orderedComments = createMemo(() => {
    const blocks = doc().blocks;
    const blockOrder = new Map(blocks.map((b, i) => [b.id, i]));
    const cs = filter() === "unresolved"
      ? allComments().filter((c) => !c.resolved)
      : allComments();
    return [...cs].sort((a, b) => {
      const ai = blockOrder.get(a.blockId) ?? Infinity;
      const bi = blockOrder.get(b.blockId) ?? Infinity;
      if (ai !== bi) return ai - bi;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  });

  const scrollToBlock = (blockId: string) => {
    const el = document.querySelector(`[data-block-id="${blockId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("om-comment-flash");
      setTimeout(() => el.classList.remove("om-comment-flash"), 1500);
    }
  };

  const startEdit = (comment: Comment) => {
    setEditingId(comment.id);
    setEditBody(comment.body);
  };

  const commitEdit = () => {
    const id = editingId();
    if (id && editBody().trim()) {
      updateComment(id, editBody().trim());
    }
    setEditingId(null);
    setEditBody("");
  };

  const startReply = (commentId: string) => {
    setReplyingId(commentId);
    setReplyBody("");
  };

  const commitReply = () => {
    const id = replyingId();
    if (id && replyBody().trim()) {
      addReply(id, { body: replyBody().trim() });
    }
    setReplyingId(null);
    setReplyBody("");
  };

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
        " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    } catch {
      return iso;
    }
  };

  return (
    <aside class="comments-panel" aria-label="Document comments">
      <div class="comments-panel-header">
        <span class="comments-panel-title">Comments</span>
        <select
          class="comments-filter"
          value={filter()}
          onChange={(e) => setFilter(e.currentTarget.value as FilterMode)}
        >
          <option value="all">All</option>
          <option value="unresolved">Unresolved</option>
        </select>
      </div>
      <Show
        when={orderedComments().length > 0}
        fallback={<p class="comments-panel-empty">No comments yet.</p>}
      >
        <div class="comments-list">
          <For each={orderedComments()}>
            {(comment) => (
              <div
                class="comment-card"
                classList={{
                  "comment-resolved": comment.resolved,
                  "comment-orphaned": !!comment.orphaned,
                }}
              >
                <button
                  type="button"
                  class="comment-anchor-btn"
                  title="Scroll to block"
                  onClick={() => scrollToBlock(comment.blockId)}
                >
                  {comment.orphaned ? "⚠ orphaned" : "↗"}
                </button>
                <Show when={comment.quote}>
                  <blockquote class="comment-quote">{comment.quote}</blockquote>
                </Show>
                <Show
                  when={editingId() !== comment.id}
                  fallback={
                    <div class="comment-edit-form">
                      <textarea
                        class="comment-edit-ta"
                        value={editBody()}
                        onInput={(e) => setEditBody(e.currentTarget.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) commitEdit();
                          if (e.key === "Escape") setEditingId(null);
                        }}
                      />
                      <button type="button" class="comment-btn" onClick={commitEdit}>Save</button>
                      <button type="button" class="comment-btn" onClick={() => setEditingId(null)}>Cancel</button>
                    </div>
                  }
                >
                  <p class="comment-body">{comment.body}</p>
                </Show>
                <span class="comment-meta">
                  {comment.author ? `${comment.author} · ` : ""}{formatTime(comment.createdAt)}
                </span>
                <div class="comment-actions">
                  <button type="button" class="comment-btn" onClick={() => toggleResolved(comment.id)}>
                    {comment.resolved ? "Reopen" : "Resolve"}
                  </button>
                  <button type="button" class="comment-btn" onClick={() => startEdit(comment)}>Edit</button>
                  <button type="button" class="comment-btn comment-btn-danger" onClick={() => deleteComment(comment.id)}>
                    Delete
                  </button>
                  <button type="button" class="comment-btn" onClick={() => startReply(comment.id)}>Reply</button>
                </div>
                {/* Replies */}
                <Show when={comment.replies.length > 0}>
                  <div class="comment-replies">
                    <For each={comment.replies}>
                      {(reply) => (
                        <div class="comment-reply">
                          <p class="comment-reply-body">{reply.body}</p>
                          <span class="comment-meta">
                            {reply.author ? `${reply.author} · ` : ""}{formatTime(reply.createdAt)}
                          </span>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>
                {/* Reply form */}
                <Show when={replyingId() === comment.id}>
                  <div class="comment-reply-form">
                    <textarea
                      class="comment-edit-ta"
                      placeholder="Reply…"
                      value={replyBody()}
                      onInput={(e) => setReplyBody(e.currentTarget.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) commitReply();
                        if (e.key === "Escape") setReplyingId(null);
                      }}
                    />
                    <button type="button" class="comment-btn" onClick={commitReply}>Send</button>
                    <button type="button" class="comment-btn" onClick={() => setReplyingId(null)}>Cancel</button>
                  </div>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>
    </aside>
  );
};
