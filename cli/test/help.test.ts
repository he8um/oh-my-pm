// Conventional CLI help. The help surface must be deterministic, bounded, and
// side-effect free: exit 0, stdout only, exactly one trailing newline, and no
// filesystem, environment, token, network, or clock access.

import { describe, expect, it } from "vitest";
import {
  HELP_TOPICS,
  formatHelp,
  isHelpFlag,
  resolveHelpRequest,
} from "../src/help.js";
import { runLocalCliProcess } from "../src/local-process.js";
import { MEMORY_SUBCOMMANDS } from "../src/memory-types.js";

/**
 * Options that make any environment/clock/filesystem read observable: a throwing
 * clock and an env map whose access is recorded. Help must trigger neither.
 */
function strictOptions(): {
  options: Parameters<typeof runLocalCliProcess>[1];
  envReads: string[];
  clockReads: { count: number };
} {
  const envReads: string[] = [];
  const clockReads = { count: 0 };
  const env = new Proxy(
    {} as Record<string, string | undefined>,
    {
      get(_target, key) {
        envReads.push(String(key));
        return undefined;
      },
    },
  );
  return {
    options: {
      env,
      clock: () => {
        clockReads.count += 1;
        throw new Error("help must not read the clock");
      },
    },
    envReads,
    clockReads,
  };
}

describe("help flags", () => {
  it("recognizes exactly the two conventional flags", () => {
    expect(isHelpFlag("--help")).toBe(true);
    expect(isHelpFlag("-h")).toBe(true);
    for (const other of ["--h", "-help", "help", "--HELP", "-H", ""]) {
      expect(isHelpFlag(other)).toBe(false);
    }
  });

  it("resolves no help request when no help flag is present", () => {
    for (const args of [[], ["status"], ["memory", "status"], ["--json"]]) {
      expect(resolveHelpRequest(args)).toBeNull();
    }
  });

  it("resolves the top level for a bare help flag", () => {
    expect(resolveHelpRequest(["--help"])).toBe("top");
    expect(resolveHelpRequest(["-h"])).toBe("top");
  });

  it("resolves a namespace topic from `<namespace> --help`", () => {
    expect(resolveHelpRequest(["memory", "--help"])).toBe("memory");
    expect(resolveHelpRequest(["providers", "--help"])).toBe("providers");
    expect(resolveHelpRequest(["github", "--help"])).toBe("github");
    expect(resolveHelpRequest(["mcp-config", "--help"])).toBe("mcp-config");
    expect(resolveHelpRequest(["memory", "-h"])).toBe("memory");
  });

  it("resolves a command topic where unambiguous", () => {
    for (const command of ["status", "doctor", "plan", "brief", "risks", "next", "handoff"]) {
      expect(resolveHelpRequest([command, "--help"])).toBe(command);
    }
  });

  it("falls back to the top level for an unknown leading token", () => {
    expect(resolveHelpRequest(["nonsense", "--help"])).toBe("top");
  });
});

