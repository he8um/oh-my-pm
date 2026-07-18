import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { GitHubHttpRequest, GitHubHttpResponse, GitHubHttpTransport } from "@oh-my-pm/providers";
import { defaultProviderConfig } from "@oh-my-pm/providers";
import type { ResolvedProviderConfig } from "@oh-my-pm/providers";
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

function configWith(github: Partial<ResolvedProviderConfig["providers"]["github"]>): ResolvedProviderConfig {
  const base = defaultProviderConfig();
  return {
    ...base,
    providers: { local: { enabled: true }, github: { ...base.providers.github, ...github } },
  };
}

function recordingTransport(repoSlug: string): {
  transport: GitHubHttpTransport;
  calls: GitHubHttpRequest[];
} {
  const calls: GitHubHttpRequest[] = [];
  const transport: GitHubHttpTransport = {
    async request(request: GitHubHttpRequest): Promise<GitHubHttpResponse> {
      calls.push(request);
      const url = new URL(request.url);
      if (url.pathname === `/repos/${repoSlug}`) return { status: 200, headers: {}, body: load("repository.json") };
      if (url.pathname === `/repos/${repoSlug}/issues`) return { status: 200, headers: {}, body: load("issues.json") };
      return { status: 404, headers: {}, body: {} };
    },
  };
  return { transport, calls };
}

describe("providers status command", () => {
  it("makes no network request and reports configured defaults", async () => {
    const transport: GitHubHttpTransport = {
      async request(): Promise<GitHubHttpResponse> {
        throw new Error("status must not reach the network");
      },
    };
    const result = await runLocalCliProcess(["providers", "status", "--json"], {
      providerConfig: configWith({ defaultRepository: "he8um/oh-my-pm", defaultLimit: 25 }),
      githubTransport: transport,
    });
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    const github = parsed.providers.find((p: { id: string }) => p.id === "github");
    expect(github.defaultRepository).toBe("he8um/oh-my-pm");
    expect(github.defaultLimit).toBe(25);
  });

  it("never leaks a token value", async () => {
    const result = await runLocalCliProcess(["providers", "status", "--json"], {
      providerConfig: defaultProviderConfig(),
      githubToken: "ghp_secretstatus",
    });
    expect(result.stdout).not.toContain("ghp_secretstatus");
    const github = JSON.parse(result.stdout).providers.find((p: { id: string }) => p.id === "github");
    expect(github.token).toBe("present");
  });
});

describe("providers doctor command (offline)", () => {
  it("makes no network request and exits 0 for valid config", async () => {
    const transport: GitHubHttpTransport = {
      async request(): Promise<GitHubHttpResponse> {
        throw new Error("offline doctor must not reach the network");
      },
    };
    const result = await runLocalCliProcess(["providers", "doctor", "--json"], {
      providerConfig: configWith({ defaultRepository: "he8um/oh-my-pm" }),
      githubTransport: transport,
    });
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.networkAttempted).toBe(false);
  });

  it("requires --confirm-network before any GitHub request", async () => {
    const { transport, calls } = recordingTransport(SLUG);
    const result = await runLocalCliProcess(["providers", "doctor", "github", SLUG, "--json"], {
      providerConfig: configWith({ defaultRepository: SLUG }),
      githubTransport: transport,
    });
    expect(result.exitCode).toBe(0);
    expect(calls).toHaveLength(0);
    expect(JSON.parse(result.stdout).networkAttempted).toBe(false);
  });
});

describe("providers doctor github --confirm-network", () => {
  it("makes exactly one repository request and exits 0 on success", async () => {
    const { transport, calls } = recordingTransport(SLUG);
    const result = await runLocalCliProcess(
      ["providers", "doctor", "github", SLUG, "--confirm-network", "--json"],
      { githubTransport: transport, now: NOW },
    );
    expect(result.exitCode).toBe(0);
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0]!.url).pathname).toBe(`/repos/${SLUG}`);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.networkAttempted).toBe(true);
    expect(parsed.github.access).toBe("ok");
  });

  it("resolves the repository from configuration when omitted", async () => {
    const { transport, calls } = recordingTransport(SLUG);
    const result = await runLocalCliProcess(
      ["providers", "doctor", "github", "--confirm-network", "--json"],
      { providerConfig: configWith({ defaultRepository: SLUG }), githubTransport: transport },
    );
    expect(result.exitCode).toBe(0);
    expect(calls).toHaveLength(1);
    expect(JSON.parse(result.stdout).github.repository).toBe(SLUG);
  });

  it("maps a sanitized 404 to exit 2 without leaking detail", async () => {
    const transport: GitHubHttpTransport = {
      async request(): Promise<GitHubHttpResponse> {
        return { status: 404, headers: {}, body: { message: "raw not-found detail" } };
      },
    };
    const result = await runLocalCliProcess(
      ["providers", "doctor", "github", SLUG, "--confirm-network", "--json"],
      { githubTransport: transport },
    );
    expect(result.exitCode).toBe(2);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.github.access).toBe("failed");
    expect(parsed.github.providerCode).toBe("OMP-P-4006");
    expect(result.stdout).not.toContain("raw not-found detail");
  });

  it("blocks a disabled GitHub provider before any request", async () => {
    const { transport, calls } = recordingTransport(SLUG);
    const result = await runLocalCliProcess(
      ["providers", "doctor", "github", SLUG, "--confirm-network", "--json"],
      { providerConfig: configWith({ enabled: false, defaultRepository: SLUG }), githubTransport: transport },
    );
    expect(result.exitCode).toBe(2);
    expect(calls).toHaveLength(0);
  });
});

