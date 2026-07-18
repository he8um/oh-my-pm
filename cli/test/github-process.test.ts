import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { GitHubHttpRequest, GitHubHttpResponse, GitHubHttpTransport } from "@oh-my-pm/providers";
import { describe, expect, it } from "vitest";
import { runLocalCliProcess } from "../src/index.js";

const fixtureDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "providers",
  "test",
  "fixtures",
  "github",
);
const load = (name: string): unknown => JSON.parse(readFileSync(join(fixtureDir, name), "utf8"));
const SLUG = "riverline/field-guide";
const NOW = "2026-03-01T00:00:00.000Z";

/** Records requests and answers repo + issues from fixtures. */
function recordingTransport(headerToken?: string): {
  transport: GitHubHttpTransport;
  calls: GitHubHttpRequest[];
} {
  const calls: GitHubHttpRequest[] = [];
  const transport: GitHubHttpTransport = {
    async request(request: GitHubHttpRequest): Promise<GitHubHttpResponse> {
      calls.push(request);
      const url = new URL(request.url);
      if (url.pathname === `/repos/${SLUG}`) {
        return { status: 200, headers: {}, body: load("repository.json") };
      }
      if (url.pathname === `/repos/${SLUG}/issues`) {
        return { status: 200, headers: {}, body: load("issues.json") };
      }
      return { status: 404, headers: {}, body: {} };
    },
  };
  void headerToken;
  return { transport, calls };
}

async function runGitHub(op: string, extra: string[] = [], transport?: GitHubHttpTransport) {
  const { transport: t, calls } = recordingTransport();
  const result = await runLocalCliProcess(["github", op, SLUG, ...extra], {
    githubTransport: transport ?? t,
    now: NOW,
  });
  return { result, calls };
}

describe("github CLI process (fake transport)", () => {
  it("runs a public unauthenticated brief and returns json", async () => {
    const { result } = await runGitHub("brief", ["--json"]);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.ok).toBe(true);
  });

  it("runs risks, next, and handoff", async () => {
    for (const op of ["risks", "next", "handoff"]) {
      const { result } = await runGitHub(op, ["--json"]);
      expect(result.exitCode, op).toBe(0);
      expect(JSON.parse(result.stdout).ok, op).toBe(true);
    }
  });

  it("renders markdown for brief", async () => {
    const { result } = await runGitHub("brief", ["--markdown"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("# ");
  });

  it("injects a token into the transport only, never into output", async () => {
    // Build a transport that captures the token it was constructed with by
    // reading the Authorization header the provider would forward. Since the
    // provider builds headers itself (without the token) and the transport
    // adds Authorization, we verify at the transport factory boundary instead:
    // here we assert the token never appears in CLI output for an injected
    // token passed through options.
    const { transport } = recordingTransport();
    const result = await runLocalCliProcess(["github", "brief", SLUG, "--json"], {
      githubTransport: transport,
      githubToken: "secret-token-abc",
      now: NOW,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("secret-token-abc");
    expect(result.stderr).not.toContain("secret-token-abc");
  });

  it("hits the expected endpoints in order", async () => {
    const { calls } = await runGitHub("brief", ["--limit", "3"]);
    const paths = calls.map((c) => new URL(c.url).pathname);
    expect(paths[0]).toBe(`/repos/${SLUG}`);
    expect(paths[1]).toBe(`/repos/${SLUG}/issues`);
  });

  it("maps a provider auth failure to exit 2 with a sanitized code", async () => {
    const transport: GitHubHttpTransport = {
      async request(): Promise<GitHubHttpResponse> {
        return { status: 401, headers: {}, body: { message: "bad creds" } };
      },
    };
    const result = await runLocalCliProcess(["github", "brief", SLUG, "--json"], {
      githubTransport: transport,
      now: NOW,
    });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("OMP-P-4004");
    expect(result.stderr).not.toContain("bad creds");
  });

  it("maps a rate-limited response to exit 2 with OMP-P-4007", async () => {
    const transport: GitHubHttpTransport = {
      async request(): Promise<GitHubHttpResponse> {
        return { status: 403, headers: { "x-ratelimit-remaining": "0" }, body: {} };
      },
    };
    const result = await runLocalCliProcess(["github", "risks", SLUG], {
      githubTransport: transport,
      now: NOW,
    });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("OMP-P-4007");
  });

  it("does not build a GitHub transport for local commands", async () => {
    // A poisoned transport that throws if ever called; local status must never
    // touch it (it is only wired for the github command).
    const transport: GitHubHttpTransport = {
      async request(): Promise<GitHubHttpResponse> {
        throw new Error("local command must not use the GitHub transport");
      },
    };
    const result = await runLocalCliProcess(["status"], {
      githubTransport: transport,
      now: NOW,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("OH MY PM status: healthy");
  });

  it("uses the injected fixed clock and exits deterministically", async () => {
    const first = await runGitHub("brief", ["--json"]);
    const second = await runGitHub("brief", ["--json"]);
    expect(first.result.stdout).toBe(second.result.stdout);
  });
});
