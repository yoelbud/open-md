// Command registry for the command palette.
// Derives commands from the menu tree (menus.ts) to stay in sync automatically.
// Also exposes a pure, unit-tested fuzzy filter/ranking function.

import type { MenuDef, MenuItemDef } from "../menubar/MenuBar";

/** A command available in the palette. */
export interface Command {
  id: string;
  label: string;
  shortcut?: string;
  action: () => void;
}

/**
 * Flatten a menu tree into a flat list of runnable commands.
 * Separators are skipped; submenus are recursively expanded with a
 * "parent > child" label prefix for disambiguation.
 */
export const flattenMenus = (menus: MenuDef[]): Command[] => {
  const commands: Command[] = [];
  let counter = 0;

  const walk = (items: MenuItemDef[], prefix: string) => {
    for (const item of items) {
      if (item.kind === "sep") continue;
      if (item.kind === "sub") {
        walk(item.children, `${prefix}${item.label} > `);
        continue;
      }
      // "action" or "check"
      commands.push({
        id: `cmd-${counter++}`,
        label: `${prefix}${item.label}`,
        ...(item.shortcut ? { shortcut: item.shortcut } : {}),
        action: item.action,
      });
    }
  };

  for (const menu of menus) {
    walk(menu.items, `${menu.label}: `);
  }

  return commands;
};

/**
 * Score a command label against a query using substring/fuzzy matching.
 * Returns -1 for no match, or a non-negative score (lower is better).
 *
 * Scoring:
 * - Exact substring match at start → 0 (best)
 * - Substring match elsewhere → position index
 * - Fuzzy (all query chars appear in order) → 1000 + gap penalty
 * - No match → -1
 */
export const scoreCommand = (label: string, query: string): number => {
  if (!query) return 0;
  const lowerLabel = label.toLowerCase();
  const lowerQuery = query.toLowerCase();

  // Substring match
  const substringIdx = lowerLabel.indexOf(lowerQuery);
  if (substringIdx >= 0) return substringIdx;

  // Fuzzy: all query chars appear in order
  let labelPos = 0;
  let gaps = 0;
  for (let qi = 0; qi < lowerQuery.length; qi++) {
    const ch = lowerQuery[qi]!;
    const found = lowerLabel.indexOf(ch, labelPos);
    if (found < 0) return -1;
    gaps += found - labelPos;
    labelPos = found + 1;
  }
  return 1000 + gaps;
};

/**
 * Filter and rank commands by a query string.
 * Empty query returns all commands (sorted by label).
 * Case-insensitive. Pure function — no side effects.
 */
export const filterCommands = (commands: Command[], query: string): Command[] => {
  if (!query) return [...commands];

  const scored: { command: Command; score: number }[] = [];
  for (const command of commands) {
    const score = scoreCommand(command.label, query);
    if (score >= 0) scored.push({ command, score });
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.map((s) => s.command);
};
