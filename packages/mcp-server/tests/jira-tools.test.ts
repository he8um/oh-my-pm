import { jiraListIssues } from "../src/tools/jira-list-issues";
import { jiraSummarizeIssue } from "../src/tools/jira-summarize-issue";
import { jiraSummarizeProjectStatus } from "../src/tools/jira-summarize-project-status";
import { jiraListProjects } from "../src/tools/jira-list-projects";
import { jiraListBoards } from "../src/tools/jira-list-boards";
import { JiraClient } from "../src/connectors/jira/client";

type GetFn = JiraClient["get"];
let mockGet: jest.MockedFunction<GetFn>;

beforeEach(() => {
  process.env["OH_MY_PM_JIRA_BASE_URL"] = "https://example.atlassian.net";
  process.env["OH_MY_PM_JIRA_PROJECT_KEY"] = "PROJ";
  process.env["OH_MY_PM_JIRA_EMAIL"] = "user@example.com";
  process.env["OH_MY_PM_JIRA_TOKEN"] = "placeholder-token";
  mockGet = jest.fn();
  Object.defineProperty(JiraClient.prototype, "get", {
    value: mockGet,
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  delete process.env["OH_MY_PM_JIRA_BASE_URL"];
  delete process.env["OH_MY_PM_JIRA_PROJECT_KEY"];
  delete process.env["OH_MY_PM_JIRA_EMAIL"];
  delete process.env["OH_MY_PM_JIRA_TOKEN"];
  delete process.env["OH_MY_PM_JIRA_BOARD_ID"];
  jest.restoreAllMocks();
});

function rawIssue(overrides: Record<string, unknown> = {}) {
  return {
    id: "10001",
    key: "PROJ-1",
    fields: {
      summary: "Fix auth bug",
      status: { name: "Blocked", statusCategory: { key: "indeterminate" } },
      assignee: null,
      priority: { name: "High" },
      duedate: null,
      updated: new Date().toISOString(),
      description: "Detailed description",
      labels: [],
      ...overrides,
    },
  };
}

describe("jira_list_issues — config missing", () => {
  it("returns config_missing error when project key not set", async () => {
    delete process.env["OH_MY_PM_JIRA_PROJECT_KEY"];
    const result = (await jiraListIssues({})) as Record<string, unknown>;
    expect(result["status"]).toBe("error");
    expect(result["error_code"]).toBe("config_missing");
  });

  it("returns degraded response when email/token missing", async () => {
    delete process.env["OH_MY_PM_JIRA_TOKEN"];
    const result = (await jiraListIssues({})) as Record<string, unknown>;
    expect(result["status"]).toBe("degraded");
    expect(result["error_code"]).toBe("auth_required");
  });
});

describe("jira_list_issues — mocked success", () => {
  it("returns issues on success with delivery tags", async () => {
    mockGet.mockResolvedValueOnce({
      data: { issues: [rawIssue()] },
      error: null,
      headers: {},
    });
    const result = (await jiraListIssues({})) as Record<string, unknown>;
    expect(result["status"]).toBe("ok");
    const issues = result["issues"] as Record<string, unknown>[];
    expect(issues.length).toBe(1);
    expect(issues[0]!["delivery_tags"]).toContain("blocked");
    expect(issues[0]!["delivery_tags"]).toContain("unassigned");
  });
});

describe("jira_list_issues — auth error", () => {
  it("returns auth_failed error on 401", async () => {
    mockGet.mockResolvedValueOnce({
      data: null,
      error: { status: "error", error_code: "auth_failed", message: "check credentials" },
      headers: {},
    });
    const result = (await jiraListIssues({})) as Record<string, unknown>;
    expect(result["status"]).toBe("error");
    expect(result["error_code"]).toBe("auth_failed");
  });
});

describe("jira_summarize_issue", () => {
  it("returns config_missing when not configured", async () => {
    delete process.env["OH_MY_PM_JIRA_PROJECT_KEY"];
    const result = (await jiraSummarizeIssue({ issue_key: "PROJ-1" })) as Record<
      string,
      unknown
    >;
    expect(result["status"]).toBe("error");
    expect(result["error_code"]).toBe("config_missing");
  });

  it("returns resource_not_found when issue missing", async () => {
    mockGet.mockResolvedValueOnce({ data: null, error: null, headers: {} });
    const result = (await jiraSummarizeIssue({ issue_key: "PROJ-404" })) as Record<
      string,
      unknown
    >;
    expect(result["status"]).toBe("error");
    expect(result["error_code"]).toBe("resource_not_found");
  });

  it("returns issue on success", async () => {
    mockGet.mockResolvedValueOnce({
      data: rawIssue({ key: "PROJ-42" }),
      error: null,
      headers: {},
    });
    const result = (await jiraSummarizeIssue({ issue_key: "PROJ-42" })) as Record<
      string,
      unknown
    >;
    expect(result["status"]).toBe("ok");
    const issue = result["issue"] as Record<string, unknown>;
    expect(issue["key"]).toBe("PROJ-1");
    expect(issue["delivery_tags"] as string[]).toContain("blocked");
  });
});

describe("jira_summarize_project_status", () => {
  it("summarizes blockers, unassigned, and overdue issues without a board configured", async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        issues: [
          rawIssue({ id: "1", key: "PROJ-1" }),
          {
            id: "2",
            key: "PROJ-2",
            fields: {
              summary: "Healthy issue",
              status: { name: "In Progress", statusCategory: { key: "indeterminate" } },
              assignee: { displayName: "alice" },
              priority: { name: "Medium" },
              duedate: "2099-01-01",
              updated: new Date().toISOString(),
              description: null,
              labels: [],
              customfield_10016: 5,
              sprint: { name: "Sprint 1" },
            },
          },
        ],
      },
      error: null,
      headers: {},
    });
    const result = (await jiraSummarizeProjectStatus({})) as Record<string, unknown>;
    expect(result["status"]).toBe("ok");
    const summary = result["summary"] as Record<string, number>;
    expect(summary["open_issue_count"]).toBe(2);
    expect(summary["blockers"]).toBe(1);
    expect(summary["unassigned"]).toBe(1);
    expect(result["active_sprint"]).toBeNull();
    expect(Array.isArray(result["limitations"])).toBe(true);
  });

  it("includes active sprint completion rate when a board is configured", async () => {
    process.env["OH_MY_PM_JIRA_BOARD_ID"] = "5";
    mockGet
      .mockResolvedValueOnce({ data: { issues: [] }, error: null, headers: {} })
      .mockResolvedValueOnce({
        data: { values: [{ id: 100, name: "Sprint 1", state: "active", startDate: null, endDate: null }] },
        error: null,
        headers: {},
      })
      .mockResolvedValueOnce({
        data: {
          issues: [
            { fields: { status: { statusCategory: { key: "done" } } } },
            { fields: { status: { statusCategory: { key: "indeterminate" } } } },
          ],
        },
        error: null,
        headers: {},
      });
    const result = (await jiraSummarizeProjectStatus({})) as Record<string, unknown>;
    expect(result["status"]).toBe("ok");
    const sprint = result["active_sprint"] as Record<string, unknown>;
    expect(sprint["name"]).toBe("Sprint 1");
    expect(sprint["completion_rate"]).toBe(50);
  });
});

