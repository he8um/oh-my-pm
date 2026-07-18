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
    async handle(request: RuntimeRequest): Promise<RuntimeResponse> {
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
  async handle(request: RuntimeRequest): Promise<RuntimeResponse> {
    return {
      id: request.id,
      ok: false,
      data: { code: "OMP-R-2001", message: "request failed kernel validation" },
      error: { code: "OMP-R-2001", message: "request failed kernel validation", blocking: true },
    };
  },
};

const throwingRuntime: Runtime = {
  async handle(): Promise<RuntimeResponse> {
    throw new Error("secret stack detail");
  },
};

describe("cli core execution", () => {
  it("runs status with exit 0 and brief stdout", async () => {
    const { runtime, requests } = respondingRuntime();
    const result = await runCli(["status"], { runtime });
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("OH MY PM status: healthy");
    expect(result.stderr).toBe("");
    expect(requests).toEqual([createRuntimeRequest("status")]);
  });

  it("runs doctor with json stdout", async () => {
    const { runtime } = respondingRuntime();
    const result = await runCli(["doctor", "--json"], { runtime });
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.id).toBe("cli-doctor");
    expect(parsed.ok).toBe(true);
  });

  it("returns exit 2 and stderr for an invalid command", async () => {
    const { runtime } = respondingRuntime();
    const result = await runCli(["nonsense"], { runtime });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("error OMP-C-3001: unsupported command: nonsense\n");
  });

  it("infers the requested mode for parse errors", async () => {
    const { runtime } = respondingRuntime();
    const result = await runCli(["nonsense", "--json"], { runtime });
    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stderr).error.code).toBe("OMP-C-3001");
  });

  it("returns exit 1 with formatted error for a failed runtime response", async () => {
    const result = await runCli(["status"], { runtime: failingRuntime });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("error OMP-R-2001: request failed kernel validation\n");
    expect(result.response?.ok).toBe(false);
  });

  it("converts a thrown runtime into OMP-C-3003 without stack traces", async () => {
    const result = await runCli(["status"], { runtime: throwingRuntime });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("error OMP-C-3003: runtime execution failed\n");
    expect(result.stderr).not.toContain("secret stack detail");
    expect(result.stderr).not.toContain("at ");
  });

  it("uses a custom request factory when supplied", async () => {
    const { runtime, requests } = respondingRuntime();
    await runCli(["status"], { runtime }, (command) => ({
      id: `custom-${command}`,
      kind: command,
      locale: "en",
      payload: { source: "custom" },
    }));
    expect(requests[0]?.id).toBe("custom-status");
  });

  it("sends a plan request with the joined input", async () => {
    const requests: RuntimeRequest[] = [];
    const runtime: Runtime = {
      async handle(request: RuntimeRequest): Promise<RuntimeResponse> {
        requests.push(request);
        return {
          id: request.id,
          ok: true,
          data: { output: { tasks: [{ id: "1", title: "Fix login" }] } },
        };
      },
    };
    const result = await runCli(["plan", "review", "risks"], { runtime });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("OH MY PM plan: ok\ntasks: 1\n- Fix login\n");
    expect(requests[0]).toEqual({
      id: "cli-plan",
      kind: "plan",
      locale: "en",
      payload: { source: "cli", request: "review risks", context: {} },
    });
  });

  it("returns exit 1 for a failed plan response", async () => {
    const result = await runCli(["plan", "x"], { runtime: failingRuntime });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("error OMP-R-2001: request failed kernel validation\n");
  });

  it("returns exit 2 for a plan parse failure", async () => {
    const { runtime } = respondingRuntime();
    const result = await runCli(["plan"], { runtime });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toBe("error OMP-C-3002: missing plan request\n");
  });

  it("dispatches brief through the Runtime without the root in the payload", async () => {
    const { runtime, requests } = respondingRuntime();
    const result = await runCli(["brief", "./my-project"], { runtime });
    expect(result.exitCode).toBe(0);
    expect(requests).toEqual([createRuntimeRequest("brief", "./my-project")]);
    expect(JSON.stringify(requests[0])).not.toContain("my-project");
  });

  it("formats a brief status summary in every output mode", async () => {
    const runtime: Runtime = {
      async handle(request: RuntimeRequest): Promise<RuntimeResponse> {
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
    const brief = await runCli(["brief"], { runtime });
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

    const markdown = await runCli(["brief", "--markdown"], { runtime });
    expect(markdown.stdout).toContain("# OH MY PM Plan");
    expect(markdown.stdout).toContain("- Total: 4");
    expect(markdown.stdout).toContain("- Riverline Field Guide");

    const json = await runCli(["brief", "--json"], { runtime });
    const parsed = JSON.parse(json.stdout);
    expect(parsed.id).toBe("cli-brief");
    expect(parsed.ok).toBe(true);
  });

  it("returns exit 1 for a failed brief runtime response", async () => {
    const result = await runCli(["brief"], { runtime: failingRuntime });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("error OMP-R-2001: request failed kernel validation\n");
  });

  it("converts a thrown runtime into OMP-C-3003 for brief", async () => {
    const result = await runCli(["brief"], { runtime: throwingRuntime });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("error OMP-C-3003: runtime execution failed\n");
  });

  it("dispatches risks through the Runtime without the root in the payload", async () => {
    const { runtime, requests } = respondingRuntime();
    const result = await runCli(["risks", "./my-project"], { runtime });
    expect(result.exitCode).toBe(0);
    expect(requests).toEqual([createRuntimeRequest("risks", "./my-project")]);
    expect(requests[0]?.id).toBe("cli-risks");
    expect(requests[0]?.kind).toBe("plan");
    expect(JSON.stringify(requests[0])).not.toContain("my-project");
    expect(JSON.stringify(requests[0])).toContain("review project risks");
  });

  it("formats a risks response in every output mode", async () => {
    const runtime: Runtime = {
      async handle(request: RuntimeRequest): Promise<RuntimeResponse> {
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
    const brief = await runCli(["risks"], { runtime });
    expect(brief.exitCode).toBe(0);
    expect(brief.stdout).toBe(
      "OH MY PM risks: 1\n- [high] Delivery Constraints — keyword:blocked\n",
    );

    const markdown = await runCli(["risks", "--markdown"], { runtime });
    expect(markdown.stdout).toContain("# OH MY PM Project Risks");
    expect(markdown.stdout).toContain("- Total: 1");
    expect(markdown.stdout).toContain("- **high** — Delivery Constraints — `keyword:blocked`");

    const json = await runCli(["risks", "--json"], { runtime });
    const parsed = JSON.parse(json.stdout);
    expect(parsed.id).toBe("cli-risks");
    expect(parsed.ok).toBe(true);
  });

  it("returns exit 1 for a failed risks runtime response", async () => {
    const result = await runCli(["risks"], { runtime: failingRuntime });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("error OMP-R-2001: request failed kernel validation\n");
  });

  it("converts a thrown runtime into OMP-C-3003 for risks", async () => {
    const result = await runCli(["risks"], { runtime: throwingRuntime });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("error OMP-C-3003: runtime execution failed\n");
  });

  it("dispatches next through the Runtime without the root in the payload", async () => {
    const { runtime, requests } = respondingRuntime();
    const result = await runCli(["next", "./my-project"], { runtime });
    expect(result.exitCode).toBe(0);
    expect(requests).toEqual([createRuntimeRequest("next", "./my-project")]);
    expect(requests[0]?.id).toBe("cli-next");
    expect(requests[0]?.kind).toBe("plan");
    expect(JSON.stringify(requests[0])).not.toContain("my-project");
    expect(JSON.stringify(requests[0])).toContain("derive next project tasks");
  });

  it("formats a next response in every output mode", async () => {
    const runtime: Runtime = {
      async handle(request: RuntimeRequest): Promise<RuntimeResponse> {
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
    const brief = await runCli(["next"], { runtime });
    expect(brief.exitCode).toBe(0);
    expect(brief.stdout).toBe(
      "OH MY PM next: 1\n- Confirm final paper stock with the supplier. — markdown_unchecked_task\n",
    );

    const markdown = await runCli(["next", "--markdown"], { runtime });
    expect(markdown.stdout).toContain("# OH MY PM Next Tasks");
    expect(markdown.stdout).toContain("- Total: 1");

    const json = await runCli(["next", "--json"], { runtime });
    const parsed = JSON.parse(json.stdout);
    expect(parsed.id).toBe("cli-next");
    expect(parsed.ok).toBe(true);
  });

  it("returns exit 1 for a failed next runtime response", async () => {
    const result = await runCli(["next"], { runtime: failingRuntime });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("error OMP-R-2001: request failed kernel validation\n");
  });

  it("converts a thrown runtime into OMP-C-3003 for next", async () => {
    const result = await runCli(["next"], { runtime: throwingRuntime });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("error OMP-C-3003: runtime execution failed\n");
  });

  it("dispatches handoff through the Runtime without the root in the payload", async () => {
    const { runtime, requests } = respondingRuntime();
    const result = await runCli(["handoff", "./my-project"], { runtime });
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

  it("formats a handoff response in every output mode", async () => {
    const runtime: Runtime = {
      async handle(request: RuntimeRequest): Promise<RuntimeResponse> {
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
    const brief = await runCli(["handoff"], { runtime });
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

    const markdown = await runCli(["handoff", "--markdown"], { runtime });
    expect(markdown.stdout).toContain("# OH MY PM Project Handoff");
    expect(markdown.stdout).toContain("- Project: Riverline Field Guide");
    expect(markdown.stdout).toContain("## Summary");
    expect(markdown.stdout).toContain("## Open Tasks");
    expect(markdown.stdout).toContain("## Risks");
    expect(markdown.stdout).toContain("## Decisions");

    const json = await runCli(["handoff", "--json"], { runtime });
    const parsed = JSON.parse(json.stdout);
    expect(parsed.id).toBe("cli-handoff");
    expect(parsed.ok).toBe(true);
  });

  it("returns exit 1 for a failed handoff runtime response", async () => {
    const result = await runCli(["handoff"], { runtime: failingRuntime });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("error OMP-R-2001: request failed kernel validation\n");
  });

  it("converts a thrown runtime into OMP-C-3003 for handoff", async () => {
    const result = await runCli(["handoff"], { runtime: throwingRuntime });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("error OMP-C-3003: runtime execution failed\n");
  });

  it("runs install-preview locally without touching the Runtime", async () => {
    const root = mkdtempSync(join(tmpdir(), "oh-my-pm-cli-preview-"));
    try {
      mkdirSync(join(root, "bin"));
      writeFileSync(join(root, "bin", "oh-my-pm"), "old binary", "utf8");
      const { runtime, requests } = respondingRuntime();

      const result = await runCli(["install-preview", root], { runtime });
      expect(result.ok).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("OH MY PM install-preview: ok");
      expect(result.stderr).toBe("");
      expect(requests).toEqual([]);

      const jsonResult = await runCli(["install-preview", root, "--json"], { runtime });
      expect(jsonResult.exitCode).toBe(0);
      const parsed = JSON.parse(jsonResult.stdout);
      expect(parsed.ok).toBe(true);
      expect(parsed.root).toBe(root);
      expect(requests).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns exit 2 for install-preview without a root", async () => {
    const { runtime } = respondingRuntime();
    const result = await runCli(["install-preview"], { runtime });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toBe("error OMP-C-3002: missing install-preview root\n");
  });

  it("returns exit 1 for a failing install-preview root", async () => {
    const { runtime, requests } = respondingRuntime();
    const result = await runCli(["install-preview", " "], { runtime });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("OH MY PM install-preview: failed");
    expect(requests).toEqual([]);
  });

  it("passes command and input to a custom request factory", async () => {
    const { runtime } = respondingRuntime();
    const seen: Array<{ command: string; input?: string }> = [];
    await runCli(["plan", "create", "handoff"], { runtime }, (command, input) => {
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
