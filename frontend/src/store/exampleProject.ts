// Bundled, in-memory "Example project" that users open explicitly from the
// Welcome screen or the File menu. Nothing here is loaded by default, so a
// fresh launch stays clean. The content works in both the browser preview and
// the desktop build because it is served from these bundled strings rather than
// the user's filesystem.

import type { Annotations, MarkRange } from "../ipc/types";
import type { ProjectFile } from "../ipc/desktop";
import { parseDocument } from "../ipc/runtime";

export const EXAMPLE_ROOT = "Example Project";

const SHOWCASE = `# Welcome to open-md

open-md is a snappy local Markdown editor with synchronized **Source**, **IR**,
and **Preview** panes that only re-render the blocks you actually change. This
page shows off everything the editor can render — including rich, *word-like*
features that live in the IR, never in your Markdown text.

Switch the Preview between **Rich** and **Markdown** with the toggle in its
toolbar: Rich shows the polished document, Markdown shows the exact standard
Markdown that gets exported.

## Rich inline text

Beyond the usual **bold**, *italic*, ~~strikethrough~~, and \`inline code\`,
open-md can highlight a phrase, tint words with any color, and paint a
colored badge — yet the exported Markdown stays perfectly clean.

The rich formatting above is stored as IR annotations (character ranges +
marks), so a plain Markdown reader sees ordinary words while open-md paints
them.

## Callouts

Callouts use GitHub's alert syntax and render as colored, iconified panels.
They are standard block quotes, so they degrade gracefully in Markdown mode.

> [!NOTE]
> Callouts are just block quotes with a \`[!KIND]\` marker, so they round-trip
> as ordinary Markdown everywhere else.

> [!TIP] Custom titles
> Add text after the marker to override the default title.

> [!IMPORTANT]
> The block kind is stored in the IR — open the IR pane to see it labelled
> \`callout\`.

> [!WARNING]
> Editing the marker line changes the callout's color and icon.

> [!CAUTION]
> Removing the marker turns it back into a plain block quote.

## Lists and tasks

1. ordered steps
2. with **inline** formatting
3. and IR-backed highlights

- bullets too
- nested ideas
- with a highlighted phrase

- [x] segmenter in Rust (\`crates/om-core\`)
- [x] per-block renderer (\`crates/om-render\`)
- [ ] your next great document

## Tables

| Feature      | Status        | Notes                         |
| :----------- | :-----------: | ----------------------------: |
| Callouts     | ✅ done       | five severities               |
| Annotations  | ✅ done       | highlight + color, in the IR  |
| Code labels  | ✅ done       | language shown in the chrome  |

## Code

\`\`\`rust
fn main() {
    // Fenced code blocks show their language in the header.
    println!("hello, open-md");
}
\`\`\`

## Diagrams

\`\`\`mermaid
graph LR
    Source --> IR
    IR --> Preview
    Preview --> Source
\`\`\`

---

> A plain block quote (no marker) still renders as a classic quote, with
> **bold**, *italic*, and a [link](https://example.com).
`;

const GETTING_STARTED = `# Getting started

This is a plain Markdown file inside the bundled **Example Project**. Open the
other files from the sidebar to explore what open-md can render.

## Try this

- Edit any line and watch only the changed block re-render.
- Press \`Ctrl+1\` to reveal the Source pane, \`Ctrl+2\` for the IR pane.
- Use **File → New Untitled** to start a clean document of your own.

When you are ready, open one of your own folders with **File → Open Folder…**.
`;

// Locate \`needle\` within a block's clean source and express it as a character
// range (matching the Rust segmenter's per-block char offsets).
const phraseRange = (
  blockSource: string,
  needle: string,
  marks: string[],
): MarkRange | null => {
  const idx = blockSource.indexOf(needle);
  if (idx < 0) return null;
  const start = Array.from(blockSource.slice(0, idx)).length;
  const end = start + Array.from(needle).length;
  return { start, end, marks };
};

// Build the showcase document's annotation layer by locating phrases in the
// (clean) block sources, so the example demonstrates IR-backed highlight and
// color without any non-standard tokens in the Markdown body.
const buildShowcaseAnnotations = (body: string): Annotations => {
  const blocks = parseDocument(body).blocks;
  const specs: { contains: string; phrases: { needle: string; marks: string[] }[] }[] = [
    {
      contains: "highlight a phrase",
      phrases: [
        { needle: "highlight a phrase", marks: ["highlight"] },
        { needle: "any color", marks: ["fg-purple"] },
        { needle: "colored badge", marks: ["fg-white", "bg-blue"] },
        { needle: "perfectly clean", marks: ["fg-green"] },
      ],
    },
    {
      contains: "with a highlighted phrase",
      phrases: [{ needle: "highlighted phrase", marks: ["highlight"] }],
    },
  ];
  const blockAnnotations = [];
  for (const spec of specs) {
    const index = blocks.findIndex((block) => block.source.includes(spec.contains));
    if (index < 0) continue;
    const blockSource = blocks[index]!.source;
    const ranges = spec.phrases
      .map((phrase) => phraseRange(blockSource, phrase.needle, phrase.marks))
      .filter((range): range is MarkRange => range !== null);
    if (ranges.length) blockAnnotations.push({ index, ranges });
  }
  return { blocks: blockAnnotations };
};

const EMPTY_ANNOTATIONS: Annotations = { blocks: [] };

export interface ExampleFile {
  relativePath: string;
  source: string;
  annotations: Annotations;
}

const exampleFile = (
  relativePath: string,
  source: string,
  annotations: Annotations,
): ExampleFile => ({ relativePath, source, annotations });

// Order matters: the first file is opened when the example project loads.
export const EXAMPLE_FILES: ExampleFile[] = [
  exampleFile("showcase.md", SHOWCASE, buildShowcaseAnnotations(SHOWCASE)),
  exampleFile("getting-started.md", GETTING_STARTED, EMPTY_ANNOTATIONS),
];

export const examplePath = (relativePath: string) => `${EXAMPLE_ROOT}/${relativePath}`;

const EXAMPLE_BY_PATH = new Map<string, ExampleFile>(
  EXAMPLE_FILES.map((file) => [examplePath(file.relativePath), file]),
);

export const EXAMPLE_PROJECT_FILES: ProjectFile[] = EXAMPLE_FILES.map((file) => ({
  path: examplePath(file.relativePath),
  relativePath: file.relativePath,
}));

export const isExamplePath = (path: string): boolean => EXAMPLE_BY_PATH.has(path);

export const getExampleFile = (path: string): ExampleFile | null =>
  EXAMPLE_BY_PATH.get(path) ?? null;
