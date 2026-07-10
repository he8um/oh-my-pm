import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../src/index.js";

describe("cli parser", () => {
  it("rejects a missing command", () => {
    expect(parseCliArgs([])).toEqual({
      ok: false,
      code: "OMP-C-3001",
      message: "missing command",
    });
  });

  it("parses status with the default brief mode", () => {
    expect(parseCliArgs(["status"])).toEqual({
      ok: true,
      command: "status",
      outputMode: "brief",
    });
  });

  it("parses doctor with json output", () => {
    expect(parseCliArgs(["doctor", "--json"])).toEqual({
      ok: true,
      command: "doctor",
      outputMode: "json",
    });
  });

  it("parses status with markdown output", () => {
    expect(parseCliArgs(["status", "--markdown"])).toEqual({
      ok: true,
      command: "status",
      outputMode: "markdown",
    });
  });

  it("lets the last output mode win", () => {
    expect(parseCliArgs(["status", "--markdown", "--json"])).toEqual({
      ok: true,
      command: "status",
      outputMode: "json",
    });
  });

  it("rejects an unsupported command", () => {
    expect(parseCliArgs(["plan"])).toEqual({
      ok: false,
      code: "OMP-C-3001",
      message: "unsupported command: plan",
    });
  });

  it("rejects an unsupported option", () => {
    expect(parseCliArgs(["status", "--bad"])).toEqual({
      ok: false,
      code: "OMP-C-3002",
      message: "unsupported option: --bad",
    });
  });

  it("rejects extra positional arguments", () => {
    expect(parseCliArgs(["status", "extra"])).toEqual({
      ok: false,
      code: "OMP-C-3002",
      message: "unsupported argument: extra",
    });
  });
});
