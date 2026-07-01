import { safeReadFile } from "../src/utils/safe-files";
import path from "node:path";
import os from "node:os";
import { mkdtempSync, writeFileSync } from "node:fs";

describe("safeReadFile", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "oh-my-pm-test-"));
    writeFileSync(path.join(tmpDir, "AGENTS.md"), "# AGENTS");
  });

  it("reads a file that exists", async () => {
    const content = await safeReadFile(tmpDir, "AGENTS.md");
    expect(content).toBe("# AGENTS");
  });

  it("returns null for a missing file", async () => {
    const content = await safeReadFile(tmpDir, "MISSING.md");
    expect(content).toBeNull();
  });

  it("rejects path traversal attempts", async () => {
    const content = await safeReadFile(tmpDir, "../etc/passwd");
    expect(content).toBeNull();
  });

  it("rejects sensitive file patterns", async () => {
    writeFileSync(path.join(tmpDir, "secret.key"), "sensitive");
    const content = await safeReadFile(tmpDir, "secret.key");
    expect(content).toBeNull();
  });

  it("rejects .env files", async () => {
    writeFileSync(path.join(tmpDir, ".env"), "TOKEN=abc");
    const content = await safeReadFile(tmpDir, ".env");
    expect(content).toBeNull();
  });
});
