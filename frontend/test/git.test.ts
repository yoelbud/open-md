import { describe, it, expect } from "vitest";
import { describeGitStatus } from "../src/store/git";

describe("describeGitStatus", () => {
  it("returns Clean for null", () => {
    expect(describeGitStatus(null)).toBe("Clean");
  });

  it("returns Clean for empty string", () => {
    expect(describeGitStatus("")).toBe("Clean");
  });

  it("returns Modified for ' M'", () => {
    expect(describeGitStatus(" M")).toBe("Modified");
  });

  it("returns Modified for 'MM'", () => {
    expect(describeGitStatus("MM")).toBe("Modified");
  });

  it("returns Untracked for '??'", () => {
    expect(describeGitStatus("??")).toBe("Untracked");
  });

  it("returns Added for 'A '", () => {
    expect(describeGitStatus("A ")).toBe("Added");
  });

  it("returns Added for 'AM'", () => {
    expect(describeGitStatus("AM")).toBe("Added");
  });

  it("returns Deleted for ' D'", () => {
    expect(describeGitStatus(" D")).toBe("Deleted");
  });

  it("returns Renamed for 'R '", () => {
    expect(describeGitStatus("R ")).toBe("Renamed");
  });

  it("returns Changed for unknown code", () => {
    expect(describeGitStatus("UU")).toBe("Changed");
  });
});
