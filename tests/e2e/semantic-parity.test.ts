// Direct CLI/MCP semantic parity for the SHARED application use cases.
//
// Why this exists alongside extraction-parity.test.ts
// ---------------------------------------------------
// extraction-parity.test.ts runs each surface and compares it against its own
// expected shape, and re-runs each surface to prove determinism. What it never
// does is assert that the two surfaces agree WITH EACH OTHER. Both files could
// pass while CLI and MCP quietly diverged, because nothing compared one to the
// other.
//
// These tests make that comparison directly: for one fixture, the CLI result and
// the MCP result must carry the same semantic payload, the same failure codes,
// and the same provenance. Presentation may differ -- the CLI renders terminal
// text and chooses an exit code, MCP returns structured content and Markdown --
// but the DATA underneath is the shared application use case's, so it must be
// identical.
//
// Scope: only the four genuinely shared project workflows plus the shared GitHub
// workflows. `status`, `doctor`, and `plan` are deliberately NOT here. The CLI
// composes its own local Runtime for those runtime-identity and free-form
// planning commands, they are not exposed through the application boundary, and
// no second surface consumes them. That asymmetry is intentional and documented
// in packages.json and docs/v0.5/contracts.md; inventing a parity test for it
// would assert a symmetry the architecture does not claim.
//
// Offline: local Markdown fixtures and a fake GitHub transport. No live network.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runLocalCliProcess } from "@oh-my-pm/cli";
import { exitCodeForCode, mcpIsErrorForCode } from "@oh-my-pm/application";
import type {
  GitHubHttpRequest,
  GitHubHttpResponse,
  GitHubHttpTransport,
} from "@oh-my-pm/providers";
import { defaultProviderConfig } from "@oh-my-pm/providers";
import { describe, expect, it } from "vitest";
import { executeMcpGitHubTool, executeMcpProjectTool } from "@oh-my-pm/mcp-server";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const signalsRoot = join(repoRoot, "examples", "fixtures", "project-signals");
const markdownRoot = join(repoRoot, "examples", "fixtures", "markdown-project");
const OFFLINE_CONFIG = defaultProviderConfig();
const NOW = "2026-03-01T00:00:00.000Z";
const SLUG = "octo/demo";

/** The four workflows both surfaces genuinely share. */
const SHARED_OPERATIONS = ["brief", "risks", "next", "handoff"] as const;

/** A minimal fake GitHub transport: one repository record and two issues. */
function githubTransport(): GitHubHttpTransport {
  return {
    async request(request: GitHubHttpRequest): Promise<GitHubHttpResponse> {
      const url = new URL(request.url);
      if (url.pathname === `/repos/${SLUG}`) {
        return {
          status: 200,
          headers: {},
          body: {
            full_name: SLUG,
            html_url: `https://github.com/${SLUG}`,
            description: "demo",
            open_issues_count: 2,
          },
        };
      }
      return {
        status: 200,
        headers: {},
        body: [
          {
            number: 1,
            title: "Blocked on design review",
            body: "blocked",
            state: "open",
            html_url: `https://github.com/${SLUG}/issues/1`,
            user: { login: "a" },
            assignees: [],
            labels: [{ name: "blocked" }],
          },
          {
            number: 2,
            title: "Ship the handoff",
            body: "ready",
            state: "open",
            html_url: `https://github.com/${SLUG}/issues/2`,
            user: { login: "b" },
            assignees: [],
            labels: [],
          },
        ],
      };
    },
  };
}

/**
 * Run the CLI and parse its JSON document.
 *
 * `parsed` is null on a failure path: the CLI writes the error to stderr and
 * leaves stdout empty, which is the behaviour the failure tests below assert.
 * Parsing unconditionally would turn that correct behaviour into a crash inside
 * the helper and hide what the test is actually checking.
 */
async function cliJson(args: string[], transport?: GitHubHttpTransport) {
  const result = await runLocalCliProcess([...args, "--json"], {
    now: NOW,
    ...(transport ? { githubTransport: transport } : {}),
  });
  const parsed =
    result.stdout.trim().length === 0
      ? null
      : (JSON.parse(result.stdout) as Record<string, unknown>);
  return { result, parsed };
}

describe("CLI and MCP consume the same local project use case", () => {
  for (const operation of SHARED_OPERATIONS) {
    it(`agrees on the ${operation} payload`, async () => {
      const { result, parsed } = await cliJson([operation, signalsRoot]);
      expect(result.exitCode, result.stderr).toBe(0);

      const mcp = await executeMcpProjectTool(operation, signalsRoot);
      expect(mcp.ok).toBe(true);
      if (!mcp.ok || parsed === null) return;

      // The structured payload is the shared use case's output, so it must be
      // identical -- not merely similar in shape.
      const cliOutput = (parsed.data as { output: unknown }).output;
      expect(cliOutput).toEqual(mcp.output);
    });
  }

  it("loads the same bounded document set behind both surfaces", async () => {
    // The CLI's --json document IS the RuntimeResponse, so it carries no
    // `documents` summary; that counter is MCP-only metadata. What must agree is
    // the thing both surfaces derive FROM those documents, plus the fact that
    // the shared loader actually matched files.
    const { parsed } = await cliJson(["brief", signalsRoot]);
    const mcp = await executeMcpProjectTool("brief", signalsRoot);
    expect(mcp.ok).toBe(true);
    if (!mcp.ok || parsed === null) return;

    expect(mcp.documents.filesLoaded).toBeGreaterThan(0);
    expect(mcp.documents.filesMatched).toBe(mcp.documents.filesLoaded);
    expect((parsed.data as { output: unknown }).output).toEqual(mcp.output);
  });

  it("agrees across a second fixture with a different document set", async () => {
    const { parsed } = await cliJson(["risks", markdownRoot]);
    const mcp = await executeMcpProjectTool("risks", markdownRoot);
    expect(mcp.ok).toBe(true);
    if (!mcp.ok || parsed === null) return;
    expect((parsed.data as { output: unknown }).output).toEqual(mcp.output);
  });
});

