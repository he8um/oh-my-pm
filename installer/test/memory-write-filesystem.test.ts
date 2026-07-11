import { describe, expect, it } from "vitest";
import { createMemoryWriteFilesystem } from "../src/index.js";

const existing = { path: "/root/a.txt", content: "old", checksum: "sha256:old" };

describe("createMemoryWriteFilesystem", () => {
  it("creates a missing file", () => {
    const writer = createMemoryWriteFilesystem();
    const result = writer.writeFile({ path: "/root/new.txt", content: "new", checksum: "sha256:new" });
    expect(result).toEqual({ kind: "create", path: "/root/new.txt", ok: true, checksum: "sha256:new" });
    expect(writer.snapshot().entries).toEqual([
      { path: "/root/new.txt", content: "new", checksum: "sha256:new" },
    ]);
  });

  it("replaces an existing file", () => {
    const writer = createMemoryWriteFilesystem([existing]);
    const result = writer.writeFile({ path: "/root//a.txt", content: "new", checksum: "sha256:new" });
    expect(result.kind).toBe("replace");
    expect(result.ok).toBe(true);
    expect(writer.snapshot().entries).toEqual([
      { path: "/root/a.txt", content: "new", checksum: "sha256:new" },
    ]);
  });

  it("removes an existing file and fails for missing files", () => {
    const writer = createMemoryWriteFilesystem([existing]);
    expect(writer.removeFile("/root/a.txt")).toEqual({
      kind: "remove",
      path: "/root/a.txt",
      ok: true,
    });
    expect(writer.snapshot().entries).toEqual([]);
    expect(writer.removeFile("/root/a.txt")).toEqual({
      kind: "remove",
      path: "/root/a.txt",
      ok: false,
      message: "file_missing",
    });
  });

  it("backs up an existing file into the backup store", () => {
    const writer = createMemoryWriteFilesystem([existing]);
    const result = writer.backupFile({ path: "/root/a.txt", rollbackId: "rb-1" });
    expect(result).toEqual({
      kind: "backup",
      path: "/root/a.txt",
      ok: true,
      checksum: "sha256:old",
    });
    expect(writer.backups().entries).toEqual([
      { path: "rb-1:/root/a.txt", content: "old", checksum: "sha256:old" },
    ]);
  });

  it("fails to back up a missing file", () => {
    const writer = createMemoryWriteFilesystem();
    expect(writer.backupFile({ path: "/root/missing", rollbackId: "rb-1" })).toEqual({
      kind: "backup",
      path: "/root/missing",
      ok: false,
      message: "file_missing",
    });
  });

  it("keeps the first entry on duplicate initialization paths", () => {
    const writer = createMemoryWriteFilesystem([
      existing,
      { path: "/root/a.txt", content: "second", checksum: "sha256:second" },
    ]);
    expect(writer.snapshot().entries).toEqual([existing]);
  });

  it("returns cloned sorted snapshots and backups", () => {
    const writer = createMemoryWriteFilesystem([
      { path: "/root/z.txt", content: "z", checksum: "sha256:z" },
      existing,
    ]);
    writer.backupFile({ path: "/root/z.txt", rollbackId: "rb-1" });
    writer.backupFile({ path: "/root/a.txt", rollbackId: "rb-1" });

    const snapshot = writer.snapshot();
    expect(snapshot.entries.map((entry) => entry.path)).toEqual(["/root/a.txt", "/root/z.txt"]);
    snapshot.entries[0].content = "mutated";
    expect(writer.snapshot().entries[0].content).toBe("old");

    expect(writer.backups().entries.map((entry) => entry.path)).toEqual([
      "rb-1:/root/a.txt",
      "rb-1:/root/z.txt",
    ]);
  });
});
