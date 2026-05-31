/**
 * Proofreader — a lightweight, dependency-free, heuristic rule-based style/writing checker.
 *
 * This is NOT a full grammar engine. It flags common writing issues (repeated words,
 * a/an misuse, spacing errors, common typos, capitalization) using simple pattern rules.
 * False positives are minimized by conservative heuristics; see per-rule documentation.
 *
 * Deliberately OMITTED high-false-positive rules:
 * - its/it's detection (requires deep syntactic understanding)
 * - your/you're detection (same reason)
 * - passive voice (too context-dependent)
 * - comma splices (requires clause parsing)
 *
 * INCLUDED rules (all low-false-positive):
 * - repeatedWord: flags "the the", "is is" etc.
 * - aAnMisuse: flags "a apple" / "an cat" using vowel-letter heuristic
 * - doubleSpaces: multiple spaces between words
 * - spaceBeforePunctuation: " ," / " ." / " !" / " ?"
 * - missingSpaceAfterPunctuation: "word,next" (excludes decimals, URLs, abbreviations)
 * - sentenceNotCapitalized: lowercase after sentence-ending punctuation
 * - commonConfusables: "could of" → "could have", "teh" → "the", etc.
 * - trailingWhitespace: spaces/tabs at end of lines
 * - multipleExclamationQuestion: "!!" / "??"
 */

import type { Block, BlockKind } from "../ipc/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type IssueSeverity = "error" | "warning" | "suggestion";

export interface Issue {
  rule: string;
  severity: IssueSeverity;
  start: number;
  end: number;
  message: string;
  suggestion?: string;
  snippet: string;
}

export interface IssueWithBlock extends Issue {
  blockId: string;
  blockKind: BlockKind;
}

// ---------------------------------------------------------------------------
// Rule type
// ---------------------------------------------------------------------------

export type Rule = (text: string) => Issue[];

// ---------------------------------------------------------------------------
// Inline-code masking
// ---------------------------------------------------------------------------

/**
 * Replace inline code spans (backtick-delimited) with spaces of equal length
 * so character offsets remain valid but code content is not flagged.
 */
export function maskInlineCode(text: string): string {
  // Handles both single and double backtick spans: `code` or ``code``
  return text.replace(/(`{1,2})([^`]*?)\1/g, (match) => " ".repeat(match.length));
}

// ---------------------------------------------------------------------------
// Individual rules
// ---------------------------------------------------------------------------

/**
 * Repeated word: "the the" flagged as warning.
 * Known legitimate doubles (e.g. "had had", "that that") are still flagged
 * as warnings — documented design choice to keep logic simple.
 */
export const repeatedWord: Rule = (text) => {
  const issues: Issue[] = [];
  const re = /\b(\w+)\s+\1\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const word = m[1]!;
    issues.push({
      rule: "repeatedWord",
      severity: "warning",
      start: m.index,
      end: m.index + m[0].length,
      message: `Repeated word: "${word}"`,
      suggestion: word,
      snippet: m[0],
    });
  }
  return issues;
};

/**
 * a/an misuse using vowel-letter heuristic (a,e,i,o,u at start of next word).
 * Known limitation: "an hour" / "a university" not perfectly handled (would need
 * phonetic dictionary). Documents this tradeoff.
 */
export const aAnMisuse: Rule = (text) => {
  const issues: Issue[] = [];
  // Match "a <vowel-word>" or "an <consonant-word>" at word boundaries
  const re = /\b(a|an)\s+([a-zA-Z]\w*)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const article = m[1]!.toLowerCase();
    const nextWord = m[2]!;
    const startsWithVowel = /^[aeiouAEIOU]/.test(nextWord);

    if (article === "a" && startsWithVowel) {
      issues.push({
        rule: "aAnMisuse",
        severity: "warning",
        start: m.index,
        end: m.index + m[0].length,
        message: `Use "an" before "${nextWord}" (starts with a vowel)`,
        suggestion: `an ${nextWord}`,
        snippet: m[0],
      });
    } else if (article === "an" && !startsWithVowel) {
      issues.push({
        rule: "aAnMisuse",
        severity: "warning",
        start: m.index,
        end: m.index + m[0].length,
        message: `Use "a" before "${nextWord}" (starts with a consonant)`,
        suggestion: `a ${nextWord}`,
        snippet: m[0],
      });
    }
  }
  return issues;
};

