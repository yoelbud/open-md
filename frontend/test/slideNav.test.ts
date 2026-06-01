import { describe, expect, it } from "vitest";
import {
  applySlideNav,
  clampSlideIndex,
  firstSlide,
  lastSlide,
  nextSlide,
  prevSlide,
  slideNavIntent,
} from "../src/panes/preview/slideNav";

describe("slideNav", () => {
  describe("clampSlideIndex", () => {
    it("clamps into [0, count - 1]", () => {
      expect(clampSlideIndex(-3, 5)).toBe(0);
      expect(clampSlideIndex(99, 5)).toBe(4);
      expect(clampSlideIndex(2, 5)).toBe(2);
    });
    it("returns 0 for empty or invalid input", () => {
      expect(clampSlideIndex(2, 0)).toBe(0);
      expect(clampSlideIndex(Number.NaN, 5)).toBe(0);
    });
    it("truncates fractional indices", () => {
      expect(clampSlideIndex(2.9, 5)).toBe(2);
    });
  });

  describe("next/prev/first/last", () => {
    it("steps forward and stops at the last slide", () => {
      expect(nextSlide(0, 3)).toBe(1);
      expect(nextSlide(2, 3)).toBe(2);
    });
    it("steps back and stops at the first slide", () => {
      expect(prevSlide(2, 3)).toBe(1);
      expect(prevSlide(0, 3)).toBe(0);
    });
    it("jumps to the edges", () => {
      expect(firstSlide()).toBe(0);
      expect(lastSlide(4)).toBe(3);
      expect(lastSlide(0)).toBe(0);
    });
  });

  describe("slideNavIntent", () => {
    it("maps forward keys to next", () => {
      for (const key of ["ArrowRight", "ArrowDown", "PageDown", " "]) {
        expect(slideNavIntent(key)).toBe("next");
      }
    });
    it("maps backward keys to prev", () => {
      for (const key of ["ArrowLeft", "ArrowUp", "PageUp"]) {
        expect(slideNavIntent(key)).toBe("prev");
      }
    });
    it("maps Home/End/Escape", () => {
      expect(slideNavIntent("Home")).toBe("first");
      expect(slideNavIntent("End")).toBe("last");
      expect(slideNavIntent("Escape")).toBe("exit");
    });
    it("returns null for unhandled keys", () => {
      expect(slideNavIntent("a")).toBeNull();
      expect(slideNavIntent("Enter")).toBeNull();
    });
  });

  describe("applySlideNav", () => {
    it("applies intents against the current index", () => {
      expect(applySlideNav("next", 0, 3)).toBe(1);
      expect(applySlideNav("prev", 2, 3)).toBe(1);
      expect(applySlideNav("first", 2, 3)).toBe(0);
      expect(applySlideNav("last", 0, 3)).toBe(2);
    });
    it("clamps the current index for null/exit intents", () => {
      expect(applySlideNav(null, 9, 3)).toBe(2);
      expect(applySlideNav("exit", 9, 3)).toBe(2);
    });
  });
});
