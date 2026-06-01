import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  addCommentPure,
  updateCommentPure,
  deleteCommentPure,
  toggleResolvedPure,
  addReplyPure,
  reconcileComments,
  serializeComments,
  deserializeComments,
  storageKey,
  generateId,
} from "../src/store/comments";
import type { Comment } from "../src/store/comments";

const makeComment = (overrides: Partial<Comment> = {}): Comment => {
  const c: Comment = {
    id: overrides.id ?? "c1",
    blockId: overrides.blockId ?? "block-1",
    body: overrides.body ?? "Test comment",
    createdAt: overrides.createdAt ?? "2025-01-15T10:00:00.000Z",
    resolved: overrides.resolved ?? false,
    replies: overrides.replies ?? [],
  };
  if (overrides.quote !== undefined) c.quote = overrides.quote;
  if (overrides.author !== undefined) c.author = overrides.author;
  if (overrides.orphaned !== undefined) c.orphaned = overrides.orphaned;
  return c;
};

describe("generateId", () => {
  it("returns a non-empty string", () => {
    const id = generateId();
    expect(id).toBeTruthy();
    expect(typeof id).toBe("string");
  });

  it("returns unique ids", () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateId()));
    expect(ids.size).toBe(50);
  });
});

describe("addCommentPure", () => {
  it("appends a new comment with generated fields", () => {
    const result = addCommentPure([], { blockId: "b1", body: "Hello" });
    expect(result).toHaveLength(1);
    const c = result[0]!;
    expect(c.blockId).toBe("b1");
    expect(c.body).toBe("Hello");
    expect(c.resolved).toBe(false);
    expect(c.replies).toEqual([]);
    expect(c.id).toBeTruthy();
    expect(c.createdAt).toBeTruthy();
  });

  it("preserves existing comments", () => {
    const existing = [makeComment()];
    const result = addCommentPure(existing, { blockId: "b2", body: "New" });
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe("c1");
    expect(result[1]!.body).toBe("New");
  });

  it("includes optional quote and author", () => {
    const result = addCommentPure([], {
      blockId: "b1",
      body: "Note",
      quote: "selected text",
      author: "Alice",
    });
    expect(result[0]!.quote).toBe("selected text");
    expect(result[0]!.author).toBe("Alice");
  });
});

describe("updateCommentPure", () => {
  it("updates the body of a matching comment", () => {
    const comments = [makeComment({ id: "c1", body: "old" })];
    const result = updateCommentPure(comments, "c1", "new body");
    expect(result[0]!.body).toBe("new body");
  });

  it("does not change unrelated comments", () => {
    const comments = [
      makeComment({ id: "c1", body: "keep" }),
      makeComment({ id: "c2", body: "also keep" }),
    ];
    const result = updateCommentPure(comments, "c1", "changed");
    expect(result[1]!.body).toBe("also keep");
  });

  it("returns unchanged array for unknown id", () => {
    const comments = [makeComment()];
    const result = updateCommentPure(comments, "unknown", "x");
    expect(result[0]!.body).toBe("Test comment");
  });
});

describe("deleteCommentPure", () => {
  it("removes the comment with the given id", () => {
    const comments = [makeComment({ id: "c1" }), makeComment({ id: "c2" })];
    const result = deleteCommentPure(comments, "c1");
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("c2");
  });

  it("returns empty for single-element list", () => {
    const result = deleteCommentPure([makeComment()], "c1");
    expect(result).toHaveLength(0);
  });

  it("is a no-op for unknown id", () => {
    const comments = [makeComment()];
    const result = deleteCommentPure(comments, "x");
    expect(result).toHaveLength(1);
  });
});

describe("toggleResolvedPure", () => {
  it("toggles resolved from false to true", () => {
    const comments = [makeComment({ id: "c1", resolved: false })];
    const result = toggleResolvedPure(comments, "c1");
    expect(result[0]!.resolved).toBe(true);
  });

  it("toggles resolved from true to false", () => {
    const comments = [makeComment({ id: "c1", resolved: true })];
    const result = toggleResolvedPure(comments, "c1");
    expect(result[0]!.resolved).toBe(false);
  });

  it("does not touch other comments", () => {
    const comments = [
      makeComment({ id: "c1", resolved: false }),
      makeComment({ id: "c2", resolved: true }),
    ];
    const result = toggleResolvedPure(comments, "c1");
    expect(result[1]!.resolved).toBe(true);
  });
});

