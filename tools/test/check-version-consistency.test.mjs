import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  extractConstantValue,
  isValidCanonicalSemver,
  validateVersionFile,
} from "../check-version-consistency.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const canonicalVersion = JSON.parse(readFileSync(join(repoRoot, "version.json"), "utf8")).version;

describe("isValidCanonicalSemver", () => {
  it("accepts stable and prerelease versions", () => {
    for (const value of ["0.1.0", "1.0.0", "0.2.0-alpha.0", "1.2.3", "10.20.30-rc.1"]) {
      expect(isValidCanonicalSemver(value), value).toBe(true);
    }
  });

  it("rejects invalid versions", () => {
    for (const value of [
      "",
      " 0.1.0",
      "0.1.0 ",
      "v0.1.0",
      "0.1",
      "1",
      "01.0.0",
      "0.01.0",
      "1.0.0-",
      "1.0.0-alpha..1",
      "1.0.0-01",
      "1.0.0+build",
      "x.y.z",
    ]) {
      expect(isValidCanonicalSemver(value), value).toBe(false);
    }
  });
});

describe("validateVersionFile", () => {
  it("accepts the canonical single-key shape for any valid SemVer", () => {
    expect(validateVersionFile({ version: "0.1.0" })).toBeNull();
    expect(validateVersionFile({ version: "0.2.0-alpha.0" })).toBeNull();
    expect(validateVersionFile({ version: "9.9.9" })).toBeNull();
  });

  it("is not coupled to any specific version", () => {
    // The checker accepts whatever valid SemVer version.json declares; it does
    // not require a hard-coded value.
    expect(validateVersionFile({ version: canonicalVersion })).toBeNull();
  });

  it("rejects non-objects", () => {
    expect(validateVersionFile(null)).toContain("must be a JSON object");
    expect(validateVersionFile([])).toContain("must be a JSON object");
    expect(validateVersionFile("0.1.0")).toContain("must be a JSON object");
  });

  it("rejects extra or wrong keys", () => {
    expect(validateVersionFile({ version: "0.1.0", extra: 1 })).toContain("exactly one key");
    expect(validateVersionFile({ v: "0.1.0" })).toContain("exactly one key");
  });

  it("rejects a non-string or invalid-SemVer version", () => {
    expect(validateVersionFile({ version: 1 })).toContain("must be a string");
    expect(validateVersionFile({ version: "v0.2.0" })).toContain("not valid canonical SemVer");
    expect(validateVersionFile({ version: "01.0.0" })).toContain("not valid canonical SemVer");
  });
});

describe("current repository version.json", () => {
  it("declares a valid canonical SemVer that all tooling derives from", () => {
    expect(isValidCanonicalSemver(canonicalVersion)).toBe(true);
    expect(validateVersionFile({ version: canonicalVersion })).toBeNull();
  });
});

describe("extractConstantValue", () => {
  it("extracts a quoted constant value", () => {
    expect(extractConstantValue('export const X = "0.2.0-alpha.0";', "X")).toBe("0.2.0-alpha.0");
  });

  it("returns null when the constant is absent", () => {
    expect(extractConstantValue("const Y = 5;", "X")).toBeNull();
  });

  it("does not match a different constant", () => {
    expect(extractConstantValue('const XY = "1.0";', "X")).toBeNull();
  });
});
