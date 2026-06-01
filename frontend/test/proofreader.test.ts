import { describe, expect, it } from "vitest";
import {
  maskInlineCode,
  repeatedWord,
  aAnMisuse,
  doubleSpaces,
  spaceBeforePunctuation,
  missingSpaceAfterPunctuation,
  sentenceNotCapitalized,
  commonConfusables,
  trailingWhitespace,
  multipleExclamationQuestion,
  check,
  checkBlocks,
} from "../src/store/proofreader";
import type { Block } from "../src/ipc/types";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

const block = (over: Partial<Block>): Block => ({
  id: over.id ?? "b1",
  kind: over.kind ?? "paragraph",
  src_range: over.src_range ?? [0, 0],
  hash: over.hash ?? 0,
  source: over.source ?? "",
  html: over.html ?? "",
  plain_html: over.plain_html ?? "",
});

// ---------------------------------------------------------------------------
// maskInlineCode
// ---------------------------------------------------------------------------

describe("maskInlineCode", () => {
  it("replaces single-backtick code with spaces", () => {
    const input = "Hello `world` end";
    const result = maskInlineCode(input);
    expect(result).toBe("Hello         end");
    expect(result.length).toBe(input.length);
  });

  it("replaces double-backtick code with spaces", () => {
    const input = "Use ``foo bar`` here";
    const result = maskInlineCode(input);
    expect(result).toBe("Use             here");
    expect(result.length).toBe(input.length);
  });

  it("preserves text outside backticks", () => {
    const input = "no code here";
    expect(maskInlineCode(input)).toBe("no code here");
  });

  it("handles multiple code spans", () => {
    const input = "a `b` c `d` e";
    const result = maskInlineCode(input);
    expect(result).toBe("a     c     e");
  });
});

// ---------------------------------------------------------------------------
// repeatedWord
// ---------------------------------------------------------------------------

describe("repeatedWord", () => {
  it("detects simple repeated word", () => {
    const issues = repeatedWord("the the cat");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.rule).toBe("repeatedWord");
    expect(issues[0]!.start).toBe(0);
    expect(issues[0]!.end).toBe(7);
    expect(issues[0]!.suggestion).toBe("the");
  });

  it("is case-insensitive", () => {
    const issues = repeatedWord("The the");
    expect(issues).toHaveLength(1);
  });

  it("does not flag different words", () => {
    expect(repeatedWord("the cat")).toHaveLength(0);
  });

  it("does not flag words separated by punctuation", () => {
    expect(repeatedWord("end. The")).toHaveLength(0);
  });

  it("correct offsets for mid-text match", () => {
    const issues = repeatedWord("Hello world world end");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.start).toBe(6);
    expect(issues[0]!.end).toBe(17);
  });
});

// ---------------------------------------------------------------------------
// aAnMisuse
// ---------------------------------------------------------------------------

describe("aAnMisuse", () => {
  it("flags 'a' before vowel word", () => {
    const issues = aAnMisuse("This is a apple.");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.suggestion).toBe("an apple");
  });

  it("flags 'an' before consonant word", () => {
    const issues = aAnMisuse("an cat sat");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.suggestion).toBe("a cat");
  });

  it("does not flag correct 'a' before consonant", () => {
    expect(aAnMisuse("a cat")).toHaveLength(0);
  });

  it("does not flag correct 'an' before vowel", () => {
    expect(aAnMisuse("an apple")).toHaveLength(0);
  });

  it("handles uppercase articles", () => {
    const issues = aAnMisuse("A orange");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.suggestion).toBe("an orange");
  });

  it("correct offsets", () => {
    const issues = aAnMisuse("I ate a orange today");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.start).toBe(6);
    expect(issues[0]!.end).toBe(14);
  });
});

// ---------------------------------------------------------------------------
// doubleSpaces
// ---------------------------------------------------------------------------