/** Double spaces between words → suggest single space. */
export const doubleSpaces: Rule = (text) => {
  const issues: Issue[] = [];
  const re = / {2,}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    // Skip if at start of line (indentation) — only flag mid-line
    const before = text.lastIndexOf("\n", m.index - 1);
    const lineStart = before === -1 ? 0 : before + 1;
    const prefix = text.slice(lineStart, m.index);
    if (prefix.length === 0) continue; // at line start = indentation

    issues.push({
      rule: "doubleSpaces",
      severity: "suggestion",
      start: m.index,
      end: m.index + m[0].length,
      message: "Multiple spaces; use a single space",
      suggestion: " ",
      snippet: m[0],
    });
  }
  return issues;
};

/** Space before punctuation: " ," / " ." / " !" / " ?" */
export const spaceBeforePunctuation: Rule = (text) => {
  const issues: Issue[] = [];
  const re = / ([,.!?])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const punct = m[1]!;
    // Skip ellipsis patterns: don't flag ". . ."
    if (punct === "." && m.index > 0 && text[m.index - 1] === ".") continue;
    issues.push({
      rule: "spaceBeforePunctuation",
      severity: "warning",
      start: m.index,
      end: m.index + m[0].length,
      message: `Unexpected space before "${punct}"`,
      suggestion: punct,
      snippet: m[0],
    });
  }
  return issues;
};

/**
 * Missing space after punctuation: "word,next" / "end.Next"
 * Excludes: decimals (3.14), URLs (example.com), ellipses (...),
 * common abbreviations (e.g., i.e., etc., Mr., Dr., vs., approx.),
 * and digit-adjacent cases.
 */
export const missingSpaceAfterPunctuation: Rule = (text) => {
  const issues: Issue[] = [];
  // Match letter followed by [,;:] or [.!?] followed by uppercase letter
  // Pattern: punctuation between two letters without space
  const re = /([a-zA-Z])([,;])([a-zA-Z])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const punct = m[2]!;
    issues.push({
      rule: "missingSpaceAfterPunctuation",
      severity: "warning",
      start: m.index + 1,
      end: m.index + 3,
      message: `Missing space after "${punct}"`,
      suggestion: `${punct} `,
      snippet: m[0],
    });
  }

  // Period/exclamation/question followed by uppercase (sentence boundary)
  const re2 = /([a-zA-Z])([.!?])([A-Z])/g;
  while ((m = re2.exec(text)) !== null) {
    const punct = m[2]!;
    // Skip common abbreviations before period
    const beforePunct = m.index;
    const lineStart = text.lastIndexOf("\n", beforePunct - 1) + 1;
    const prefix = text.slice(lineStart, beforePunct + 1);
    const abbrevs = /(?:e\.g|i\.e|etc|Mr|Dr|Ms|Mrs|vs|approx|Prof|Inc|Jr|Sr|St|Vol|dept|govt)$/i;
    if (punct === "." && abbrevs.test(prefix)) continue;

    issues.push({
      rule: "missingSpaceAfterPunctuation",
      severity: "warning",
      start: m.index + 1,
      end: m.index + 3,
      message: `Missing space after "${punct}"`,
      suggestion: `${punct} `,
      snippet: m[0],
    });
  }
  return issues;
};

/**
 * Sentence not capitalized: after ". ! ?" + space(s) or at text start,
 * a lowercase letter begins the "sentence".
 * Excludes: after abbreviations ending with period (already hard to detect,
 * so we skip single-letter + period patterns like "e.g. the").
 */
export const sentenceNotCapitalized: Rule = (text) => {
  const issues: Issue[] = [];

  // At text start
  const firstLetter = text.match(/^(\s*)([a-z])/);
  if (firstLetter) {
    const pos = firstLetter[1]!.length;
    const ch = text.charAt(pos);
    issues.push({
      rule: "sentenceNotCapitalized",
      severity: "suggestion",
      start: pos,
      end: pos + 1,
      message: "Sentence should start with a capital letter",
      suggestion: ch.toUpperCase(),
      snippet: ch,
    });
  }

  // After sentence-ending punctuation + space(s) (or newline)
  const re = /[.!?][\s]+([a-z])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const dotPos = m.index;
    const dotChar = text.charAt(dotPos);
    if (dotPos >= 2 && dotChar === "." && text.charAt(dotPos - 2) === ".") continue; // ellipsis
    // Check for abbreviation: single letter before period (like "e.g.")
    if (dotPos >= 1 && dotChar === "." && /^[a-zA-Z]$/.test(text.charAt(dotPos - 1))) {
      if (dotPos >= 2 && text.charAt(dotPos - 2) === ".") continue; // "e.g." pattern
    }

    const letter = m[1]!;
    const charPos = m.index + m[0].length - 1;
    issues.push({
      rule: "sentenceNotCapitalized",
      severity: "suggestion",
      start: charPos,
      end: charPos + 1,
      message: "Sentence should start with a capital letter",
      suggestion: letter.toUpperCase(),
      snippet: letter,
    });
  }
  return issues;
};

