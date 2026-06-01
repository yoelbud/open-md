# open-md Roadmap

A living backlog of features for **open-md**, a git-native Markdown workspace
for documenting code repos — and presenting that documentation to others.

The product is organized as a small set of intent-named **Modes** rather than a
flat pile of features: **Write** (draft prose), **Document** (document your
repo, git-aware), **Review** (diff/comments/proofreading), and **Present** (live
slide deck), with **Inspect** as the power/under-the-hood mode that exposes the
block-level IR. The natural journey is *open a repo/folder → Document it →
Review it against git → Present it to others.*

This file is the single place to **monitor what's shipped and what's planned**.
Unchecked items in [Planned / Backlog](#planned--backlog) are candidates — none
are a commitment until selected. To get a recommendation on what to build next,
ask the **OpenMD Feature Scout** agent (`.github/agents/feature-scout.agent.md`);
it reads this file and proposes the best next item.

Legend — **Value** ★1–5 · **Effort** S/M/L · checkbox = build status.

---

## Shipped

Core capabilities already in the product:

- **Workspace Modes switcher** — an in-app switcher between **Write**,
  **Document**, **Review**, **Present**, and **Inspect**, each presenting the
  panes and tools that fit the task.
- **Live Presentation mode** *(Present)* — present the current document as a
  fullscreen, keyboard-navigable slide deck (F5), directly from the app.
- **Three synchronized panes** *(Inspect / Document)* — Source (CodeMirror 6), IR (block JSON), editable Preview, with per-block incremental re-parse/re-render.
- **Block kinds** — heading, paragraph, list, task list, code, table, blockquote, callout/admonition, thematic break, image, raw HTML, **front matter**, **math**, unknown.
- **Rendering** — GFM (pulldown-cmark), **KaTeX math**, **Mermaid diagrams**, footnotes, syntax-highlighted code with copy affordance.
- **Inline marks** *(Write)* — highlight, foreground/background color (MarkToolbar on selection).
- **Authoring** *(Write / Document)* — Insert menu, **slash `/` command menu**, in-place preview editing, visual **table editor** (add/del row·col, align, sort), **image block** (sizing/alignment), **paste/drag image → project asset**.
- **Navigation** *(Document)* — outline panel, `[TOC]`, internal anchors, **sticky heading breadcrumb** pinned across all three panes.
- **Cross-block** — **block references / transclusion** (`^anchor`, `[[^name]]`, `![[^name]]`), **citations** (`[@key]` + bibliography), comments/annotations.
- **Review** *(Review)* — **block-level diff**, comments panel, **grammar/style proofreader**, spellcheck, word/char/reading-time stats.
- **Editing modes** — typewriter, focus, distraction-free; layout presets; pane toggles; scroll sync.
- **Find** — find & replace bar; **command palette**.
- **Interaction** — **cross-pane hover highlight**; hover previews (block-ref, citation, math LaTeX source); heading permalink affordance; IR↔Source range hover marker; **right-click context menus** (block: turn-into / copy-as / copy-reference / comment / duplicate / move / delete; table cells; text selection).
- **Files & export** *(Document)* — New/Open File/Open Folder, `.ommd` project format, save/export Markdown, **HTML**, **PDF / paged print**, **DOCX**, **slides** export; **autosave + crash recovery**; **Git integration**.
- **Appearance** — light/dark themes, **custom CSS** hook, editor font/width settings.
- **Platform** — Tauri 2 desktop shell; shared Rust engine compiled to WASM for browser preview.

---

## Planned / Backlog

Pick from here. Items are grouped by area; each has a rough value/effort and the
existing code it would leverage. Check the box when shipped. These areas map onto
the Modes — most authoring/syntax/media items deepen **Write** and **Document**,
review & knowledge items deepen **Review**, and export/interop items feed
**Present** and sharing.

### Authoring & editing
- [ ] **Inline markdown shortcuts** — type `*x*`→italic, `# `→heading as you type. ★★★★☆ · M · CodeMirror input rules.
- [ ] **Drag-to-reorder blocks** — gutter drag handle reordering (move up/down already exists). ★★★★☆ · M–L · stable block IDs.
- [ ] **Block gutter affordances** *(B6)* — hover reveals left handle: ⠿ drag · ＋ add · ⋮ menu (entry point for the block context menu). ★★★★☆ · M.
- [ ] **Autocomplete** — headings, links, `[[refs]]`, `:emoji:`, snippets. ★★★☆☆ · M.
- [ ] **Emoji** `:shortcode:` + picker. ★★★☆☆ · S.
- [ ] **Smart paste** — URL→link, TSV/CSV→table, rich-text→Markdown. ★★★★☆ · M · table editor.
- [ ] **Heading folding / collapse** in Source and Preview. ★★★☆☆ · M.
- [ ] **Live / single-pane WYSIWYG mode** — a 4th layout preset that hides syntax. ★★★☆☆ · L.

### Markdown syntax coverage
- [ ] **Sub/superscript, `~~strike~~`, `<ins>`** inline marks. ★★★☆☆ · S · existing mark set.
- [ ] **Definition lists**. ★★☆☆☆ · S–M.
- [ ] **Wikilinks `[[Note]]` + page embeds** (beyond `^anchor` block refs). ★★★☆☆ · M.
- [ ] **Custom containers / fenced divs** `::: warning` (overlaps callouts). ★★☆☆☆ · S.
- [ ] **Auto-numbered headings** (preview CSS option). ★★☆☆☆ · S.

### Tables, images & media
- [ ] **Image captions + click-to-zoom lightbox** *(B8)*. ★★★☆☆ · M · ImageBlockView.
- [ ] **Video / audio / iframe embed block** (YouTube etc.). ★★☆☆☆ · M.

### Navigation & structure
- [ ] **Cross-references / numbered figures & equations**. ★★★☆☆ · M–L · citations + auto-numbering.
- [ ] **Multi-document tabs** for multiple open files. ★★★☆☆ · M.

### Review & knowledge
- [ ] **Version timeline / block history** using content hashes. ★★★★☆ · M–L · block diff.
- [ ] **Backlinks / linked-mentions panel**. ★★★☆☆ · L · block refs.
- [ ] **Tags / properties / metadata search** (pairs with front matter). ★★★☆☆ · M.
- [ ] **Comment hover preview** *(B7)* — show the thread on hover. ★★★☆☆ · M · comments.

### Context menus (remaining)
- [ ] **Link context menu** *(A8)* — open in browser · copy address · copy text · edit link. ★★★☆☆ · M.
- [ ] **Image context menu** *(A9)* — copy image · copy path · replace · edit alt · set width. ★★★☆☆ · M · ImageBlockView.
- [ ] **Source textarea menu** *(A12)* — format selection · toggle line comment · wrap in fence · insert link · reveal in Preview. ★★★☆☆ · M · scroll sync.
- [ ] **Misspelled-word menu** *(A13)* — suggestions · add to dictionary · ignore. ★★★☆☆ · M · spellcheck.
- [ ] **IR block menu** *(A14)* — copy block id · copy `src_range` · copy as JSON. ★★☆☆☆ · S.
- [ ] **Block: page break / add to TOC** *(A7)*. ★★☆☆☆ · S · pagination.

### Export / interop
- [ ] **Copy-as rich text / HTML to clipboard** (paste into email/Docs). ★★★★☆ · S · renderer.
- [ ] **Pandoc pipeline** (any→any, incl. ODT). ★★★☆☆ · M–L.

### Appearance & i18n
- [ ] **CJK / RTL / i18n** rendering validation. ★★☆☆☆ · M.
- [ ] **Additional theme presets**. ★★☆☆☆ · S.

### Out of scope (recorded, not planned)
- Real-time collaboration (CRDT), cloud sync, web clipper, graph view, track-changes — large architectural lifts that conflict with the local-first, markdown-native direction.

---

## How to use this roadmap

1. **Monitor**: this file is the source of truth for status. Update checkboxes as features land.
2. **Get a recommendation**: ask the **OpenMD Feature Scout** agent for the best next feature (optionally with a hint like "quick win" or "improve tables"). It returns one pick with rationale and a kickoff brief.
3. **Implement**: hand the pick to the **OpenMD Maintainer** agent, which coordinates testing/linting/formatting specialists.
