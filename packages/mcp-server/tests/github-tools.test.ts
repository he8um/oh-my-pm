import { githubListIssues } from "../src/tools/github-list-issues";
import { githubSummarizeIssue } from "../src/tools/github-summarize-issue";
import { githubListMilestones } from "../src/tools/github-list-milestones";
import { githubGetRepositoryContext } from "../src/tools/github-get-repository-context";
import { GitHubClient } from "../src/connectors/github/client";

type GetFn = GitHubClient["get"];
let mockGet: jest.MockedFunction<GetFn>;

beforeEach(() => {
  process.env["OH_MY_PM_GITHUB_OWNER"] = "testorg";
  process.env["OH_MY_PM_GITHUB_REPO"] = "testrepo";
  process.env["OH_MY_PM_GITHUB_TOKEN"] = "placeholder-token";
  mockGet = jest.fn();
  // Replace the prototype method so all instances use the mock
  Object.defineProperty(GitHubClient.prototype, "get", {
    value: mockGet,
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  delete process.env["OH_MY_PM_GITHUB_OWNER"];
  delete process.env["OH_MY_PM_GITHUB_REPO"];
  delete process.env["OH_MY_PM_GITHUB_TOKEN"];
  jest.restoreAllMocks();
});

describe("github_list_issues — config missing", () => {
  it("returns config_missing error when owner/repo not set", async () => {
    delete process.env["OH_MY_PM_GITHUB_OWNER"];
    delete process.env["OH_MY_PM_GITHUB_REPO"];
    const result = await githubListIssues({}) as Record<string, unknown>;
    expect(result["status"]).toBe("error");
    expect(result["error_code"]).toBe("config_missing");
  });
});

describe("github_list_issues — mocked success", () => {
  it("returns issues on 200 response", async () => {
    mockGet.mockResolvedValueOnce({
      data: [
        {
          number: 1,
          title: "Fix auth bug",
          state: "open",
          assignees: [{ login: "alice" }],
          labels: [{ name: "blocker" }],
          created_at: "2026-06-01T00:00:00Z",
          updated_at: "2026-06-30T00:00:00Z",
          body: "Detailed description",
          html_url: "https://github.com/testorg/testrepo/issues/1",
        },
      ],
      error: null,
      headers: {},
    });
    const result = await githubListIssues({}) as Record<string, unknown>;
    expect(result["status"]).toBe("ok");
    const issues = result["issues"] as unknown[];
    expect(Array.isArray(issues)).toBe(true);
    expect(issues.length).toBe(1);
  });
});

describe("github_list_issues — 401 auth error", () => {
  it("returns auth_failed error on 401", async () => {
    mockGet.mockResolvedValueOnce({
      data: null,
      error: { status: "error", error_code: "auth_failed", message: "check token" },
      headers: {},
    });
    const result = await githubListIssues({}) as Record<string, unknown>;
    expect(result["status"]).toBe("error");
    expect(result["error_code"]).toBe("auth_failed");
  });
});

describe("github_summarize_issue", () => {
  it("returns config_missing when not configured", async () => {
    delete process.env["OH_MY_PM_GITHUB_OWNER"];
    delete process.env["OH_MY_PM_GITHUB_REPO"];
    const result = await githubSummarizeIssue({ issue_number: 1 }) as Record<string, unknown>;
    expect(result["status"]).toBe("error");
    expect(result["error_code"]).toBe("config_missing");
  });

  it("returns issue on success", async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        number: 42,
        title: "Blocked by vendor",
        state: "open",
        assignees: [],
        labels: [{ name: "blocker" }],
        created_at: "2026-06-01T00:00:00Z",
        updated_at: "2026-06-30T00:00:00Z",
        body: null,
        html_url: "https://github.com/testorg/testrepo/issues/42",
      },
      error: null,
      headers: {},
    });
    const result = await githubSummarizeIssue({ issue_number: 42 }) as Record<string, unknown>;
    expect(result["status"]).toBe("ok");
    const issue = result["issue"] as Record<string, unknown>;
    expect(issue["number"]).toBe(42);
    expect((issue["delivery_tags"] as string[])).toContain("blocker");
  });
});

describe("github_list_milestones", () => {
  it("returns milestones with completion percentage", async () => {
    mockGet.mockResolvedValueOnce({
      data: [
        {
          number: 1,
          title: "v1.0",
          state: "open",
          due_on: "2026-12-31T00:00:00Z",
          open_issues: 4,
          closed_issues: 6,
          html_url: "https://github.com/testorg/testrepo/milestone/1",
        },
      ],
      error: null,
      headers: {},
    });
    const result = await githubListMilestones() as Record<string, unknown>;
    expect(result["status"]).toBe("ok");
    const milestones = result["milestones"] as Record<string, unknown>[];
    expect(milestones[0]["completion_pct"]).toBe(60);
  });
});

describe("github_get_repository_context", () => {
  it("returns repository context on success", async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        name: "testrepo",
        full_name: "testorg/testrepo",
        description: "Test repository",
        default_branch: "main",
        open_issues_count: 5,
        private: false,
        html_url: "https://github.com/testorg/testrepo",
      },
      error: null,
      headers: {},
    });
    const result = await githubGetRepositoryContext() as Record<string, unknown>;
    expect(result["status"]).toBe("ok");
    const repo = result["repository"] as Record<string, unknown>;
    expect(repo["name"]).toBe("testrepo");
    expect(repo["is_private"]).toBe(false);
  });
});

describe("token redaction", () => {
  it("does not include token in error output", async () => {
    mockGet.mockResolvedValueOnce({
      data: null,
      error: {
        status: "error",
        error_code: "auth_failed",
        message: "GitHub returned 401. Check that OH_MY_PM_GITHUB_TOKEN is valid.",
      },
      headers: {},
    });
    const result = await githubListIssues({}) as Record<string, unknown>;
    const json = JSON.stringify(result);
    expect(json).not.toContain("placeholder-token");
    expect(json).not.toContain("ghp_");
    expect(json).not.toContain("github_pat_");
  });
});
