import { describe, expect, it } from "vitest";
import {
  isSafeRelativePath,
  joinInstallerPath,
  normalizeInstallerPath,
  validatePackageFilePaths,
} from "../src/index.js";

describe("normalizeInstallerPath", () => {
  it("normalizes slashes and trims whitespace", () => {
    expect(normalizeInstallerPath("  bin\\oh-my-pm  ")).toBe("bin/oh-my-pm");
    expect(normalizeInstallerPath("a//b///c")).toBe("a/b/c");
  });

  it("removes trailing slashes except for the root", () => {
    expect(normalizeInstallerPath("/opt/oh-my-pm/")).toBe("/opt/oh-my-pm");
    expect(normalizeInstallerPath("/")).toBe("/");
  });
});

describe("isSafeRelativePath", () => {
  it("accepts safe nested paths", () => {
    expect(isSafeRelativePath("bin/oh-my-pm")).toBe(true);
    expect(isSafeRelativePath("docs/guide/install.md")).toBe(true);
  });

  it("rejects empty and blank paths", () => {
    expect(isSafeRelativePath("")).toBe(false);
    expect(isSafeRelativePath("   ")).toBe(false);
  });

  it("rejects absolute paths", () => {
    expect(isSafeRelativePath("/etc/passwd")).toBe(false);
    expect(isSafeRelativePath("\\\\server\\share")).toBe(false);
  });

  it("rejects drive-letter paths", () => {
    expect(isSafeRelativePath("C:\\windows")).toBe(false);
    expect(isSafeRelativePath("d:/data")).toBe(false);
  });

  it("rejects parent-directory segments", () => {
    expect(isSafeRelativePath("../outside")).toBe(false);
    expect(isSafeRelativePath("bin/../../outside")).toBe(false);
  });

  it("rejects home-relative paths", () => {
    expect(isSafeRelativePath("~/secrets")).toBe(false);
    expect(isSafeRelativePath("~")).toBe(false);
  });
});

describe("joinInstallerPath", () => {
  it("joins a root and relative path without double slashes", () => {
    expect(joinInstallerPath("/opt/oh-my-pm", "bin/oh-my-pm")).toBe(
      "/opt/oh-my-pm/bin/oh-my-pm",
    );
    expect(joinInstallerPath("/opt/oh-my-pm/", "/bin/oh-my-pm")).toBe(
      "/opt/oh-my-pm/bin/oh-my-pm",
    );
  });

  it("joins under the filesystem root", () => {
    expect(joinInstallerPath("/", "bin/oh-my-pm")).toBe("/bin/oh-my-pm");
  });

  it("is deterministic across calls", () => {
    expect(joinInstallerPath("/a", "b/c")).toBe(joinInstallerPath("/a", "b/c"));
  });
});

describe("validatePackageFilePaths", () => {
  it("returns no reasons for safe unique paths", () => {
    expect(validatePackageFilePaths(["bin/oh-my-pm", "README.md"])).toEqual([]);
  });

  it("detects unsafe paths", () => {
    expect(validatePackageFilePaths(["../outside"])).toEqual(["unsafe_package_file_path"]);
  });

  it("detects duplicate paths after normalization", () => {
    expect(validatePackageFilePaths(["bin/oh-my-pm", "bin//oh-my-pm"])).toEqual([
      "duplicate_package_file_path",
    ]);
  });

  it("returns each reason at most once, unsafe first", () => {
    expect(validatePackageFilePaths(["..", "..", "a", "a"])).toEqual([
      "unsafe_package_file_path",
      "duplicate_package_file_path",
    ]);
  });
});
