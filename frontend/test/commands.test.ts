import { describe, it, expect } from "vitest";
import { filterCommands, scoreCommand, flattenMenus } from "../src/store/commands";
import type { Command } from "../src/store/commands";
import type { MenuDef } from "../src/menubar/MenuBar";

describe("scoreCommand", () => {
  it("returns 0 for empty query", () => {
    expect(scoreCommand("File: Open", "")).toBe(0);
  });

  it("scores exact prefix match as 0", () => {
    expect(scoreCommand("File: Open", "file")).toBe(0);
  });

  it("scores substring match as position index", () => {
    expect(scoreCommand("File: Open", "open")).toBe(6);
  });

  it("is case-insensitive", () => {
    expect(scoreCommand("File: OPEN", "open")).toBe(6);
    expect(scoreCommand("FILE: Open", "FILE")).toBe(0);
  });

  it("returns -1 for no match", () => {
    expect(scoreCommand("File: Open", "zzz")).toBe(-1);
  });

  it("scores fuzzy match with gap penalty", () => {
    const score = scoreCommand("File: Open", "fop");
    expect(score).toBeGreaterThanOrEqual(1000);
  });

  it("returns -1 when fuzzy chars are not all present", () => {
    expect(scoreCommand("abc", "xyz")).toBe(-1);
  });
});

describe("filterCommands", () => {
  const commands: Command[] = [
    { id: "1", label: "File: New Untitled", shortcut: "Ctrl+N", action: () => {} },
    { id: "2", label: "File: Open File…", shortcut: "Ctrl+O", action: () => {} },
    { id: "3", label: "Edit: Undo", shortcut: "Ctrl+Z", action: () => {} },
    { id: "4", label: "View: Source pane", shortcut: "Ctrl+1", action: () => {} },
    { id: "5", label: "Insert: Code block", action: () => {} },
  ];

  it("returns all commands for empty query", () => {
    const result = filterCommands(commands, "");
    expect(result).toHaveLength(commands.length);
  });

  it("filters by substring (case-insensitive)", () => {
    const result = filterCommands(commands, "undo");
    expect(result).toHaveLength(1);
    expect(result[0]!.label).toBe("Edit: Undo");
  });

  it("ranks prefix matches before later substring matches", () => {
    const result = filterCommands(commands, "file");
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0]!.label).toContain("File:");
    expect(result[1]!.label).toContain("File:");
  });

  it("returns empty array for no match", () => {
    const result = filterCommands(commands, "zzzzz");
    expect(result).toHaveLength(0);
  });

  it("handles fuzzy matching", () => {
    // "fnu" → File: New Untitled (f, n, u all present in order)
    const result = filterCommands(commands, "fnu");
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]!.label).toContain("New Untitled");
  });
});

describe("flattenMenus", () => {
  it("flattens action items with parent prefix", () => {
    const menus: MenuDef[] = [
      {
        label: "File",
        items: [
          { kind: "action", label: "New", shortcut: "Ctrl+N", action: () => {} },
          { kind: "sep" },
          { kind: "action", label: "Save", action: () => {} },
        ],
      },
    ];
    const commands = flattenMenus(menus);
    expect(commands).toHaveLength(2);
    expect(commands[0]!.label).toBe("File: New");
    expect(commands[0]!.shortcut).toBe("Ctrl+N");
    expect(commands[1]!.label).toBe("File: Save");
  });

  it("flattens check items", () => {
    const menus: MenuDef[] = [
      {
        label: "View",
        items: [
          { kind: "check", label: "Status bar", checked: () => true, action: () => {} },
        ],
      },
    ];
    const commands = flattenMenus(menus);
    expect(commands).toHaveLength(1);
    expect(commands[0]!.label).toBe("View: Status bar");
  });

  it("recurses into submenus", () => {
    const menus: MenuDef[] = [
      {
        label: "View",
        items: [
          {
            kind: "sub",
            label: "Layout presets",
            children: [
              { kind: "check", label: "Balanced", checked: () => false, action: () => {} },
            ],
          },
        ],
      },
    ];
    const commands = flattenMenus(menus);
    expect(commands).toHaveLength(1);
    expect(commands[0]!.label).toBe("View: Layout presets > Balanced");
  });

  it("skips separators", () => {
    const menus: MenuDef[] = [
      {
        label: "X",
        items: [
          { kind: "sep" },
          { kind: "sep" },
          { kind: "action", label: "A", action: () => {} },
        ],
      },
    ];
    const commands = flattenMenus(menus);
    expect(commands).toHaveLength(1);
  });
});
