import { describe, expect, it } from "vitest";
import { parseDocument } from "../src/ipc/stub";

/**
 * Generate a synthetic Markdown string with approximately `numBlocks` blocks.
 */
function generateMarkdown(numBlocks: number): string {
  const parts: string[] = [];
  for (let i = 0; i < numBlocks; i++) {
    switch (i % 5) {
      case 0:
        parts.push(`${"#".repeat((i % 6) + 1)} Section ${i}\n`);
        break;
      case 1:
        parts.push(`Lorem ipsum dolor sit amet for block ${i}.\n`);
        break;
      case 2:
        parts.push(`- Item alpha ${i}\n- Item beta ${i}\n- Item gamma ${i}\n`);
        break;
      case 3:
        parts.push(`\`\`\`rust\nfn ex_${i}() {}\n\`\`\`\n`);
        break;
      case 4:
        parts.push(`| A | B |\n|---|---|\n| 1 | 2 |\n`);
        break;
    }
  }
  return parts.join("\n");
}

describe("parseDocument performance guard", () => {
  it("produces correct block count for a large document", () => {
    const source = generateMarkdown(2000);
    const result = parseDocument(source, "perf.md");

    // Each iteration produces one logical block; allow ±10% for merging.
    expect(result.blocks.length).toBeGreaterThan(2000 * 0.9);
    expect(result.blocks.length).toBeLessThan(2000 * 1.2);
  });

  it("produces deterministic hashes across two runs", () => {
    const source = generateMarkdown(1000);
    const run1 = parseDocument(source, "perf.md");
    const run2 = parseDocument(source, "perf.md");

    expect(run1.blocks.length).toBe(run2.blocks.length);
    for (let i = 0; i < run1.blocks.length; i++) {
      expect(run1.blocks[i]!.hash).toBe(run2.blocks[i]!.hash);
      expect(run1.blocks[i]!.src_range).toEqual(run2.blocks[i]!.src_range);
    }
  });

  it("does not exhibit quadratic scaling", () => {
    // Measure time for N blocks vs 2N blocks.
    // A linear algorithm should roughly double; quadratic would quadruple.
    // We use a generous ratio threshold to avoid flakiness from JIT warmup.
    const smallN = 500;
    const largeN = 2000;
    const smallSource = generateMarkdown(smallN);
    const largeSource = generateMarkdown(largeN);

    // Warmup (multiple rounds to stabilize JIT)
    for (let w = 0; w < 3; w++) {
      parseDocument(smallSource, "w.md");
      parseDocument(largeSource, "w.md");
    }

    const iterations = 5;

    const startSmall = performance.now();
    for (let i = 0; i < iterations; i++) parseDocument(smallSource, "s.md");
    const smallTime = performance.now() - startSmall;

    const startLarge = performance.now();
    for (let i = 0; i < iterations; i++) parseDocument(largeSource, "l.md");
    const largeTime = performance.now() - startLarge;

    const ratio = largeTime / Math.max(smallTime, 0.01);
    // Input is 4x larger. Linear → 4x time. Quadratic → 16x time.
    // Allow up to 8x to guard against quadratic while tolerating noise.
    expect(ratio).toBeLessThan(8);
  });

  it("completes within a generous absolute budget", () => {
    // 3000 blocks should finish well under 5 seconds even on slow CI.
    const source = generateMarkdown(3000);
    const start = performance.now();
    parseDocument(source, "budget.md");
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(5000);
  });
});
