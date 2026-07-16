import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeRequest, RuntimeResponse } from "@oh-my-pm/contracts";
import type { Runtime } from "@oh-my-pm/runtime";
import { describe, expect, it } from "vitest";
import { DEFAULT_PROJECT_DOCUMENT_MAX_FILES, createRuntimeRequest, runCli } from "../src/index.js";

function respondingRuntime(): { runtime: Runtime; requests: RuntimeRequest[] } {
  const requests: RuntimeRequest[] = [];
  const runtime: Runtime = {
    handle(request: RuntimeRequest): RuntimeResponse {
      requests.push(request);
      if (request.kind === "status") {
        return {
          id: request.id,
          ok: true,
          data: { version: "2.0.0-alpha.0", kernelVersion: "kernel-test", healthy: true },
        };
      }
      return {
        id: request.id,
        ok: true,
        data: {
          checks: [
            { id: "kernel.validation", status: "ok", message: "Kernel validation is available" },
          ],
        },
      };
    },
  };
  return { runtime, requests };
}

const failingRuntime: Runtime = {
  handle(request: RuntimeRequest): RuntimeResponse {
    return {
      id: request.id,
      ok: false,
      data: { code: "OMP-R-2001", message: "request failed kernel validation" },
      error: { code: "OMP-R-2001", message: "request failed kernel validation", blocking: true },
    };
  },
};

const throwingRuntime: Runtime = {
  handle(): RuntimeResponse {
    throw new Error("secret stack detail");
  },
};