describe("jira_list_projects", () => {
  it("returns projects on success", async () => {
    mockGet.mockResolvedValueOnce({
      data: { values: [{ id: "10000", key: "PROJ", name: "Delivery Project" }] },
      error: null,
      headers: {},
    });
    const result = (await jiraListProjects()) as Record<string, unknown>;
    expect(result["status"]).toBe("ok");
    const projects = result["projects"] as Record<string, unknown>[];
    expect(projects[0]!["key"]).toBe("PROJ");
  });
});

describe("jira_list_boards", () => {
  it("returns boards on success", async () => {
    mockGet.mockResolvedValueOnce({
      data: { values: [{ id: 5, name: "Delivery Board", type: "scrum" }] },
      error: null,
      headers: {},
    });
    const result = (await jiraListBoards()) as Record<string, unknown>;
    expect(result["status"]).toBe("ok");
    const boards = result["boards"] as Record<string, unknown>[];
    expect(boards[0]!["name"]).toBe("Delivery Board");
  });
});

describe("token and email redaction", () => {
  it("does not include token or email in error output", async () => {
    mockGet.mockResolvedValueOnce({
      data: null,
      error: {
        status: "error",
        error_code: "auth_failed",
        message: "Jira returned 401. Check that OH_MY_PM_JIRA_EMAIL and OH_MY_PM_JIRA_TOKEN are valid.",
      },
      headers: {},
    });
    const result = (await jiraListIssues({})) as Record<string, unknown>;
    const json = JSON.stringify(result);
    expect(json).not.toContain("placeholder-token");
    expect(json).not.toContain("user@example.com");
  });
});
