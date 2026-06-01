import { describe, expect, it, beforeEach } from "vitest";
import {
  closeProject,
  newDocument,
  openExampleProject,
  openProjectFile,
  resetLayout,
  useActiveProjectFile,
  useIsWelcome,
  usePath,
  useProjectFiles,
  useProjectRoot,
  useSetSource,
  useSource,
} from "../src/store/document";
import { EXAMPLE_ROOT, examplePath, EXAMPLE_FILES } from "../src/store/exampleProject";
import { clearRecents, useRecents } from "../src/store/recents";

const setSource = useSetSource();
const isWelcome = useIsWelcome();

beforeEach(() => {
  resetLayout();
  closeProject();
  newDocument();
  clearRecents();
});

describe("welcome state", () => {
  it("is welcome on a fresh, empty, untitled document with no project", () => {
    expect(isWelcome()).toBe(true);
  });

  it("is not welcome once the document has content", () => {
    setSource("# hello\n");
    expect(isWelcome()).toBe(false);
  });

  it("is not welcome once an example project is opened", () => {
    openExampleProject();
    expect(isWelcome()).toBe(false);
  });
});

describe("example project", () => {
  it("opens an in-memory example project and loads its first file", () => {
    openExampleProject();

    expect(useProjectRoot()()).toBe(EXAMPLE_ROOT);
    expect(useProjectFiles()().length).toBe(EXAMPLE_FILES.length);

    const firstPath = examplePath(EXAMPLE_FILES[0]!.relativePath);
    expect(useActiveProjectFile()()).toBe(firstPath);
    expect(usePath()()).toBe(firstPath);
    expect(useSource()()).toBe(EXAMPLE_FILES[0]!.source);
  });

  it("opens a different example file from the project without filesystem access", async () => {
    openExampleProject();
    const second = EXAMPLE_FILES[1]!;
    const secondPath = examplePath(second.relativePath);

    await openProjectFile({ path: secondPath, relativePath: second.relativePath });

    expect(usePath()()).toBe(secondPath);
    expect(useSource()()).toBe(second.source);
    expect(useActiveProjectFile()()).toBe(secondPath);
  });

  it("records the opened example in recents", () => {
    openExampleProject();
    const recents = useRecents()();
    expect(recents.length).toBeGreaterThan(0);
    expect(recents[0]!.kind).toBe("example");
    expect(recents[0]!.path).toBe(examplePath(EXAMPLE_FILES[0]!.relativePath));
  });
});

describe("clean defaults", () => {
  it("starts with an empty, untitled document (no bundled showcase)", () => {
    expect(useSource()()).toBe("");
    expect(usePath()()).toBe("(untitled).md");
  });
});
