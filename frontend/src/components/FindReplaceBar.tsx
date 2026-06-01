import { createSignal, createMemo, createEffect, Show, onMount } from "solid-js";
import {
  closeFind,
  useFindOpen,
  useFindShowReplace,
  useFindSeed,
  useSource,
  useSetSource,
} from "../store/document";
import { findMatches, nextMatchIndex } from "../store/search";
import type { SearchMatch } from "../store/search";

export type FindReplaceRequest = {
  select: (start: number, end: number) => void;
};

export const FindReplaceBar = (props: FindReplaceRequest) => {
  const source = useSource();
  const setSource = useSetSource();
  const isOpen = useFindOpen();
  const showReplace = useFindShowReplace();

  const [query, setQuery] = createSignal("");
  const [replacement, setReplacement] = createSignal("");
  const [caseSensitive, setCaseSensitive] = createSignal(false);
  const [useRegex, setUseRegex] = createSignal(false);
  const [currentIdx, setCurrentIdx] = createSignal(0);

  let findInput: HTMLInputElement | undefined;

  const matches = createMemo<SearchMatch[]>(() =>
    findMatches(source(), query(), { regex: useRegex(), caseSensitive: caseSensitive() }),
  );

  const navigateTo = (idx: number) => {
    const m = matches();
    if (idx < 0 || idx >= m.length) return;
    setCurrentIdx(idx);
    props.select(m[idx]!.start, m[idx]!.end);
  };

  const goNext = () => {
    const m = matches();
    if (!m.length) return;
    const next = (currentIdx() + 1) % m.length;
    navigateTo(next);
  };

  const goPrev = () => {
    const m = matches();
    if (!m.length) return;
    const prev = (currentIdx() - 1 + m.length) % m.length;
    navigateTo(prev);
  };

  const replaceCurrent = () => {
    const m = matches();
    const idx = currentIdx();
    if (idx < 0 || idx >= m.length) return;
    const match = m[idx]!;
    const text = source();
    const newText = text.slice(0, match.start) + replacement() + text.slice(match.end);
    setSource(newText);
    // After replace, navigate to next match at same position
    const newMatches = findMatches(newText, query(), { regex: useRegex(), caseSensitive: caseSensitive() });
    const nextIdx = nextMatchIndex(newMatches, match.start);
    if (nextIdx >= 0) {
      setCurrentIdx(nextIdx);
      props.select(newMatches[nextIdx]!.start, newMatches[nextIdx]!.end);
    }
  };

  const replaceAll = () => {
    const m = matches();
    if (!m.length) return;
    const text = source();
    // Replace from end to start to preserve offsets
    let result = text;
    for (let i = m.length - 1; i >= 0; i--) {
      const match = m[i]!;
      result = result.slice(0, match.start) + replacement() + result.slice(match.end);
    }
    setSource(result);
    setCurrentIdx(0);
  };

  const onQueryInput = (value: string) => {
    setQuery(value);
    // Auto-navigate to first match
    const m = findMatches(source(), value, { regex: useRegex(), caseSensitive: caseSensitive() });
    if (m.length > 0) {
      setCurrentIdx(0);
      props.select(m[0]!.start, m[0]!.end);
    } else {
      setCurrentIdx(0);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      closeFind();
      e.preventDefault();
    } else if (e.key === "Enter" && !e.shiftKey) {
      goNext();
      e.preventDefault();
    } else if (e.key === "Enter" && e.shiftKey) {
      goPrev();
      e.preventDefault();
    }
  };

  // Focus the find input when opened
  onMount(() => {
    if (findInput) findInput.focus();
  });

  // Seed the query from useFindSeed() when the bar opens with a non-empty seed
  createEffect(() => {
    if (isOpen()) {
      const seed = useFindSeed()();
      if (seed) {
        onQueryInput(seed);
      }
    }
  });

  return (
    <Show when={isOpen()}>
      <div class="find-replace-bar" onKeyDown={handleKeyDown}>
        <div class="find-row">
          <input
            ref={findInput}
            type="text"
            class="find-input"
            placeholder="Find…"
            value={query()}
            onInput={(e) => onQueryInput(e.currentTarget.value)}
            autofocus
          />
          <span class="find-count">
            {matches().length > 0
              ? `${currentIdx() + 1}/${matches().length}`
              : query()
                ? "0"
                : ""}
          </span>
          <button type="button" class="find-btn" title="Previous (Shift+Enter)" onClick={goPrev}>
            ↑
          </button>
          <button type="button" class="find-btn" title="Next (Enter)" onClick={goNext}>
            ↓
          </button>
          <button
            type="button"
            class="find-btn find-toggle"
            classList={{ active: caseSensitive() }}
            title="Case sensitive"
            onClick={() => { setCaseSensitive((v) => !v); onQueryInput(query()); }}
          >
            Aa
          </button>
          <button
            type="button"
            class="find-btn find-toggle"
            classList={{ active: useRegex() }}
            title="Regular expression"
            onClick={() => { setUseRegex((v) => !v); onQueryInput(query()); }}
          >
            .*
          </button>
          <button type="button" class="find-btn find-close" title="Close (Esc)" onClick={closeFind}>
            ×
          </button>
        </div>
        <Show when={showReplace()}>
          <div class="find-row">
            <input
              type="text"
              class="find-input"
              placeholder="Replace…"
              value={replacement()}
              onInput={(e) => setReplacement(e.currentTarget.value)}
            />
            <button type="button" class="find-btn" title="Replace" onClick={replaceCurrent}>
              Replace
            </button>
            <button type="button" class="find-btn" title="Replace all" onClick={replaceAll}>
              All
            </button>
          </div>
        </Show>
      </div>
    </Show>
  );
};