describe("github workflow command uses configuration", () => {
  it("resolves the omitted repository from config", async () => {
    const { transport, calls } = recordingTransport(SLUG);
    const result = await runLocalCliProcess(["github", "brief", "--json"], {
      providerConfig: configWith({ defaultRepository: SLUG }),
      githubTransport: transport,
      now: NOW,
    });
    expect(result.exitCode).toBe(0);
    expect(new URL(calls[0]!.url).pathname).toBe(`/repos/${SLUG}`);
  });

  it("lets an explicit repository override config", async () => {
    const OTHER = "another/repo";
    const { transport, calls } = recordingTransport(OTHER);
    const result = await runLocalCliProcess(["github", "next", OTHER, "--json"], {
      providerConfig: configWith({ defaultRepository: SLUG }),
      githubTransport: transport,
      now: NOW,
    });
    expect(result.exitCode).toBe(0);
    expect(new URL(calls[0]!.url).pathname).toBe(`/repos/${OTHER}`);
  });

  it("applies the configured default limit (repo + issues page size)", async () => {
    const { transport, calls } = recordingTransport(SLUG);
    await runLocalCliProcess(["github", "brief", "--json"], {
      providerConfig: configWith({ defaultRepository: SLUG, defaultLimit: 5 }),
      githubTransport: transport,
      now: NOW,
    });
    const issuesCall = calls.find((c) => new URL(c.url).pathname.endsWith("/issues"));
    expect(issuesCall).toBeDefined();
    expect(new URL(issuesCall!.url).searchParams.get("per_page")).toBe("4");
  });

  it("lets an explicit limit override config", async () => {
    const { transport, calls } = recordingTransport(SLUG);
    await runLocalCliProcess(["github", "brief", SLUG, "--limit", "3", "--json"], {
      providerConfig: configWith({ defaultRepository: SLUG, defaultLimit: 50 }),
      githubTransport: transport,
      now: NOW,
    });
    const issuesCall = calls.find((c) => new URL(c.url).pathname.endsWith("/issues"));
    expect(new URL(issuesCall!.url).searchParams.get("per_page")).toBe("2");
  });

  it("fails clearly when no repository is resolvable", async () => {
    const result = await runLocalCliProcess(["github", "brief", "--json"], {
      providerConfig: defaultProviderConfig(),
    });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("repository is required");
  });

  it("blocks a disabled provider before token read or transport", async () => {
    const { transport, calls } = recordingTransport(SLUG);
    const result = await runLocalCliProcess(["github", "brief", SLUG, "--json"], {
      providerConfig: configWith({ enabled: false, defaultRepository: SLUG }),
      githubTransport: transport,
    });
    expect(result.exitCode).toBe(2);
    expect(calls).toHaveLength(0);
    expect(result.stderr).toContain("disabled");
  });
});

describe("local commands never read provider configuration", () => {
  it("status ignores an injected provider config and token", async () => {
    const result = await runLocalCliProcess(["status"], {
      providerConfig: configWith({ enabled: false }),
      githubToken: "ghp_localsecret",
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("OH MY PM status: healthy");
    expect(result.stdout).not.toContain("ghp_localsecret");
  });
});

describe("deterministic repeated output", () => {
  it("status output is byte-identical across runs", async () => {
    const opts = { providerConfig: configWith({ defaultRepository: SLUG, defaultLimit: 25 }) };
    const a = await runLocalCliProcess(["providers", "status", "--json"], opts);
    const b = await runLocalCliProcess(["providers", "status", "--json"], opts);
    expect(a.stdout).toBe(b.stdout);
  });

  it("offline doctor output is byte-identical across runs", async () => {
    const opts = { providerConfig: configWith({ defaultRepository: SLUG }) };
    const a = await runLocalCliProcess(["providers", "doctor", "--json"], opts);
    const b = await runLocalCliProcess(["providers", "doctor", "--json"], opts);
    expect(a.stdout).toBe(b.stdout);
  });
});
