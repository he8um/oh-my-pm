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

  it("parses brief with the default root", () => {
    expect(parseCliArgs(["brief"])).toEqual({
      ok: true,
      command: "brief",
      outputMode: "brief",
      input: ".",
    });
  });

  it("parses brief with an explicit root", () => {
    expect(parseCliArgs(["brief", "./project"])).toEqual({
      ok: true,
      command: "brief",
      outputMode: "brief",
      input: "./project",
    });
  });

  it("parses brief with json output", () => {
    expect(parseCliArgs(["brief", "./project", "--json"])).toEqual({
      ok: true,
      command: "brief",
      outputMode: "json",
      input: "./project",
    });
  });

  it("parses brief with markdown output and the default root", () => {
    expect(parseCliArgs(["brief", "--markdown"])).toEqual({
      ok: true,
      command: "brief",
      outputMode: "markdown",
      input: ".",
    });
  });

  it("rejects a second brief positional argument", () => {
    expect(parseCliArgs(["brief", "./a", "./b"])).toEqual({
      ok: false,
      code: "OMP-C-3002",
      message: "unsupported argument: ./b",
    });
  });

  it("rejects unknown options for brief", () => {
    expect(parseCliArgs(["brief", "--bad"])).toEqual({
      ok: false,
      code: "OMP-C-3002",
      message: "unsupported option: --bad",
    });
  });

  it("parses risks with the default root", () => {
    expect(parseCliArgs(["risks"])).toEqual({
      ok: true,
      command: "risks",
      outputMode: "brief",
      input: ".",
    });
  });

  it("parses risks with an explicit dot root", () => {
    expect(parseCliArgs(["risks", "."])).toEqual({
      ok: true,
      command: "risks",
      outputMode: "brief",
      input: ".",
    });
  });

  it("parses risks with an explicit root", () => {
    expect(parseCliArgs(["risks", "./project"])).toEqual({
      ok: true,
      command: "risks",
      outputMode: "brief",
      input: "./project",
    });
  });

  it("parses risks with json output", () => {
    expect(parseCliArgs(["risks", "./project", "--json"])).toEqual({
      ok: true,
      command: "risks",
      outputMode: "json",
      input: "./project",
    });
  });

  it("parses risks with markdown output", () => {
    expect(parseCliArgs(["risks", "./project", "--markdown"])).toEqual({
      ok: true,
      command: "risks",
      outputMode: "markdown",
      input: "./project",
    });
  });

  it("accepts risks options before the root", () => {
    expect(parseCliArgs(["--json", "risks", "./project"])).toEqual({
      ok: true,
      command: "risks",
      outputMode: "json",
      input: "./project",
    });
  });

  it("rejects a second risks positional argument", () => {
    expect(parseCliArgs(["risks", "./a", "./b"])).toEqual({
      ok: false,
      code: "OMP-C-3002",
      message: "unsupported argument: ./b",
    });
  });

  it("rejects unknown options for risks", () => {
    expect(parseCliArgs(["risks", "--bad"])).toEqual({
      ok: false,
      code: "OMP-C-3002",
      message: "unsupported option: --bad",
    });
  });

  it("parses next with the default root", () => {
    expect(parseCliArgs(["next"])).toEqual({
      ok: true,
      command: "next",
      outputMode: "brief",
      input: ".",
    });
  });

  it("parses next with an explicit dot root", () => {
    expect(parseCliArgs(["next", "."])).toEqual({
      ok: true,
      command: "next",
      outputMode: "brief",
      input: ".",
    });
  });

  it("parses next with an explicit root", () => {
    expect(parseCliArgs(["next", "./project"])).toEqual({
      ok: true,
      command: "next",
      outputMode: "brief",
      input: "./project",
    });
  });

  it("parses next with json output", () => {
    expect(parseCliArgs(["next", "./project", "--json"])).toEqual({
      ok: true,
      command: "next",
      outputMode: "json",
      input: "./project",
    });
  });

  it("parses next with markdown output before the root", () => {
    expect(parseCliArgs(["--markdown", "next", "./project"])).toEqual({
      ok: true,
      command: "next",
      outputMode: "markdown",
      input: "./project",
    });
  });

  it("rejects a second next positional argument", () => {
    expect(parseCliArgs(["next", "./a", "./b"])).toEqual({
      ok: false,
      code: "OMP-C-3002",
      message: "unsupported argument: ./b",
    });
  });

  it("rejects unknown options for next", () => {
    expect(parseCliArgs(["next", "--bad"])).toEqual({
      ok: false,
      code: "OMP-C-3002",
      message: "unsupported option: --bad",
    });
  });

  it("parses handoff with the default root", () => {
    expect(parseCliArgs(["handoff"])).toEqual({
      ok: true,
      command: "handoff",
      outputMode: "brief",
      input: ".",
    });
  });

  it("parses handoff with an explicit dot root", () => {
    expect(parseCliArgs(["handoff", "."])).toEqual({
      ok: true,
      command: "handoff",
      outputMode: "brief",
      input: ".",
    });
  });

  it("parses handoff with an explicit root", () => {
    expect(parseCliArgs(["handoff", "./project"])).toEqual({
      ok: true,
      command: "handoff",
      outputMode: "brief",
      input: "./project",
    });
  });

  it("parses handoff with json output", () => {
    expect(parseCliArgs(["handoff", "./project", "--json"])).toEqual({
      ok: true,
      command: "handoff",
      outputMode: "json",
      input: "./project",
    });
  });

  it("parses handoff with markdown output before the root", () => {
    expect(parseCliArgs(["--markdown", "handoff", "./project"])).toEqual({
      ok: true,
      command: "handoff",
      outputMode: "markdown",
      input: "./project",
    });
  });

  it("lets the last output mode win for handoff", () => {
    expect(parseCliArgs(["handoff", "--json", "./project", "--markdown"])).toEqual({
      ok: true,
      command: "handoff",
      outputMode: "markdown",
      input: "./project",
    });
  });

  it("rejects a second handoff positional argument", () => {
    expect(parseCliArgs(["handoff", "./a", "./b"])).toEqual({
      ok: false,
      code: "OMP-C-3002",
      message: "unsupported argument: ./b",
    });
  });

  it("rejects unknown options for handoff", () => {
    expect(parseCliArgs(["handoff", "--bad"])).toEqual({
      ok: false,
      code: "OMP-C-3002",
      message: "unsupported option: --bad",
    });
  });

  it("parses install-preview with a root", () => {
    expect(parseCliArgs(["install-preview", "/tmp/oh-my-pm"])).toEqual({
      ok: true,
      command: "install-preview",
      outputMode: "brief",
      input: "/tmp/oh-my-pm",
    });
  });

  it("parses install-preview with json output", () => {
    expect(parseCliArgs(["install-preview", "/tmp/oh-my-pm", "--json"])).toEqual({
      ok: true,
      command: "install-preview",
      outputMode: "json",
      input: "/tmp/oh-my-pm",
    });
  });

  it("parses install-preview with markdown before the command", () => {
    expect(parseCliArgs(["--markdown", "install-preview", "/tmp/oh-my-pm"])).toEqual({
      ok: true,
      command: "install-preview",
      outputMode: "markdown",
      input: "/tmp/oh-my-pm",
    });
  });

  it("rejects install-preview without a root", () => {
    expect(parseCliArgs(["install-preview"])).toEqual({
      ok: false,
      code: "OMP-C-3002",
      message: "missing install-preview root",
    });
  });

  it("rejects a second install-preview positional argument", () => {
    expect(parseCliArgs(["install-preview", "/a", "/b"])).toEqual({
      ok: false,
      code: "OMP-C-3002",
      message: "unsupported argument: /b",
    });
  });

  it("keeps install unsupported", () => {
    expect(parseCliArgs(["install"])).toEqual({
      ok: false,
      code: "OMP-C-3001",
      message: "unsupported command: install",
    });
  });

  it("rejects --provider-config on local commands", () => {
    const result = parseCliArgs(["status", "--provider-config", "./p.json"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("OMP-C-3002");
  });
});

