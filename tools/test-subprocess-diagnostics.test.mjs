import { describe, expect, it } from "vitest";
import { describeSubprocessResult } from "./test-subprocess-diagnostics.mjs";

describe("describeSubprocessResult", () => {
  it("reports command, status, signal, and both streams", () => {
    const message = describeSubprocessResult("build.mjs", ["--output", "/tmp/out"], {
      status: 1,
      signal: null,
      stdout: "some output",
      stderr: "the real reason",
    });
    expect(message).toContain("command: build.mjs --output /tmp/out");
    expect(message).toContain("status: 1");
    expect(message).toContain("signal: none");
    expect(message).toContain("the real reason");
  });

  it("surfaces a spawn error code when the process never started", () => {
    const message = describeSubprocessResult("tar", ["--version"], {
      error: Object.assign(new Error("spawn EAGAIN"), { code: "EAGAIN" }),
    });
    expect(message).toContain("spawn error: EAGAIN");
    expect(message).toContain("status: none");
  });

  it("marks empty streams explicitly rather than printing nothing", () => {
    const message = describeSubprocessResult("check.mjs", [], { status: 0, stdout: "", stderr: "" });
    expect(message).toContain("stdout:\n(empty)");
    expect(message).toContain("stderr:\n(empty)");
  });

  it("bounds runaway output and says how much was dropped", () => {
    const message = describeSubprocessResult("noisy.mjs", [], { status: 1, stderr: "x".repeat(10_000) });
    expect(message.length).toBeLessThan(10_000);
    expect(message).toContain("earlier characters omitted");
    // The tail is what matters for a failure, so it must be preserved.
    expect(message.endsWith("x".repeat(100))).toBe(true);
  });

  it("handles a missing result without throwing", () => {
    expect(() => describeSubprocessResult("x.mjs", [], undefined)).not.toThrow();
  });
});