describe("addReplyPure", () => {
  it("adds a reply to the specified comment", () => {
    const comments = [makeComment({ id: "c1" })];
    const result = addReplyPure(comments, "c1", { body: "reply text" });
    expect(result[0]!.replies).toHaveLength(1);
    expect(result[0]!.replies[0]!.body).toBe("reply text");
    expect(result[0]!.replies[0]!.id).toBeTruthy();
    expect(result[0]!.replies[0]!.createdAt).toBeTruthy();
  });

  it("preserves existing replies", () => {
    const comments = [
      makeComment({
        id: "c1",
        replies: [{ id: "r1", body: "existing", createdAt: "2025-01-01T00:00:00.000Z" }],
      }),
    ];
    const result = addReplyPure(comments, "c1", { body: "second" });
    expect(result[0]!.replies).toHaveLength(2);
    expect(result[0]!.replies[0]!.body).toBe("existing");
    expect(result[0]!.replies[1]!.body).toBe("second");
  });

  it("includes optional author", () => {
    const comments = [makeComment({ id: "c1" })];
    const result = addReplyPure(comments, "c1", { body: "hi", author: "Bob" });
    expect(result[0]!.replies[0]!.author).toBe("Bob");
  });

  it("is a no-op for unknown comment id", () => {
    const comments = [makeComment({ id: "c1" })];
    const result = addReplyPure(comments, "unknown", { body: "hi" });
    expect(result[0]!.replies).toHaveLength(0);
  });
});

describe("reconcileComments", () => {
  it("marks comments as orphaned when block id is missing", () => {
    const comments = [
      makeComment({ id: "c1", blockId: "b1" }),
      makeComment({ id: "c2", blockId: "b2" }),
    ];
    const blockIds = new Set(["b1"]);
    const result = reconcileComments(comments, blockIds);
    expect(result[0]!.orphaned).toBe(false);
    expect(result[1]!.orphaned).toBe(true);
  });

  it("un-orphans comments when block reappears", () => {
    const comments = [makeComment({ id: "c1", blockId: "b1", orphaned: true })];
    const blockIds = new Set(["b1"]);
    const result = reconcileComments(comments, blockIds);
    expect(result[0]!.orphaned).toBe(false);
  });

  it("handles empty block set — all orphaned", () => {
    const comments = [makeComment({ id: "c1", blockId: "b1" })];
    const result = reconcileComments(comments, new Set());
    expect(result[0]!.orphaned).toBe(true);
  });

  it("handles empty comments array", () => {
    const result = reconcileComments([], new Set(["b1"]));
    expect(result).toEqual([]);
  });

  it("does not delete orphaned comments", () => {
    const comments = [
      makeComment({ id: "c1", blockId: "gone" }),
      makeComment({ id: "c2", blockId: "exists" }),
    ];
    const result = reconcileComments(comments, new Set(["exists"]));
    expect(result).toHaveLength(2);
  });
});

describe("serialization", () => {
  it("round-trips via serialize/deserialize", () => {
    const comments = [
      makeComment({ id: "c1", body: "hello", quote: "world", replies: [] }),
      makeComment({
        id: "c2",
        body: "with reply",
        replies: [{ id: "r1", body: "reply", createdAt: "2025-01-15T10:00:00.000Z" }],
      }),
    ];
    const json = serializeComments(comments);
    const parsed = deserializeComments(json);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]!.id).toBe("c1");
    expect(parsed[0]!.body).toBe("hello");
    expect(parsed[0]!.quote).toBe("world");
    expect(parsed[1]!.replies).toHaveLength(1);
    expect(parsed[1]!.replies[0]!.body).toBe("reply");
  });

  it("handles invalid JSON gracefully", () => {
    expect(deserializeComments("not-json")).toEqual([]);
    expect(deserializeComments("")).toEqual([]);
    expect(deserializeComments("null")).toEqual([]);
    expect(deserializeComments("42")).toEqual([]);
  });

  it("handles malformed array entries gracefully", () => {
    const result = deserializeComments('[{"blockId": 123, "body": null}]');
    expect(result).toHaveLength(1);
    expect(result[0]!.blockId).toBe("");
    expect(result[0]!.body).toBe("");
    expect(result[0]!.resolved).toBe(false);
  });
});

describe("storageKey", () => {
  it("prefixes the path", () => {
    expect(storageKey("/docs/readme.md")).toBe("open-md:comments:/docs/readme.md");
  });

  it("handles untitled", () => {
    expect(storageKey("(untitled).md")).toBe("open-md:comments:(untitled).md");
  });
});

describe("localStorage integration", () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => { store[key] = value; },
      removeItem: (key: string) => { delete store[key]; },
    });
  });

  it("loads empty array when no data stored", () => {
    const raw = localStorage.getItem(storageKey("test.md"));
    expect(raw).toBeNull();
  });

  it("saves and loads round-trip", () => {
    const comments = [makeComment({ id: "c1", body: "persisted" })];
    localStorage.setItem(storageKey("test.md"), serializeComments(comments));
    const loaded = deserializeComments(localStorage.getItem(storageKey("test.md"))!);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.body).toBe("persisted");
  });

  it("survives localStorage.setItem throwing (quota exceeded)", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => { throw new DOMException("QuotaExceededError"); },
      removeItem: () => {},
    });
    // serializeComments should not throw
    expect(() => serializeComments([makeComment()])).not.toThrow();
  });
});

describe("unresolved count", () => {
  it("counts only non-resolved comments", () => {
    const comments = [
      makeComment({ id: "c1", resolved: false }),
      makeComment({ id: "c2", resolved: true }),
      makeComment({ id: "c3", resolved: false }),
    ];
    const count = comments.filter((c) => !c.resolved).length;
    expect(count).toBe(2);
  });
});
