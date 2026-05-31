import { describe, expect, it } from "vitest";
import type { Block } from "../src/ipc/types";
import {
  parseBibtex,
  extractBibliography,
  extractBibSource,
  isBibBlock,
  formatAuthorSurnames,
  formatInlineCitation,
  formatReference,
  findCitationTokens,
  replaceCitationTokens,
  isBibliographyToken,
  renderReferencesHtml,
  type BibEntry,
} from "../src/store/citations";

const block = (over: Partial<Block>): Block => ({
  id: over.id ?? "b1",
  kind: over.kind ?? "paragraph",
  src_range: over.src_range ?? [0, 0],
  hash: over.hash ?? 0,
  source: over.source ?? "",
  html: over.html ?? "",
  plain_html: over.plain_html ?? "",
});

// ─── parseBibtex ─────────────────────────────────────────────────────────────

describe("parseBibtex", () => {
  it("parses a single entry with braced values", () => {
    const bib = `@article{smith2020,
      author = {Smith, John},
      title = {On Things},
      year = {2020},
      journal = {J. Stuff}
    }`;
    const result = parseBibtex(bib);
    expect(result.size).toBe(1);
    const entry = result.get("smith2020")!;
    expect(entry.type).toBe("article");
    expect(entry.key).toBe("smith2020");
    expect(entry.fields["author"]).toBe("Smith, John");
    expect(entry.fields["title"]).toBe("On Things");
    expect(entry.fields["year"]).toBe("2020");
    expect(entry.fields["journal"]).toBe("J. Stuff");
  });

  it("parses quoted values", () => {
    const bib = `@book{knuth1984,
      author = "Knuth, Donald E.",
      title = "The TeXbook",
      year = "1984",
      publisher = "Addison-Wesley"
    }`;
    const result = parseBibtex(bib);
    expect(result.size).toBe(1);
    const entry = result.get("knuth1984")!;
    expect(entry.fields["author"]).toBe("Knuth, Donald E.");
    expect(entry.fields["publisher"]).toBe("Addison-Wesley");
  });

  it("parses multiple entries", () => {
    const bib = `
@article{alpha, author={A}, title={T1}, year={2001}}
@inproceedings{beta, author={B}, title={T2}, year={2002}}
    `;
    const result = parseBibtex(bib);
    expect(result.size).toBe(2);
    expect(result.has("alpha")).toBe(true);
    expect(result.has("beta")).toBe(true);
    expect(result.get("beta")!.type).toBe("inproceedings");
  });

  it("handles messy whitespace and newlines", () => {
    const bib = `
    @article{  messy2023  ,
      author   =   { Doe, Jane  },
      title={
        A Multiline
        Title
      },
      year =  {2023}
    }`;
    const result = parseBibtex(bib);
    expect(result.size).toBe(1);
    const entry = result.get("messy2023")!;
    expect(entry.fields["author"]).toBe("Doe, Jane");
    expect(entry.fields["title"]).toContain("Multiline");
    expect(entry.fields["year"]).toBe("2023");
  });

  it("handles bare numeric values", () => {
    const bib = `@misc{bare, author={X}, year=2024}`;
    const result = parseBibtex(bib);
    expect(result.get("bare")!.fields["year"]).toBe("2024");
  });

  it("handles missing fields gracefully", () => {
    const bib = `@misc{minimal, title={Only Title}}`;
    const result = parseBibtex(bib);
    const entry = result.get("minimal")!;
    expect(entry.fields["title"]).toBe("Only Title");
    expect(entry.fields["author"]).toBeUndefined();
  });

  it("handles nested braces in field values", () => {
    const bib = `@article{nested, title={{A {Nested} Title}}, year={2020}}`;
    const result = parseBibtex(bib);
    expect(result.get("nested")!.fields["title"]).toBe("{A {Nested} Title}");
  });

  it("returns empty map for empty or garbage input", () => {
    expect(parseBibtex("").size).toBe(0);
    expect(parseBibtex("not bibtex at all").size).toBe(0);
  });

  it("handles url field", () => {
    const bib = `@misc{web, author={Web}, url={https://example.com/path?q=1}, year={2024}}`;
    const result = parseBibtex(bib);
    expect(result.get("web")!.fields["url"]).toBe("https://example.com/path?q=1");
  });
});

// ─── isBibBlock & extractBibSource ───────────────────────────────────────────

describe("isBibBlock", () => {
  it("detects code blocks with bib info string", () => {
    expect(isBibBlock(block({ kind: "code", source: "```bib\n@article{}\n```" }))).toBe(true);
    expect(isBibBlock(block({ kind: "code", source: "```bibliography\n@article{}\n```" }))).toBe(true);
  });

  it("rejects other code blocks", () => {
    expect(isBibBlock(block({ kind: "code", source: "```javascript\ncode\n```" }))).toBe(false);
    expect(isBibBlock(block({ kind: "paragraph", source: "```bib\n```" }))).toBe(false);
  });
});