describe("cli core execution", () => {
  it("runs status with exit 0 and brief stdout", () => {
    const { runtime, requests } = respondingRuntime();
    const result = runCli(["status"], { runtime });
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("OH MY PM status: healthy");
    expect(result.stderr).toBe("");
    expect(requests).toEqual([createRuntimeRequest("status")]);
  });

  it("runs doctor with json stdout", () => {
    const { runtime } = respondingRuntime();
    const result = runCli(["doctor", "--json"], { runtime });
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.id).toBe("cli-doctor");
    expect(parsed.ok).toBe(true);
  });

  it("returns exit 2 and stderr for an invalid command", () => {
    const { runtime } = respondingRuntime();
    const result = runCli(["nonsense"], { runtime });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("error OMP-C-3001: unsupported command: nonsense\n");
  });

  it("infers the requested mode for parse errors", () => {
    const { runtime } = respondingRuntime();
    const result = runCli(["nonsense", "--json"], { runtime });
    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stderr).error.code).toBe("OMP-C-3001");
  });

  it("returns exit 1 with formatted error for a failed runtime response", () => {
    const result = runCli(["status"], { runtime: failingRuntime });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("error OMP-R-2001: request failed kernel validation\n");
    expect(result.response?.ok).toBe(false);
  });

  it("converts a thrown runtime into OMP-C-3003 without stack traces", () => {
    const result = runCli(["status"], { runtime: throwingRuntime });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("error OMP-C-3003: runtime execution failed\n");
    expect(result.stderr).not.toContain("secret stack detail");
    expect(result.stderr).not.toContain("at ");
  });

  it("uses a custom request factory when supplied", () => {
    const { runtime, requests } = respondingRuntime();
    runCli(["status"], { runtime }, (command) => ({
      id: `custom-${command}`,
      kind: command,
      locale: "en",
      payload: { source: "custom" },
    }));
    expect(requests[0]?.id).toBe("custom-status");
  });

  it("sends a plan request with the joined input", () => {
    const requests: RuntimeRequest[] = [];
    const runtime: Runtime = {
      handle(request: RuntimeRequest): RuntimeResponse {
        requests.push(request);
        return {
          id: request.id,
          ok: true,
          data: { output: { tasks: [{ id: "1", title: "Fix login" }] } },
        };
      },
    };
    const result = runCli(["plan", "review", "risks"], { runtime });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("OH MY PM plan: ok\ntasks: 1\n- Fix login\n");
    expect(requests[0]).toEqual({
      id: "cli-plan",
      kind: "plan",
      locale: "en",
      payload: { source: "cli", request: "review risks", context: {} },
    });
  });

  it("returns exit 1 for a failed plan response", () => {
    const result = runCli(["plan", "x"], { runtime: failingRuntime });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("error OMP-R-2001: request failed kernel validation\n");
  });

  it("returns exit 2 for a plan parse failure", () => {
    const { runtime } = respondingRuntime();
    const result = runCli(["plan"], { runtime });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toBe("error OMP-C-3002: missing plan request\n");
  });

  it("dispatches brief through the Runtime without the root in the payload", () => {
    const { runtime, requests } = respondingRuntime();
    const result = runCli(["brief", "./my-project"], { runtime });
    expect(result.exitCode).toBe(0);
    expect(requests).toEqual([createRuntimeRequest("brief", "./my-project")]);
    expect(JSON.stringify(requests[0])).not.toContain("my-project");
  });

  it("formats a brief status summary in every output mode", () => {
    const runtime: Runtime = {
      handle(request: RuntimeRequest): RuntimeResponse {
        return {
          id: request.id,
          ok: true,
          data: {
            output: {
              title: "Project status",
              summary: "status brief for the current project",
              counts: { total: 4, done: 0, blocked: 0, open: 4 },
              highlights: ["Riverline Field Guide", "Decisions", "Risks"],
              generatedAt: "2026-01-01T00:00:00.000Z",
            },
          },
        };
      },
    };
    const brief = runCli(["brief"], { runtime });
    expect(brief.exitCode).toBe(0);
    expect(brief.stdout).toBe(
      [
        "OH MY PM plan: ok",
        "items: 4 (open 4, blocked 0, done 0)",
        "- Riverline Field Guide",
        "- Decisions",
        "- Risks",
        "",
      ].join("\n"),
    );

    const markdown = runCli(["brief", "--markdown"], { runtime });
    expect(markdown.stdout).toContain("# OH MY PM Plan");
    expect(markdown.stdout).toContain("- Total: 4");
    expect(markdown.stdout).toContain("- Riverline Field Guide");

    const json = runCli(["brief", "--json"], { runtime });
    const parsed = JSON.parse(json.stdout);
    expect(parsed.id).toBe("cli-brief");
    expect(parsed.ok).toBe(true);
  });

  it("returns exit 1 for a failed brief runtime response", () => {
    const result = runCli(["brief"], { runtime: failingRuntime });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("error OMP-R-2001: request failed kernel validation\n");
  });

  it("converts a thrown runtime into OMP-C-3003 for brief", () => {
    const result = runCli(["brief"], { runtime: throwingRuntime });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("error OMP-C-3003: runtime execution failed\n");
  });

  it("dispatches risks through the Runtime without the root in the payload", () => {
    const { runtime, requests } = respondingRuntime();
    const result = runCli(["risks", "./my-project"], { runtime });
    expect(result.exitCode).toBe(0);
    expect(requests).toEqual([createRuntimeRequest("risks", "./my-project")]);
    expect(requests[0]?.id).toBe("cli-risks");
    expect(requests[0]?.kind).toBe("plan");
    expect(JSON.stringify(requests[0])).not.toContain("my-project");
    expect(JSON.stringify(requests[0])).toContain("review project risks");
  });

  it("formats a risks response in every output mode", () => {
    const runtime: Runtime = {
      handle(request: RuntimeRequest): RuntimeResponse {
        return {
          id: request.id,
          ok: true,
          data: {
            output: {
              risks: [
                {
                  id: "docs/risks.md",
                  title: "Delivery Constraints",
                  severity: "high",
                  reason: "keyword:blocked",
                },
              ],
            },
          },
        };
      },
    };
    const brief = runCli(["risks"], { runtime });
    expect(brief.exitCode).toBe(0);
    expect(brief.stdout).toBe(
      "OH MY PM risks: 1\n- [high] Delivery Constraints — keyword:blocked\n",
    );

    const markdown = runCli(["risks", "--markdown"], { runtime });
    expect(markdown.stdout).toContain("# OH MY PM Project Risks");
    expect(markdown.stdout).toContain("- Total: 1");
    expect(markdown.stdout).toContain("- **high** — Delivery Constraints — `keyword:blocked`");

    const json = runCli(["risks", "--json"], { runtime });
    const parsed = JSON.parse(json.stdout);
    expect(parsed.id).toBe("cli-risks");
    expect(parsed.ok).toBe(true);
  });

  it("returns exit 1 for a failed risks runtime response", () => {
    const result = runCli(["risks"], { runtime: failingRuntime });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("error OMP-R-2001: request failed kernel validation\n");
  });

  it("converts a thrown runtime into OMP-C-3003 for risks", () => {
    const result = runCli(["risks"], { runtime: throwingRuntime });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("error OMP-C-3003: runtime execution failed\n");
  });

  it("dispatches next through the Runtime without the root in the payload", () => {
    const { runtime, requests } = respondingRuntime();
    const result = runCli(["next", "./my-project"], { runtime });
    expect(result.exitCode).toBe(0);
    expect(requests).toEqual([createRuntimeRequest("next", "./my-project")]);
    expect(requests[0]?.id).toBe("cli-next");
    expect(requests[0]?.kind).toBe("plan");
    expect(JSON.stringify(requests[0])).not.toContain("my-project");
    expect(JSON.stringify(requests[0])).toContain("derive next project tasks");
  });

  it("formats a next response in every output mode", () => {
    const runtime: Runtime = {
      handle(request: RuntimeRequest): RuntimeResponse {
        return {
          id: request.id,
          ok: true,
          data: {
            output: {
              tasks: [
                {
                  id: "docs/status.md#task-1",
                  title: "Confirm final paper stock with the supplier.",
                  reason: "markdown_unchecked_task",
                },
              ],
            },
          },
        };
      },
    };
    const brief = runCli(["next"], { runtime });
    expect(brief.exitCode).toBe(0);
    expect(brief.stdout).toBe(
      "OH MY PM next: 1\n- Confirm final paper stock with the supplier. — markdown_unchecked_task\n",
    );

    const markdown = runCli(["next", "--markdown"], { runtime });
    expect(markdown.stdout).toContain("# OH MY PM Next Tasks");
    expect(markdown.stdout).toContain("- Total: 1");

    const json = runCli(["next", "--json"], { runtime });
    const parsed = JSON.parse(json.stdout);
    expect(parsed.id).toBe("cli-next");
    expect(parsed.ok).toBe(true);
  });

  it("returns exit 1 for a failed next runtime response", () => {
    const result = runCli(["next"], { runtime: failingRuntime });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("error OMP-R-2001: request failed kernel validation\n");
  });

  it("converts a thrown runtime into OMP-C-3003 for next", () => {
    const result = runCli(["next"], { runtime: throwingRuntime });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("error OMP-C-3003: runtime execution failed\n");
  });

  it("dispatches handoff through the Runtime without the root in the payload", () => {
    const { runtime, requests } = respondingRuntime();
    const result = runCli(["handoff", "./my-project"], { runtime });
    expect(result.exitCode).toBe(0);
    expect(requests).toEqual([createRuntimeRequest("handoff", "./my-project")]);
    expect(requests[0]?.id).toBe("cli-handoff");
    expect(requests[0]?.kind).toBe("plan");
    expect(JSON.stringify(requests[0])).not.toContain("my-project");
    expect(JSON.stringify(requests[0])).toContain("create project handoff");
    const listRequest = (requests[0]?.payload as { context: { providerRequests: unknown[] } })
      .context.providerRequests[0];
    expect(listRequest).toEqual({
      providerId: "local",
      action: "list",
      query: "",
      limit: DEFAULT_PROJECT_DOCUMENT_MAX_FILES,
    });
  });

  it("formats a handoff response in every output mode", () => {
    const runtime: Runtime = {
      handle(request: RuntimeRequest): RuntimeResponse {
        return {
          id: request.id,
          ok: true,
          data: {
            output: {
              title: "Riverline Field Guide",
              sections: [
                { heading: "Summary", items: ["Ship the spring edition."] },
                { heading: "Open Tasks", items: ["Confirm final paper stock with the supplier."] },
                { heading: "Risks", items: ["The printing quote is blocked (owner: Jordan)."] },
                { heading: "Decisions", items: ["Ships as a single printed volume."] },
              ],
              generatedAt: "2026-01-01T00:00:00.000Z",
            },
          },
        };
      },
    };
    const brief = runCli(["handoff"], { runtime });
    expect(brief.exitCode).toBe(0);
    expect(brief.stdout).toBe(
      [
        "OH MY PM handoff: Riverline Field Guide",
        "Summary: 1",
        "- Ship the spring edition.",
        "Open Tasks: 1",
        "- Confirm final paper stock with the supplier.",
        "Risks: 1",
        "- The printing quote is blocked (owner: Jordan).",
        "Decisions: 1",
        "- Ships as a single printed volume.",
        "generated at: 2026-01-01T00:00:00.000Z",
        "",
      ].join("\n"),
    );

    const markdown = runCli(["handoff", "--markdown"], { runtime });
    expect(markdown.stdout).toContain("# OH MY PM Project Handoff");
    expect(markdown.stdout).toContain("- Project: Riverline Field Guide");
    expect(markdown.stdout).toContain("## Summary");
    expect(markdown.stdout).toContain("## Open Tasks");
    expect(markdown.stdout).toContain("## Risks");
    expect(markdown.stdout).toContain("## Decisions");

    const json = runCli(["handoff", "--json"], { runtime });
    const parsed = JSON.parse(json.stdout);
    expect(parsed.id).toBe("cli-handoff");
    expect(parsed.ok).toBe(true);
  });

  it("returns exit 1 for a failed handoff runtime response", () => {
    const result = runCli(["handoff"], { runtime: failingRuntime });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("error OMP-R-2001: request failed kernel validation\n");
  });

  it("converts a thrown runtime into OMP-C-3003 for handoff", () => {
    const result = runCli(["handoff"], { runtime: throwingRuntime });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("error OMP-C-3003: runtime execution failed\n");
  });

  it("runs install-preview locally without touching the Runtime", () => {
    const root = mkdtempSync(join(tmpdir(), "oh-my-pm-cli-preview-"));
    try {
      mkdirSync(join(root, "bin"));
      writeFileSync(join(root, "bin", "oh-my-pm"), "old binary", "utf8");
      const { runtime, requests } = respondingRuntime();

      const result = runCli(["install-preview", root], { runtime });
      expect(result.ok).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("OH MY PM install-preview: ok");
      expect(result.stderr).toBe("");
      expect(requests).toEqual([]);

      const jsonResult = runCli(["install-preview", root, "--json"], { runtime });
      expect(jsonResult.exitCode).toBe(0);
      const parsed = JSON.parse(jsonResult.stdout);
      expect(parsed.ok).toBe(true);
      expect(parsed.root).toBe(root);
      expect(requests).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns exit 2 for install-preview without a root", () => {
    const { runtime } = respondingRuntime();
    const result = runCli(["install-preview"], { runtime });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toBe("error OMP-C-3002: missing install-preview root\n");
  });

  it("returns exit 1 for a failing install-preview root", () => {
    const { runtime, requests } = respondingRuntime();
    const result = runCli(["install-preview", " "], { runtime });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("OH MY PM install-preview: failed");
    expect(requests).toEqual([]);
  });

  it("passes command and input to a custom request factory", () => {
    const { runtime } = respondingRuntime();
    const seen: Array<{ command: string; input?: string }> = [];
    runCli(["plan", "create", "handoff"], { runtime }, (command, input) => {
      seen.push(input === undefined ? { command } : { command, input });
      return {
        id: "custom-plan",
        kind: "plan",
        locale: "en",
        payload: { source: "custom", request: input ?? "", context: {} },
      };
    });
    expect(seen).toEqual([{ command: "plan", input: "create handoff" }]);
  });
});