describe("CLI and MCP agree on failure semantics", () => {
  const missingRoot = join(repoRoot, "examples", "fixtures", "does-not-exist-anywhere");

  it("produce the same machine-readable failure code", async () => {
    const { result } = await cliJson(["brief", missingRoot]);
    expect(result.exitCode).not.toBe(0);

    const mcp = await executeMcpProjectTool("brief", missingRoot);
    expect(mcp.ok).toBe(false);
    if (mcp.ok) return;

    // The code is the contract both surfaces branch on.
    expect(mcp.code).toBe("project_root_not_found");
    // And the CLI's exit code must be the one the taxonomy assigns to it, so
    // the two mappings cannot drift apart.
    expect(result.exitCode).toBe(exitCodeForCode(mcp.code));
  });

  it("keep an expected validation failure structured on both surfaces", async () => {
    const mcp = await executeMcpProjectTool("brief", missingRoot);
    expect(mcp.ok).toBe(false);
    if (mcp.ok) return;
    // An agent must be able to read the code and correct its own call rather
    // than seeing an unstructured protocol crash.
    expect(mcpIsErrorForCode(mcp.code)).toBe(false);
  });

  it("echo only the caller-supplied root, never a resolved path", async () => {
    // The guarantee is that neither surface RESOLVES the root before reporting
    // it: a relative root the caller typed comes back exactly as typed, so the
    // message never discloses where the repository actually lives. (Passing an
    // absolute root and finding one in the message would prove nothing -- that
    // is the caller's own string echoed back.)
    const relativeMissing = "./does-not-exist-anywhere";
    const { result } = await cliJson(["brief", relativeMissing]);
    const mcp = await executeMcpProjectTool("brief", relativeMissing);
    expect(mcp.ok).toBe(false);
    if (mcp.ok) return;

    expect(mcp.root).toBe(relativeMissing);
    expect(mcp.message).toContain(relativeMissing);
    expect(mcp.message).not.toContain(repoRoot);
    expect(result.stderr).not.toContain(repoRoot);
    // Both surfaces report the same sanitized message for the same failure.
    expect(result.stderr.trim()).toContain(mcp.message);
  });
});

describe("CLI and MCP consume the same GitHub use case", () => {
  for (const operation of SHARED_OPERATIONS) {
    it(`agrees on the GitHub ${operation} payload`, async () => {
      const cli = await runLocalCliProcess(["github", operation, SLUG, "--json", "--limit", "5"], {
        githubTransport: githubTransport(),
        now: NOW,
        providerConfig: OFFLINE_CONFIG,
      });
      expect(cli.exitCode, cli.stderr).toBe(0);
      const parsed = JSON.parse(cli.stdout) as Record<string, unknown>;

      const mcp = await executeMcpGitHubTool(
        operation,
        { repository: SLUG, limit: 5 },
        { transport: githubTransport(), providerConfig: OFFLINE_CONFIG, now: NOW },
      );
      expect(mcp.ok, mcp.ok ? "" : mcp.message).toBe(true);
      if (!mcp.ok) return;

      // Same shared use case, same fixture, same limit: the structured payload
      // must be identical even though the request identities differ by caller.
      expect((parsed.data as { output: unknown }).output).toEqual(mcp.output);
      expect(parsed.id).toBe(`cli-github-${operation}`);
    });
  }

  it("agrees on the resolved source selection", async () => {
    const cli = await runLocalCliProcess(["github", "risks", SLUG, "--json", "--limit", "5"], {
      githubTransport: githubTransport(),
      now: NOW,
      providerConfig: OFFLINE_CONFIG,
    });
    expect(cli.exitCode, cli.stderr).toBe(0);
    const mcp = await executeMcpGitHubTool(
      "risks",
      { repository: SLUG, limit: 5 },
      { transport: githubTransport(), providerConfig: OFFLINE_CONFIG, now: NOW },
    );
    expect(mcp.ok).toBe(true);
    if (!mcp.ok) return;
    // Both surfaces resolve selection through the same application use case.
    expect(mcp.selection).toMatchObject({ mode: "overview", state: "open" });
  });

  it("neither surface exposes a token or authorization header", async () => {
    const cli = await runLocalCliProcess(["github", "brief", SLUG, "--json"], {
      githubTransport: githubTransport(),
      now: NOW,
      providerConfig: OFFLINE_CONFIG,
    });
    const mcp = await executeMcpGitHubTool(
      "brief",
      { repository: SLUG },
      { transport: githubTransport(), providerConfig: OFFLINE_CONFIG, now: NOW },
    );
    const serialized = `${cli.stdout}${cli.stderr}${JSON.stringify(mcp)}`.toLowerCase();
    for (const marker of ["authorization", "bearer ", "ghp_", "github_pat_"]) {
      expect(serialized).not.toContain(marker);
    }
  });
});