describe("extractBibSource", () => {
  it("strips fences from a bib code block", () => {
    const src = "```bib\n@article{k, author={A}}\n```";
    const result = extractBibSource(block({ kind: "code", source: src }));
    expect(result).toBe("@article{k, author={A}}");
  });

  it("handles blocks without trailing fence", () => {
    const src = "```bib\n@article{k, author={A}}";
    const result = extractBibSource(block({ kind: "code", source: src }));
    expect(result).toBe("@article{k, author={A}}");
  });
});

// ─── extractBibliography ─────────────────────────────────────────────────────

describe("extractBibliography", () => {
  it("builds registry from bib blocks", () => {
    const blocks: Block[] = [
      block({ kind: "paragraph", source: "Some text" }),
      block({
        kind: "code",
        source: "```bib\n@article{a1, author={Smith}, year={2020}}\n```",
      }),
      block({
        kind: "code",
        source: "```bibliography\n@book{b1, author={Jones}, year={2019}}\n```",
      }),
    ];
    const reg = extractBibliography(blocks);
    expect(reg.size).toBe(2);
    expect(reg.get("a1")!.fields["author"]).toBe("Smith");
    expect(reg.get("b1")!.fields["author"]).toBe("Jones");
  });

  it("returns empty map when no bib blocks exist", () => {
    const blocks: Block[] = [block({ kind: "paragraph", source: "hello" })];
    expect(extractBibliography(blocks).size).toBe(0);
  });
});

// ─── formatAuthorSurnames ────────────────────────────────────────────────────

describe("formatAuthorSurnames", () => {
  it("extracts surname from 'Last, First' format", () => {
    expect(formatAuthorSurnames("Smith, John")).toBe("Smith");
  });

  it("extracts surname from 'First Last' format", () => {
    expect(formatAuthorSurnames("John Smith")).toBe("Smith");
  });

  it("handles two authors", () => {
    expect(formatAuthorSurnames("Smith, J. and Jones, B.")).toBe("Smith & Jones");
  });

  it("handles three+ authors with et al.", () => {
    expect(formatAuthorSurnames("A, X and B, Y and C, Z")).toBe("A et al.");
  });

  it("returns ?? for empty author", () => {
    expect(formatAuthorSurnames("")).toBe("??");
  });
});

// ─── formatInlineCitation ────────────────────────────────────────────────────

describe("formatInlineCitation", () => {
  const entry: BibEntry = {
    type: "article",
    key: "smith2020",
    fields: { author: "Smith, John", year: "2020" },
  };

  it("formats basic author-year", () => {
    expect(formatInlineCitation(entry)).toBe("Smith, 2020");
  });

  it("includes locator when provided", () => {
    expect(formatInlineCitation(entry, "p. 12")).toBe("Smith, 2020, p. 12");
  });

  it("handles missing year", () => {
    const noYear: BibEntry = { type: "misc", key: "x", fields: { author: "Doe" } };
    expect(formatInlineCitation(noYear)).toBe("Doe, n.d.");
  });
});

// ─── formatReference ─────────────────────────────────────────────────────────

describe("formatReference", () => {
  it("formats a basic reference", () => {
    const entry: BibEntry = {
      type: "article",
      key: "smith2020",
      fields: { author: "Smith, J.", title: "On Things", year: "2020", journal: "J. Stuff" },
    };
    const ref = formatReference(entry);
    expect(ref).toContain("Smith, J. (2020).");
    expect(ref).toContain("On Things.");
    expect(ref).toContain("J. Stuff");
  });

  it("includes URL as link", () => {
    const entry: BibEntry = {
      type: "misc",
      key: "web",
      fields: { author: "W", title: "T", year: "2024", url: "https://x.com" },
    };
    const ref = formatReference(entry);
    expect(ref).toContain('href="https://x.com"');
  });
});

// ─── findCitationTokens ─────────────────────────────────────────────────────

describe("findCitationTokens", () => {
  it("finds a single citation", () => {
    const tokens = findCitationTokens("See [@smith2020] for details.");
    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.refs).toHaveLength(1);
    expect(tokens[0]!.refs[0]!.key).toBe("smith2020");
    expect(tokens[0]!.refs[0]!.locator).toBeUndefined();
  });

  it("finds citation with locator", () => {
    const tokens = findCitationTokens("[@smith2020, p. 12]");
    expect(tokens[0]!.refs[0]!.key).toBe("smith2020");
    expect(tokens[0]!.refs[0]!.locator).toBe("p. 12");
  });

  it("finds multiple citations separated by semicolons", () => {
    const tokens = findCitationTokens("[@a; @b]");
    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.refs).toHaveLength(2);
    expect(tokens[0]!.refs[0]!.key).toBe("a");
    expect(tokens[0]!.refs[1]!.key).toBe("b");
  });

  it("handles multiple with locators", () => {
    const tokens = findCitationTokens("[@a, p. 5; @b]");
    expect(tokens[0]!.refs[0]!.locator).toBe("p. 5");
    expect(tokens[0]!.refs[1]!.locator).toBeUndefined();
  });

  it("returns empty for text without citations", () => {
    expect(findCitationTokens("no citations here")).toHaveLength(0);
  });

  it("ignores markdown links that don't contain @", () => {
    expect(findCitationTokens("[link](url)")).toHaveLength(0);
  });
});