/**
 * Common confusables / typos — a conservative map of very-low-false-positive
 * corrections. Each entry is [pattern, replacement, message].
 */
const CONFUSABLES: [RegExp, string, string][] = [
  [/\bcould of\b/gi, "could have", '"could of" → "could have"'],
  [/\bshould of\b/gi, "should have", '"should of" → "should have"'],
  [/\bwould of\b/gi, "would have", '"would of" → "would have"'],
  [/\bteh\b/g, "the", '"teh" → "the"'],
  [/\balot\b/gi, "a lot", '"alot" → "a lot"'],
  [/\brecieve\b/gi, "receive", '"recieve" → "receive"'],
  [/\bdefinately\b/gi, "definitely", '"definately" → "definitely"'],
  [/\bseperate\b/gi, "separate", '"seperate" → "separate"'],
  [/\boccured\b/gi, "occurred", '"occured" → "occurred"'],
  [/\buntill\b/gi, "until", '"untill" → "until"'],
];

export const commonConfusables: Rule = (text) => {
  const issues: Issue[] = [];
  for (const [pattern, replacement, message] of CONFUSABLES) {
    // Reset lastIndex for global regexes
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      issues.push({
        rule: "commonConfusables",
        severity: "error",
        start: m.index,
        end: m.index + m[0].length,
        message,
        suggestion: replacement,
        snippet: m[0],
      });
    }
  }
  return issues;
};

/** Trailing whitespace at end of lines (suggestion severity). */
export const trailingWhitespace: Rule = (text) => {
  const issues: Issue[] = [];
  const re = /[ \t]+$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    issues.push({
      rule: "trailingWhitespace",
      severity: "suggestion",
      start: m.index,
      end: m.index + m[0].length,
      message: "Trailing whitespace",
      suggestion: "",
      snippet: m[0],
    });
  }
  return issues;
};

/** Multiple exclamation/question marks "!!" / "??" (suggestion). */
export const multipleExclamationQuestion: Rule = (text) => {
  const issues: Issue[] = [];
  const re = /([!?])\1+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const ch = m[1]!;
    issues.push({
      rule: "multipleExclamationQuestion",
      severity: "suggestion",
      start: m.index,
      end: m.index + m[0].length,
      message: `Multiple "${ch}" marks; consider using one`,
      suggestion: ch,
      snippet: m[0],
    });
  }
  return issues;
};

// ---------------------------------------------------------------------------
// All rules composed
// ---------------------------------------------------------------------------

export const ALL_RULES: Rule[] = [
  repeatedWord,
  aAnMisuse,
  doubleSpaces,
  spaceBeforePunctuation,
  missingSpaceAfterPunctuation,
  sentenceNotCapitalized,
  commonConfusables,
  trailingWhitespace,
  multipleExclamationQuestion,
];

// ---------------------------------------------------------------------------
// Main check function
// ---------------------------------------------------------------------------

/**
 * Run all proofreading rules on a prose text string.
 * Masks inline code spans before checking (preserves offsets).
 */
export function check(text: string): Issue[] {
  const masked = maskInlineCode(text);
  const issues: Issue[] = [];
  for (const rule of ALL_RULES) {
    issues.push(...rule(masked));
  }
  // Sort by start offset
  issues.sort((a, b) => a.start - b.start);
  return issues;
}

// ---------------------------------------------------------------------------
// Block-level checking
// ---------------------------------------------------------------------------

/** Block kinds that contain prose and should be checked. */
const PROSE_KINDS: Set<BlockKind> = new Set([
  "heading",
  "paragraph",
  "list",
  "block_quote",
  "callout",
  "task_list",
]);

/**
 * Run proofreading on prose blocks only, skipping code/math/table/html/
 * front_matter/image/thematic_break/unknown blocks.
 * Each returned issue is tagged with the block id and kind.
 */
export function checkBlocks(blocks: Block[]): IssueWithBlock[] {
  const results: IssueWithBlock[] = [];
  for (const block of blocks) {
    if (!PROSE_KINDS.has(block.kind)) continue;
    const issues = check(block.source);
    for (const issue of issues) {
      results.push({
        ...issue,
        blockId: block.id,
        blockKind: block.kind,
      });
    }
  }
  return results;
}
