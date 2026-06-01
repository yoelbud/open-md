/**
 * Comments store — word-processor-style margin comments for open-md.
 *
 * Comments are sidecar metadata: they never touch the Markdown source.
 * They persist to localStorage keyed by document path and are fully
 * reactive via SolidJS signals.
 */

import { createSignal, createMemo, createEffect } from "solid-js";
import { usePath } from "./document";

// ── Data types ──────────────────────────────────────────────────────────────

export interface CommentReply {
  id: string;
  body: string;
  author?: string;
  createdAt: string;
}

export interface Comment {
  id: string;
  blockId: string;
  quote?: string;
  body: string;
  author?: string;
  createdAt: string;
  resolved: boolean;
  orphaned?: boolean;
  replies: CommentReply[];
}

// ── ID generation ───────────────────────────────────────────────────────────

export const generateId = (): string => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback: timestamp + random hex
  return (
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 10)
  );
};

// ── Pure list operations (testable) ─────────────────────────────────────────

export const addCommentPure = (
  comments: Comment[],
  comment: Omit<Comment, "id" | "createdAt" | "resolved" | "replies">,
): Comment[] => [
  ...comments,
  {
    ...comment,
    id: generateId(),
    createdAt: new Date().toISOString(),
    resolved: false,
    replies: [],
  },
];

export const updateCommentPure = (
  comments: Comment[],
  id: string,
  body: string,
): Comment[] =>
  comments.map((c) => (c.id === id ? { ...c, body } : c));

export const deleteCommentPure = (
  comments: Comment[],
  id: string,
): Comment[] => comments.filter((c) => c.id !== id);

export const toggleResolvedPure = (
  comments: Comment[],
  id: string,
): Comment[] =>
  comments.map((c) => (c.id === id ? { ...c, resolved: !c.resolved } : c));

export const addReplyPure = (
  comments: Comment[],
  commentId: string,
  reply: Omit<CommentReply, "id" | "createdAt">,
): Comment[] =>
  comments.map((c) =>
    c.id === commentId
      ? {
          ...c,
          replies: [
            ...c.replies,
            {
              ...reply,
              id: generateId(),
              createdAt: new Date().toISOString(),
            },
          ],
        }
      : c,
  );

/**
 * Marks comments as orphaned if their blockId no longer exists in the block
 * list. Un-orphans comments whose blockId is present again.
 */
export const reconcileComments = (
  comments: Comment[],
  blockIds: Set<string>,
): Comment[] =>
  comments.map((c) => ({
    ...c,
    orphaned: !blockIds.has(c.blockId),
  }));

// ── Serialization ───────────────────────────────────────────────────────────

export const serializeComments = (comments: Comment[]): string =>
  JSON.stringify(comments);

export const deserializeComments = (json: string): Comment[] => {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((c: Record<string, unknown>) => {
      const comment: Comment = {
        id: typeof c.id === "string" ? c.id : generateId(),
        blockId: typeof c.blockId === "string" ? c.blockId : "",
        body: typeof c.body === "string" ? c.body : "",
        createdAt: typeof c.createdAt === "string" ? c.createdAt : new Date().toISOString(),
        resolved: c.resolved === true,
        replies: Array.isArray(c.replies)
          ? (c.replies as Record<string, unknown>[]).map((r) => {
              const reply: CommentReply = {
                id: typeof r.id === "string" ? r.id : generateId(),
                body: typeof r.body === "string" ? r.body : "",
                createdAt: typeof r.createdAt === "string" ? r.createdAt : new Date().toISOString(),
              };
              if (typeof r.author === "string") reply.author = r.author;
              return reply;
            })
          : [],
      };
      if (typeof c.quote === "string") comment.quote = c.quote;
      if (typeof c.author === "string") comment.author = c.author;
      if (c.orphaned === true) comment.orphaned = true;
      return comment;
    });
  } catch {
    return [];
  }
};

// ── localStorage helpers ────────────────────────────────────────────────────

const STORAGE_PREFIX = "open-md:comments:";

export const storageKey = (docPath: string): string =>
  `${STORAGE_PREFIX}${docPath}`;

const loadFromStorage = (docPath: string): Comment[] => {
  try {
    const raw = localStorage.getItem(storageKey(docPath));
    return raw ? deserializeComments(raw) : [];
  } catch {
    return [];
  }
};

const saveToStorage = (docPath: string, comments: Comment[]): void => {
  try {
    localStorage.setItem(storageKey(docPath), serializeComments(comments));
  } catch {
    // Quota exceeded or other localStorage error — silently ignore.
  }
};

// ── Reactive store ──────────────────────────────────────────────────────────

const [comments, setComments] = createSignal<Comment[]>([]);
const [commentsVisible, setCommentsVisible] = createSignal(false);

let currentDocPath = "";

/**
 * Initialize comments when the document path changes.
 * Must be called inside a reactive root (e.g. App component).
 */
export const initCommentsEffect = () => {
  const path = usePath();
  createEffect(() => {
    const p = path();
    if (p !== currentDocPath) {
      currentDocPath = p;
      setComments(loadFromStorage(p));
    }
  });

  // Auto-save on mutation
  createEffect(() => {
    const c = comments();
    if (currentDocPath) {
      saveToStorage(currentDocPath, c);
    }
  });
};

// ── Public API ──────────────────────────────────────────────────────────────

export const useComments = () => comments;
export const useCommentsVisible = () => commentsVisible;
export const toggleCommentsPanel = () => setCommentsVisible((v) => !v);

export const useCommentsForBlock = (blockId: () => string) =>
  createMemo(() => comments().filter((c) => c.blockId === blockId() && !c.resolved));

export const useUnresolvedCount = () =>
  createMemo(() => comments().filter((c) => !c.resolved).length);

export const addComment = (
  comment: Omit<Comment, "id" | "createdAt" | "resolved" | "replies">,
) => {
  setComments((prev) => addCommentPure(prev, comment));
};

export const updateComment = (id: string, body: string) => {
  setComments((prev) => updateCommentPure(prev, id, body));
};

export const deleteComment = (id: string) => {
  setComments((prev) => deleteCommentPure(prev, id));
};

export const toggleResolved = (id: string) => {
  setComments((prev) => toggleResolvedPure(prev, id));
};

export const addReply = (
  commentId: string,
  reply: Omit<CommentReply, "id" | "createdAt">,
) => {
  setComments((prev) => addReplyPure(prev, commentId, reply));
};

export const reconcileWithBlocks = (blockIds: Set<string>) => {
  setComments((prev) => reconcileComments(prev, blockIds));
};