describe("cli parser — providers command", () => {
  it("parses providers status", () => {
    const result = parseCliArgs(["providers", "status", "--json"]);
    expect(result).toStrictEqual({
      ok: true,
      command: "providers",
      subcommand: "status",
      outputMode: "json",
    });
  });

  it("parses providers status with a config path", () => {
    const result = parseCliArgs(["providers", "status", "--provider-config", "./p.json"]);
    if (result.ok && result.command === "providers" && result.subcommand === "status") {
      expect(result.providerConfigPath).toBe("./p.json");
    } else {
      throw new Error("expected providers status");
    }
  });

  it("parses providers doctor (offline)", () => {
    const result = parseCliArgs(["providers", "doctor", "--markdown"]);
    if (result.ok && result.command === "providers" && result.subcommand === "doctor") {
      expect(result.confirmNetwork).toBe(false);
      expect(result.provider).toBeUndefined();
    } else {
      throw new Error("expected providers doctor");
    }
  });

  it("parses providers doctor github with repository and --confirm-network", () => {
    const result = parseCliArgs([
      "providers",
      "doctor",
      "github",
      "owner/repo",
      "--confirm-network",
      "--markdown",
    ]);
    if (result.ok && result.command === "providers" && result.subcommand === "doctor") {
      expect(result.provider).toBe("github");
      expect(result.repository).toBe("owner/repo");
      expect(result.confirmNetwork).toBe(true);
    } else {
      throw new Error("expected providers doctor github");
    }
  });

  it("requires a subcommand", () => {
    expect(parseCliArgs(["providers"]).ok).toBe(false);
    expect(parseCliArgs(["providers", "bogus"]).ok).toBe(false);
  });

  it("rejects --confirm-network for providers status", () => {
    expect(parseCliArgs(["providers", "status", "--confirm-network"]).ok).toBe(false);
  });

  it("rejects --confirm-network for offline providers doctor (no github target)", () => {
    expect(parseCliArgs(["providers", "doctor", "--confirm-network"]).ok).toBe(false);
  });

  it("rejects a doctor target other than github", () => {
    expect(parseCliArgs(["providers", "doctor", "gitlab"]).ok).toBe(false);
  });

  it("rejects a repository on providers status", () => {
    expect(parseCliArgs(["providers", "status", "owner/repo"]).ok).toBe(false);
  });

  it("rejects a duplicate --provider-config", () => {
    expect(
      parseCliArgs(["providers", "status", "--provider-config", "a", "--provider-config", "b"]).ok,
    ).toBe(false);
  });
});
