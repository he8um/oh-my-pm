import { describe, expect, it } from "vitest";
import {
  extractConstantValue,
  validateVersionFile,
} from "../check-version-consistency.mjs";

describe("validateVersionFile", () => {
  it("accepts the canonical single-key shape", () => {
    expect(validateVersionFile({ version: "0.1.0" })).toBeNull();
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

  it("rejects a non-string or non-canonical version", () => {
    expect(validateVersionFile({ version: 1 })).toContain("must be a string");
    expect(validateVersionFile({ version: "2.0.0-alpha.0" })).toContain("must be 0.1.0");
  });
});

describe("extractConstantValue", () => {
  it("extracts a quoted constant value", () => {
    expect(extractConstantValue('export const X = "0.1.0";', "X")).toBe("0.1.0");
  });

  it("returns null when the constant is absent", () => {
    expect(extractConstantValue("const Y = 5;", "X")).toBeNull();
  });

  it("does not match a different constant", () => {
    expect(extractConstantValue('const XY = "1.0";', "X")).toBeNull();
  });
});