describe("doubleSpaces", () => {
  it("flags double space mid-line", () => {
    const issues = doubleSpaces("hello  world");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.start).toBe(5);
    expect(issues[0]!.end).toBe(7);
    expect(issues[0]!.suggestion).toBe(" ");
  });

  it("flags triple space", () => {
    const issues = doubleSpaces("a   b");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.end - issues[0]!.start).toBe(3);
  });

  it("does not flag leading indentation", () => {
    expect(doubleSpaces("  indented text")).toHaveLength(0);
  });

  it("does not flag single space", () => {
    expect(doubleSpaces("hello world")).toHaveLength(0);
  });

  it("does not flag indentation after newline", () => {
    expect(doubleSpaces("line1\n  indented")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// spaceBeforePunctuation
// ---------------------------------------------------------------------------

describe("spaceBeforePunctuation", () => {
  it("flags space before comma", () => {
    const issues = spaceBeforePunctuation("Hello ,world");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.suggestion).toBe(",");
  });

  it("flags space before period", () => {
    const issues = spaceBeforePunctuation("end .");
    expect(issues).toHaveLength(1);
  });

  it("flags space before ! and ?", () => {
    expect(spaceBeforePunctuation("what !")).toHaveLength(1);
    expect(spaceBeforePunctuation("really ?")).toHaveLength(1);
  });

  it("does not flag normal punctuation", () => {
    expect(spaceBeforePunctuation("Hello, world.")).toHaveLength(0);
  });

  it("correct offsets", () => {
    const issues = spaceBeforePunctuation("ok ,");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.start).toBe(2);
    expect(issues[0]!.end).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// missingSpaceAfterPunctuation
// ---------------------------------------------------------------------------

describe("missingSpaceAfterPunctuation", () => {
  it("flags comma without space", () => {
    const issues = missingSpaceAfterPunctuation("hello,world");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain('Missing space after ","');
  });

  it("flags semicolon without space", () => {
    const issues = missingSpaceAfterPunctuation("one;two");
    expect(issues).toHaveLength(1);
  });

  it("flags period before uppercase (sentence boundary)", () => {
    const issues = missingSpaceAfterPunctuation("end.Next");
    expect(issues).toHaveLength(1);
  });

  it("does not flag decimals like 3.14", () => {
    expect(missingSpaceAfterPunctuation("3.14")).toHaveLength(0);
  });

  it("does not flag abbreviations like e.g.", () => {
    expect(missingSpaceAfterPunctuation("e.g.The")).toHaveLength(0);
  });

  it("does not flag normal spaced punctuation", () => {
    expect(missingSpaceAfterPunctuation("hello, world")).toHaveLength(0);
  });

  it("does not flag period before lowercase (not sentence boundary)", () => {
    // Our rule only checks [.!?] followed by UPPERCASE
    expect(missingSpaceAfterPunctuation("file.txt")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// sentenceNotCapitalized
// ---------------------------------------------------------------------------

describe("sentenceNotCapitalized", () => {
  it("flags lowercase at text start", () => {
    const issues = sentenceNotCapitalized("hello world.");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.start).toBe(0);
    expect(issues[0]!.suggestion).toBe("H");
  });

  it("flags lowercase after period + space", () => {
    const issues = sentenceNotCapitalized("Done. next thing.");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.suggestion).toBe("N");
  });

  it("flags lowercase after ! + space", () => {
    const issues = sentenceNotCapitalized("Wow! cool.");
    expect(issues).toHaveLength(1);
  });

  it("does not flag uppercase starts", () => {
    expect(sentenceNotCapitalized("Hello world.")).toHaveLength(0);
  });

  it("does not flag after period + uppercase", () => {
    expect(sentenceNotCapitalized("Done. Next thing.")).toHaveLength(0);
  });

  it("handles text starting with whitespace", () => {
    const issues = sentenceNotCapitalized("  hello");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.start).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// commonConfusables
// ---------------------------------------------------------------------------

describe("commonConfusables", () => {
  it("flags 'could of'", () => {
    const issues = commonConfusables("I could of done it.");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.suggestion).toBe("could have");
  });

  it("flags 'should of'", () => {
    const issues = commonConfusables("You should of known.");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.suggestion).toBe("should have");
  });

  it("flags 'teh'", () => {
    const issues = commonConfusables("I saw teh dog.");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.suggestion).toBe("the");
  });

  it("flags 'alot'", () => {
    const issues = commonConfusables("There are alot of them.");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.suggestion).toBe("a lot");
  });

  it("flags 'recieve'", () => {
    const issues = commonConfusables("Did you recieve it?");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.suggestion).toBe("receive");
  });

  it("flags 'definately'", () => {
    const issues = commonConfusables("I definately agree.");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.suggestion).toBe("definitely");
  });

  it("does not flag correct words", () => {
    expect(commonConfusables("I could have done it.")).toHaveLength(0);
    expect(commonConfusables("I saw the dog.")).toHaveLength(0);
    expect(commonConfusables("There are a lot of them.")).toHaveLength(0);
  });

  it("correct offsets for mid-sentence match", () => {
    const issues = commonConfusables("Well, teh end.");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.start).toBe(6);
    expect(issues[0]!.end).toBe(9);
  });
});

// ---------------------------------------------------------------------------
// trailingWhitespace
// ---------------------------------------------------------------------------

describe("trailingWhitespace", () => {
  it("flags trailing spaces", () => {
    const issues = trailingWhitespace("hello   \nworld");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.start).toBe(5);
    expect(issues[0]!.end).toBe(8);
  });

  it("flags trailing tab", () => {
    const issues = trailingWhitespace("text\t\n");
    expect(issues).toHaveLength(1);
  });

  it("does not flag no trailing whitespace", () => {
    expect(trailingWhitespace("hello\nworld")).toHaveLength(0);
  });

  it("flags multiple lines with trailing ws", () => {
    const issues = trailingWhitespace("a \nb \n");
    expect(issues).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// multipleExclamationQuestion
// ---------------------------------------------------------------------------

describe("multipleExclamationQuestion", () => {
  it("flags double exclamation", () => {
    const issues = multipleExclamationQuestion("Wow!!");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.suggestion).toBe("!");
  });

  it("flags triple question mark", () => {
    const issues = multipleExclamationQuestion("What???");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.suggestion).toBe("?");
  });

  it("does not flag single punctuation", () => {
    expect(multipleExclamationQuestion("Hello! How?")).toHaveLength(0);
  });

  it("does not flag mixed !?", () => {
    // "!?" is different chars, not repeated same char
    expect(multipleExclamationQuestion("Really!?")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// check (integrated, with inline code masking)
// ---------------------------------------------------------------------------

describe("check", () => {
  it("does not flag content inside inline code", () => {
    // "teh" inside backticks should be ignored
    const issues = check("Use `teh` variable.");
    const confusable = issues.filter((i) => i.rule === "commonConfusables");
    expect(confusable).toHaveLength(0);
  });

  it("still flags issues outside inline code", () => {
    const issues = check("I saw teh `code` here.");
    const confusable = issues.filter((i) => i.rule === "commonConfusables");
    expect(confusable).toHaveLength(1);
    expect(confusable[0]!.start).toBe(6);
    expect(confusable[0]!.end).toBe(9);
  });

  it("preserves offsets when code is masked", () => {
    // "teh" is at position 12 after "prefix `x` "
    const input = "prefix `x` teh end";
    const issues = check(input);
    const confusable = issues.filter((i) => i.rule === "commonConfusables");
    expect(confusable).toHaveLength(1);
    expect(confusable[0]!.start).toBe(11);
    expect(confusable[0]!.end).toBe(14);
    expect(input.slice(confusable[0]!.start, confusable[0]!.end)).toBe("teh");
  });

  it("returns issues sorted by start offset", () => {
    const issues = check("teh the the cat  here");
    const starts = issues.map((i) => i.start);
    const sorted = [...starts].sort((a, b) => a - b);
    expect(starts).toEqual(sorted);
  });
});

// ---------------------------------------------------------------------------
// checkBlocks
// ---------------------------------------------------------------------------

describe("checkBlocks", () => {
  it("checks prose blocks (paragraph, heading, list, block_quote, callout, task_list)", () => {
    const blocks: Block[] = [
      block({ id: "p1", kind: "paragraph", source: "I saw teh dog." }),
      block({ id: "h1", kind: "heading", source: "teh heading" }),
      block({ id: "l1", kind: "list", source: "alot of items" }),
      block({ id: "bq", kind: "block_quote", source: "could of" }),
      block({ id: "co", kind: "callout", source: "definately" }),
      block({ id: "tl", kind: "task_list", source: "recieve it" }),
    ];
    const issues = checkBlocks(blocks);
    expect(issues.length).toBeGreaterThanOrEqual(6);
    // Verify all block ids are present
    const blockIds = new Set(issues.map((i) => i.blockId));
    expect(blockIds.has("p1")).toBe(true);
    expect(blockIds.has("h1")).toBe(true);
    expect(blockIds.has("l1")).toBe(true);
    expect(blockIds.has("bq")).toBe(true);
    expect(blockIds.has("co")).toBe(true);
    expect(blockIds.has("tl")).toBe(true);
  });

  it("skips code blocks", () => {
    const blocks: Block[] = [
      block({ id: "c1", kind: "code", source: "teh = 1; alot = 2;" }),
    ];
    const issues = checkBlocks(blocks);
    expect(issues).toHaveLength(0);
  });

  it("skips math blocks", () => {
    const blocks: Block[] = [
      block({ id: "m1", kind: "math", source: "teh formula" }),
    ];
    expect(checkBlocks(blocks)).toHaveLength(0);
  });

  it("skips table blocks", () => {
    const blocks: Block[] = [
      block({ id: "t1", kind: "table", source: "teh|data" }),
    ];
    expect(checkBlocks(blocks)).toHaveLength(0);
  });

  it("skips html blocks", () => {
    const blocks: Block[] = [
      block({ id: "h1", kind: "html", source: "<div>teh</div>" }),
    ];
    expect(checkBlocks(blocks)).toHaveLength(0);
  });

  it("skips front_matter blocks", () => {
    const blocks: Block[] = [
      block({ id: "fm", kind: "front_matter", source: "title: teh thing" }),
    ];
    expect(checkBlocks(blocks)).toHaveLength(0);
  });

  it("skips image blocks", () => {
    const blocks: Block[] = [
      block({ id: "i1", kind: "image", source: "teh image" }),
    ];
    expect(checkBlocks(blocks)).toHaveLength(0);
  });

  it("tags issues with blockId and blockKind", () => {
    const blocks: Block[] = [
      block({ id: "p99", kind: "paragraph", source: "the the cat" }),
    ];
    const issues = checkBlocks(blocks);
    expect(issues[0]!.blockId).toBe("p99");
    expect(issues[0]!.blockKind).toBe("paragraph");
  });

  it("handles empty blocks gracefully", () => {
    const blocks: Block[] = [
      block({ id: "p1", kind: "paragraph", source: "" }),
    ];
    expect(checkBlocks(blocks)).toHaveLength(0);
  });
});
