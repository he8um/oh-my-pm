import { describe, expect, it } from "vitest";
import type { FilesystemEntry } from "../src/index.js";
import {
  cloneFilesystemSnapshot,
  createMemoryFilesystem,
  exampleFilesystemEntries,
} from "../src/index.js";

const entry = (path: string, content = "content"): FilesystemEntry => ({
  path,
  content,
  checksum: `sha256:${content}`,
});

describe("createMemoryFilesystem", () => {
  it("keeps the first entry when a path appears twice", () => {
    const adapter = createMemoryFilesystem([
      entry("/root/a", "first"),
      entry("/root/a", "second"),
    ]);
    expect(adapter.read("/root/a")?.content).toBe("first");
  });

  it("normalizes stored and queried paths", () => {
    const adapter = createMemoryFilesystem([entry("/root//a/")]);
    expect(adapter.exists("\\root\\a")).toBe(true);
    expect(adapter.read("/root/a")?.path).toBe("/root/a");
  });

  it("read returns a clone", () => {
    const adapter = createMemoryFilesystem([entry("/root/a")]);
    const first = adapter.read("/root/a");
    first!.content = "mutated";
    expect(adapter.read("/root/a")?.content).toBe("content");
  });

  it("list returns entries under the root sorted by path", () => {
    const adapter = createMemoryFilesystem([
      entry("/root/z"),
      entry("/root/a"),
      entry("/other/b"),
      entry("/rootless"),
    ]);
    expect(adapter.list("/root").entries.map((e) => e.path)).toEqual(["/root/a", "/root/z"]);
  });

  it("exists reports stored and missing paths", () => {
    const adapter = createMemoryFilesystem([entry("/root/a")]);
    expect(adapter.exists("/root/a")).toBe(true);
    expect(adapter.exists("/root/missing")).toBe(false);
  });

  it("is unaffected by later mutation of caller input", () => {
    const input = [entry("/root/a")];
    const adapter = createMemoryFilesystem(input);
    input[0].content = "mutated";
    input[0].path = "/root/mutated";
    expect(adapter.read("/root/a")?.content).toBe("content");
  });

  it("works with the example fixture entries", () => {
    const adapter = createMemoryFilesystem(exampleFilesystemEntries());
    expect(adapter.exists("/tmp/oh-my-pm/bin/oh-my-pm")).toBe(true);
    expect(adapter.list("/tmp/oh-my-pm").entries).toHaveLength(2);
  });
});

describe("cloneFilesystemSnapshot", () => {
  it("returns detached entry clones", () => {
    const snapshot = { entries: [entry("/root/a")] };
    const cloned = cloneFilesystemSnapshot(snapshot);
    cloned.entries[0].content = "mutated";
    expect(snapshot.entries[0].content).toBe("content");
  });
});
