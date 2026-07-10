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
    expect(parseCliArgs(["deploy"])).toEqual({
      ok: false,
      code: "OMP-C-3001",
      message: "unsupported command: deploy",
    });
  });

  it("rejects an unsupported option", () => {
    expect(parseCliArgs(["status", "--bad"])).toEqual({
      ok: false,
      code: "OMP-C-3002",
      message: "unsupported option: --bad",
    });
  });

  it("rejects extra positional arguments after status and doctor", () => {
    expect(parseCliArgs(["status", "extra"])).toEqual({
      ok: false,
      code: "OMP-C-3002",
      message: "unsupported argument: extra",
    });
    expect(parseCliArgs(["doctor", "extra"])).toEqual({
      ok: false,
      code: "OMP-C-3002",
      message: "unsupported argument: extra",
    });
  });

  it("parses plan with a single input token", () => {
    expect(parseCliArgs(["plan", "review risks"])).toEqual({
      ok: true,
      command: "plan",
      outputMode: "brief",
      input: "review risks",
    });
  });

  it("joins multiple plan input tokens with one space", () => {
    expect(parseCliArgs(["plan", "review", "risks", "--json"])).toEqual({
      ok: true,
      command: "plan",
      outputMode: "json",
      input: "review risks",
    });
  });

  it("accepts options before the command", () => {
    expect(parseCliArgs(["--json", "plan", "review risks"])).toEqual({
      ok: true,
      command: "plan",
      outputMode: "json",
      input: "review risks",
    });
  });

  it("accepts options between command and input", () => {
    expect(parseCliArgs(["plan", "--markdown", "create handoff"])).toEqual({
      ok: true,
      command: "plan",
      outputMode: "markdown",
      input: "create handoff",
    });
  });

  it("lets the last output mode win for plan", () => {
    expect(parseCliArgs(["plan", "--json", "x", "--markdown"])).toEqual({
      ok: true,
      command: "plan",
      outputMode: "markdown",
      input: "x",
    });
  });

  it("rejects plan without a request", () => {
    expect(parseCliArgs(["plan"])).toEqual({
      ok: false,
      code: "OMP-C-3002",
      message: "missing plan request",
    });
  });

  it("rejects unknown options for plan", () => {
    expect(parseCliArgs(["plan", "--bad", "x"])).toEqual({
      ok: false,
      code: "OMP-C-3002",
      message: "unsupported option: --bad",
    });
  });
});