// ─── replaceCitationTokens ───────────────────────────────────────────────────

describe("replaceCitationTokens", () => {
  const registry = new Map<string, BibEntry>([
    ["smith2020", { type: "article", key: "smith2020", fields: { author: "Smith, J.", year: "2020" } }],
  ]);

  it("replaces resolved citation with linked marker", () => {
    const cited: string[] = [];
    const result = replaceCitationTokens(
      "<p>See [@smith2020] for details.</p>",
      registry,
      (k) => cited.push(k),
    );
    expect(result).toContain('href="#cite-smith2020"');
    expect(result).toContain("Smith, 2020");
    expect(result).toContain("om-cite");
    expect(cited).toEqual(["smith2020"]);
  });

  it("marks unknown keys with missing class", () => {
    const result = replaceCitationTokens(
      "<p>[@unknown]</p>",
      registry,
      () => {},
    );
    expect(result).toContain("om-cite-missing");
    expect(result).toContain("[@unknown?]");
  });

  it("skips citations inside <code> elements", () => {
    const result = replaceCitationTokens(
      "<p>text <code>[@smith2020]</code> end</p>",
      registry,
      () => {},
    );
    expect(result).toContain("<code>[@smith2020]</code>");
    expect(result).not.toContain("om-cite");
  });

  it("skips citations inside <pre> elements", () => {
    const result = replaceCitationTokens(
      "<pre>[@smith2020]</pre>",
      registry,
      () => {},
    );
    expect(result).toContain("<pre>[@smith2020]</pre>");
  });

  it("handles multiple citations in one token", () => {
    const reg = new Map<string, BibEntry>([
      ["a", { type: "article", key: "a", fields: { author: "Alpha", year: "2001" } }],
      ["b", { type: "article", key: "b", fields: { author: "Beta", year: "2002" } }],
    ]);
    const cited: string[] = [];
    const result = replaceCitationTokens("<p>[@a; @b]</p>", reg, (k) => cited.push(k));
    expect(cited).toEqual(["a", "b"]);
    expect(result).toContain("Alpha, 2001");
    expect(result).toContain("Beta, 2002");
  });
});

// ─── isBibliographyToken ─────────────────────────────────────────────────────

describe("isBibliographyToken", () => {
  it("detects [bibliography] paragraph", () => {
    expect(isBibliographyToken(block({ kind: "paragraph", source: "[bibliography]" }))).toBe(true);
    expect(isBibliographyToken(block({ kind: "paragraph", source: "[references]" }))).toBe(true);
    expect(isBibliographyToken(block({ kind: "paragraph", source: "  [References]  " }))).toBe(true);
  });

  it("rejects non-matching blocks", () => {
    expect(isBibliographyToken(block({ kind: "paragraph", source: "see [references] here" }))).toBe(false);
    expect(isBibliographyToken(block({ kind: "heading", source: "[references]" }))).toBe(false);
  });
});

// ─── renderReferencesHtml ────────────────────────────────────────────────────

describe("renderReferencesHtml", () => {
  const registry = new Map<string, BibEntry>([
    ["b", { type: "book", key: "b", fields: { author: "Zeta, Z.", title: "Book B", year: "2022" } }],
    ["a", { type: "article", key: "a", fields: { author: "Alpha, A.", title: "Article A", year: "2021" } }],
    ["c", { type: "misc", key: "c", fields: { author: "Gamma", title: "Thing C", year: "2020" } }],
  ]);

  it("renders only cited entries", () => {
    const cited = new Set(["a", "b"]);
    const html = renderReferencesHtml(registry, cited);
    expect(html).toContain("Article A");
    expect(html).toContain("Book B");
    expect(html).not.toContain("Thing C");
  });

  it("sorts entries by author then year", () => {
    const cited = new Set(["a", "b"]);
    const html = renderReferencesHtml(registry, cited);
    const aPos = html.indexOf("Alpha");
    const bPos = html.indexOf("Zeta");
    expect(aPos).toBeLessThan(bPos);
  });

  it("uses cite-key anchors", () => {
    const cited = new Set(["a"]);
    const html = renderReferencesHtml(registry, cited);
    expect(html).toContain('id="cite-a"');
    expect(html).toContain("om-reference");
  });

  it("renders empty message when no citations", () => {
    const html = renderReferencesHtml(registry, new Set());
    expect(html).toContain("No cited references");
  });

  it("wraps in om-references section", () => {
    const html = renderReferencesHtml(registry, new Set(["a"]));
    expect(html).toContain('class="om-references"');
    expect(html).toContain("References");
  });
});
