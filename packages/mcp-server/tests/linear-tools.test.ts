import { linearListIssues } from "../src/tools/linear-list-issues";
import { linearSummarizeIssue } from "../src/tools/linear-summarize-issue";
import { linearSummarizeProjectStatus } from "../src/tools/linear-summarize-project-status";
import { linearListTeams } from "../src/tools/linear-list-teams";
import { linearListProjects } from "../src/tools/linear-list-projects";
import { LinearClient } from "../src/connectors/linear/client";

type QueryFn = LinearClient["query"];
let mockQuery: jest.MockedFunction<QueryFn>;

beforeEach(() => {
  process.env["OH_MY_PM_LINEAR_TEAM_ID"] = "team-1234";
  process.env["OH_MY_PM_LINEAR_TOKEN"] = "placeholder-token";
  mockQuery = jest.fn();
  Object.defineProperty(LinearClient.prototype, "query", {
    value: mockQuery,
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  delete process.env["OH_MY_PM_LINEAR_TEAM_ID"];
  delete process.env["OH_MY_PM_LINEAR_TOKEN"];
  delete process.env["OH_MY_PM_LINEAR_PROJECT_ID"];
  jest.restoreAllMocks();
});

function rawIssue(overrides: Record<string, unknown> = {}) {
  return {
    id: "issue-1",
    identifier: "ENG-1",
    title: "Fix auth bug",
    state: { name: "Blocked", type: "started" },
    assignee: null,
    priorityLabel: "High",
    estimate: null,
    cycle: null,
    labels: { nodes: [] },
    updatedAt: new Date().toISOString(),
    description: "Detailed description",
    url: "https://linear.app/team/issue/ENG-1",
    ...overrides,
  };
}

describe("linear_list_issues — config missing", () => {
  it("returns config_missing error when team ID not set", async () => {
    delete process.env["OH_MY_PM_LINEAR_TEAM_ID"];
    const result = (await linearListIssues({})) as Record<string, unknown>;
    expect(result["status"]).toBe("error");
    expect(result["error_code"]).toBe("config_missing");
  });

  it("returns degraded response when token missing", async () => {
    delete process.env["OH_MY_PM_LINEAR_TOKEN"];
    const result = (await linearListIssues({})) as Record<string, unknown>;
    expect(result["status"]).toBe("degraded");
    expect(result["error_code"]).toBe("auth_required");
  });
});

describe("linear_list_issues — mocked success", () => {
  it("returns issues on success with delivery tags", async () => {
    mockQuery.mockResolvedValueOnce({
      data: { team: { issues: { nodes: [rawIssue()] } } },
      error: null,
      headers: {},
    });
    const result = (await linearListIssues({})) as Record<string, unknown>;
    expect(result["status"]).toBe("ok");
    const issues = result["issues"] as Record<string, unknown>[];
    expect(issues.length).toBe(1);
    expect(issues[0]!["delivery_tags"]).toContain("blocked");
    expect(issues[0]!["delivery_tags"]).toContain("unassigned");
  });
});

describe("linear_list_issues — auth error", () => {
  it("returns auth_failed error on GraphQL auth error", async () => {
    mockQuery.mockResolvedValueOnce({
      data: null,
      error: { status: "error", error_code: "auth_failed", message: "check token" },
      headers: {},
    });
    const result = (await linearListIssues({})) as Record<string, unknown>;
    expect(result["status"]).toBe("error");
    expect(result["error_code"]).toBe("auth_failed");
  });
});

describe("linear_summarize_issue", () => {
  it("returns config_missing when not configured", async () => {
    delete process.env["OH_MY_PM_LINEAR_TEAM_ID"];
    const result = (await linearSummarizeIssue({ issue_id: "ENG-1" })) as Record<
      string,
      unknown
    >;
    expect(result["status"]).toBe("error");
    expect(result["error_code"]).toBe("config_missing");
  });

  it("returns resource_not_found when issue missing", async () => {
    mockQuery.mockResolvedValueOnce({ data: { issue: null }, error: null, headers: {} });
    const result = (await linearSummarizeIssue({ issue_id: "ENG-404" })) as Record<
      string,
      unknown
    >;
    expect(result["status"]).toBe("error");
    expect(result["error_code"]).toBe("resource_not_found");
  });

  it("returns issue on success", async () => {
    mockQuery.mockResolvedValueOnce({
      data: { issue: rawIssue({ identifier: "ENG-42", title: "Blocked by vendor" }) },
      error: null,
      headers: {},
    });
    const result = (await linearSummarizeIssue({ issue_id: "ENG-42" })) as Record<
      string,
      unknown
    >;
    expect(result["status"]).toBe("ok");
    const issue = result["issue"] as Record<string, unknown>;
    expect(issue["identifier"]).toBe("ENG-42");
    expect(issue["delivery_tags"] as string[]).toContain("blocked");
  });
});

describe("linear_summarize_project_status", () => {
  it("returns summary with blockers, unassigned, and missing estimates", async () => {
    mockQuery.mockResolvedValueOnce({
      data: {
        team: {
          issues: {
            nodes: [
              rawIssue({ id: "issue-1", identifier: "ENG-1" }),
              rawIssue({
                id: "issue-2",
                identifier: "ENG-2",
                state: { name: "In Progress", type: "started" },
                assignee: { name: "alice" },
                estimate: 3,
                cycle: { name: "Cycle 1" },
              }),
            ],
          },
        },
      },
      error: null,
      headers: {},
    });
    const result = (await linearSummarizeProjectStatus({})) as Record<string, unknown>;
    expect(result["status"]).toBe("ok");
    const summary = result["summary"] as Record<string, number>;
    expect(summary["open_issue_count"]).toBe(2);
    expect(summary["blockers"]).toBe(1);
    expect(summary["unassigned"]).toBe(1);
    expect(Array.isArray(result["limitations"])).toBe(true);
  });
});

describe("linear_list_teams", () => {
  it("returns teams on success", async () => {
    mockQuery.mockResolvedValueOnce({
      data: { teams: { nodes: [{ id: "team-1234", key: "ENG", name: "Engineering" }] } },
      error: null,
      headers: {},
    });
    const result = (await linearListTeams()) as Record<string, unknown>;
    expect(result["status"]).toBe("ok");
    const teams = result["teams"] as Record<string, unknown>[];
    expect(teams[0]!["key"]).toBe("ENG");
  });
});

describe("linear_list_projects", () => {
  it("returns projects on success", async () => {
    mockQuery.mockResolvedValueOnce({
      data: {
        team: {
          projects: {
            nodes: [{ id: "project-1", name: "Payments v2", state: "started", targetDate: null }],
          },
        },
      },
      error: null,
      headers: {},
    });
    const result = (await linearListProjects()) as Record<string, unknown>;
    expect(result["status"]).toBe("ok");
    const projects = result["projects"] as Record<string, unknown>[];
    expect(projects[0]!["name"]).toBe("Payments v2");
  });
});

describe("token redaction", () => {
  it("does not include token in error output", async () => {
    mockQuery.mockResolvedValueOnce({
      data: null,
      error: {
        status: "error",
        error_code: "auth_failed",
        message: "Linear returned an authentication error. Check that OH_MY_PM_LINEAR_TOKEN is valid.",
      },
      headers: {},
    });
    const result = (await linearListIssues({})) as Record<string, unknown>;
    const json = JSON.stringify(result);
    expect(json).not.toContain("placeholder-token");
    expect(json).not.toContain("lin_api_");
  });
});