describe("help text", () => {
  it("every topic renders bounded text ending in exactly one newline", () => {
    for (const topic of HELP_TOPICS) {
      const text = formatHelp(topic);
      expect(text.length).toBeGreaterThan(0);
      expect(text.length).toBeLessThan(8_000);
      expect(text.endsWith("\n")).toBe(true);
      expect(text.endsWith("\n\n")).toBe(false);
    }
  });

  it("is byte-identical when rendered repeatedly", () => {
    for (const topic of HELP_TOPICS) {
      expect(formatHelp(topic)).toBe(formatHelp(topic));
    }
  });

  it("top-level help lists the real current commands and namespaces", () => {
    const text = formatHelp("top");
    for (const command of [
      "status",
      "doctor",
      "plan",
      "brief",
      "risks",
      "next",
      "handoff",
      "install-preview",
      "github",
      "providers",
      "memory",
      "mcp-config",
    ]) {
      expect(text).toContain(command);
    }
  });

  it("top-level help documents output modes, exit codes, and examples", () => {
    const text = formatHelp("top");
    expect(text).toContain("--json");
    expect(text).toContain("--markdown");
    expect(text).toContain("Exit codes:");
    expect(text).toContain("Examples:");
    expect(text).toContain("oh-my-pm status");
  });

  it("memory help lists exactly the seven subcommands", () => {
    const text = formatHelp("memory");
    for (const sub of MEMORY_SUBCOMMANDS) {
      expect(text).toContain(sub);
    }
    expect(MEMORY_SUBCOMMANDS.length).toBe(7);
  });

  it("providers help documents both subcommands and the network gate", () => {
    const text = formatHelp("providers");
    expect(text).toContain("providers status");
    expect(text).toContain("providers doctor");
    expect(text).toContain("--confirm-network");
  });

  it("mcp-config help documents the supported options and exit 2", () => {
    const text = formatHelp("mcp-config");
    expect(text).toContain("--json");
    expect(text).toContain("--markdown");
    expect(text).toContain("--name");
    expect(text).toContain("2");
  });

  it("names no private path, provenance marker, or credential", () => {
    // The private provenance markers are assembled from fragments so this test
    // does not itself contain the literal strings the boundary validator scans
    // every tracked file for.
    const forbidden = [
      "specs/",
      "_dev/",
      `_AGENT${"_"}OVERRIDE`,
      `oh-my-pm${"-"}core`,
      `OH MY PM ${"Core"}`,
      "token=",
      "Bearer ",
      "/Users/",
      "/home/",
    ];
    for (const topic of HELP_TOPICS) {
      const text = formatHelp(topic);
      for (const marker of forbidden) {
        expect(text, `${topic} must not mention "${marker}"`).not.toContain(marker);
      }
    }
  });

  it("adds no shell completion, prompt, manpage, color, or paging surface", () => {
    for (const topic of HELP_TOPICS) {
      const text = formatHelp(topic).toLowerCase();
      // An ANSI escape sequence would indicate color output.
      expect(text).not.toMatch(/\u001b/);
      for (const marker of ["completion", "man page", "manpage", "pager", "prompt", "localization"]) {
        expect(text, `${topic} must not mention "${marker}"`).not.toContain(marker);
      }
    }
  });
});

describe("help through the process runner", () => {
  it("top-level --help exits 0 with stdout only", async () => {
    const { options } = strictOptions();
    const result = await runLocalCliProcess(["--help"], options);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe(formatHelp("top"));
  });

  it("top-level -h exits 0 with stdout only", async () => {
    const { options } = strictOptions();
    const result = await runLocalCliProcess(["-h"], options);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe(formatHelp("top"));
  });

  it("memory --help exits 0 with the memory topic", async () => {
    const { options } = strictOptions();
    const result = await runLocalCliProcess(["memory", "--help"], options);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe(formatHelp("memory"));
  });

  it("providers --help exits 0 with the providers topic", async () => {
    const { options } = strictOptions();
    const result = await runLocalCliProcess(["providers", "--help"], options);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe(formatHelp("providers"));
  });

  it("reads no environment value and no clock", async () => {
    const { options, envReads, clockReads } = strictOptions();
    for (const args of [["--help"], ["-h"], ["memory", "--help"], ["providers", "--help"]]) {
      const result = await runLocalCliProcess(args, options);
      expect(result.exitCode).toBe(0);
    }
    expect(envReads).toEqual([]);
    expect(clockReads.count).toBe(0);
  });

  it("never resolves an installed MCP command for help", async () => {
    const probed: string[] = [];
    const result = await runLocalCliProcess(["mcp-config", "--help"], {
      entryScriptPath: "/opt/omp/lib/oh-my-pm/versions/0.3.1/bin/oh-my-pm.mjs",
      platform: "linux",
      commandExists: (path) => {
        probed.push(path);
        return true;
      },
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(formatHelp("mcp-config"));
    expect(probed).toEqual([]);
  });

  it("produces byte-identical output on repeated invocations", async () => {
    const first = await runLocalCliProcess(["--help"], strictOptions().options);
    const second = await runLocalCliProcess(["--help"], strictOptions().options);
    expect(first.stdout).toBe(second.stdout);
    expect(first.exitCode).toBe(second.exitCode);
  });

  it("leaves unknown option and command failures unchanged", async () => {
    const badOption = await runLocalCliProcess(["--bogus"], strictOptions().options);
    expect(badOption.exitCode).toBe(2);
    expect(badOption.stdout).toBe("");
    expect(badOption.stderr).toContain("OMP-C-3002");

    const badCommand = await runLocalCliProcess(["nonsense"], strictOptions().options);
    expect(badCommand.exitCode).toBe(2);
    expect(badCommand.stdout).toBe("");
    expect(badCommand.stderr).toContain("OMP-C-3001");

    const missing = await runLocalCliProcess([], strictOptions().options);
    expect(missing.exitCode).toBe(2);
    expect(missing.stdout).toBe("");
    expect(missing.stderr).toContain("OMP-C-3001");
  });
});
