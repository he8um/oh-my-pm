import { clickupListTasks } from "../src/tools/clickup-list-tasks";
import { clickupSummarizeTask } from "../src/tools/clickup-summarize-task";
import { clickupSummarizeListStatus } from "../src/tools/clickup-summarize-list-status";
import { clickupListSpaces } from "../src/tools/clickup-list-spaces";
import { clickupListFolders } from "../src/tools/clickup-list-folders";
import { clickupListLists } from "../src/tools/clickup-list-lists";
import { clickupGetWorkspaceContext } from "../src/tools/clickup-get-workspace-context";
import { ClickUpClient } from "../src/connectors/clickup/client";

type GetFn = ClickUpClient["get"];
let mockGet: jest.MockedFunction<GetFn>;

beforeEach(() => {
  process.env["OH_MY_PM_CLICKUP_WORKSPACE_ID"] = "9000000";
  process.env["OH_MY_PM_CLICKUP_TOKEN"] = "placeholder-token";
  mockGet = jest.fn();
  Object.defineProperty(ClickUpClient.prototype, "get", {
    value: mockGet,
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  delete process.env["OH_MY_PM_CLICKUP_WORKSPACE_ID"];
  delete process.env["OH_MY_PM_CLICKUP_TOKEN"];
  delete process.env["OH_MY_PM_CLICKUP_LIST_ID"];
  delete process.env["OH_MY_PM_CLICKUP_SPACE_ID"];
  delete process.env["OH_MY_PM_CLICKUP_FOLDER_ID"];
  jest.restoreAllMocks();
});

describe("clickup_list_tasks — config missing", () => {
  it("returns config_missing error when workspace ID not set", async () => {
    delete process.env["OH_MY_PM_CLICKUP_WORKSPACE_ID"];
    const result = (await clickupListTasks({ list_id: "list-1" })) as Record<string, unknown>;
    expect(result["status"]).toBe("error");
    expect(result["error_code"]).toBe("config_missing");
  });

  it("returns degraded response when token missing", async () => {
    delete process.env["OH_MY_PM_CLICKUP_TOKEN"];
    const result = (await clickupListTasks({ list_id: "list-1" })) as Record<string, unknown>;
    expect(result["status"]).toBe("degraded");
    expect(result["error_code"]).toBe("auth_required");
  });

  it("returns config_missing when no list_id available", async () => {
    const result = (await clickupListTasks({})) as Record<string, unknown>;
    expect(result["status"]).toBe("error");
    expect(result["error_code"]).toBe("config_missing");
  });
});

describe("clickup_list_tasks — mocked success", () => {
  it("returns tasks on 200 response with delivery tags", async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        tasks: [
          {
            id: "task-1",
            name: "Fix auth bug",
            status: { status: "blocked" },
            assignees: [],
            priority: null,
            due_date: null,
            date_updated: `${Date.now()}`,
            description: "Detailed description",
            url: "https://app.clickup.com/t/task-1",
          },
        ],
      },
      error: null,
      headers: {},
    });
    const result = (await clickupListTasks({ list_id: "list-1" })) as Record<string, unknown>;
    expect(result["status"]).toBe("ok");
    const tasks = result["tasks"] as Record<string, unknown>[];
    expect(tasks.length).toBe(1);
    expect(tasks[0]!["delivery_tags"]).toContain("blocked");
    expect(tasks[0]!["delivery_tags"]).toContain("unassigned");
  });

  it("uses OH_MY_PM_CLICKUP_LIST_ID as default when list_id omitted", async () => {
    process.env["OH_MY_PM_CLICKUP_LIST_ID"] = "default-list";
    mockGet.mockResolvedValueOnce({ data: { tasks: [] }, error: null, headers: {} });
    const result = (await clickupListTasks({})) as Record<string, unknown>;
    expect(result["status"]).toBe("ok");
    expect(result["list_id"]).toBe("default-list");
  });
});

describe("clickup_list_tasks — 401 auth error", () => {
  it("returns auth_failed error on 401", async () => {
    mockGet.mockResolvedValueOnce({
      data: null,
      error: { status: "error", error_code: "auth_failed", message: "check token" },
      headers: {},
    });
    const result = (await clickupListTasks({ list_id: "list-1" })) as Record<string, unknown>;
    expect(result["status"]).toBe("error");
    expect(result["error_code"]).toBe("auth_failed");
  });
});

describe("clickup_summarize_task", () => {
  it("returns config_missing when not configured", async () => {
    delete process.env["OH_MY_PM_CLICKUP_WORKSPACE_ID"];
    const result = (await clickupSummarizeTask({ task_id: "task-1" })) as Record<
      string,
      unknown
    >;
    expect(result["status"]).toBe("error");
    expect(result["error_code"]).toBe("config_missing");
  });

  it("returns resource_not_found when task missing", async () => {
    mockGet.mockResolvedValueOnce({ data: null, error: null, headers: {} });
    const result = (await clickupSummarizeTask({ task_id: "task-404" })) as Record<
      string,
      unknown
    >;
    expect(result["status"]).toBe("error");
    expect(result["error_code"]).toBe("resource_not_found");
  });

  it("returns task on success", async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        id: "task-42",
        name: "Blocked by vendor",
        status: { status: "blocked" },
        assignees: [{ username: "alice" }],
        priority: { priority: "urgent" },
        due_date: null,
        date_updated: `${Date.now()}`,
        description: null,
        url: "https://app.clickup.com/t/task-42",
      },
      error: null,
      headers: {},
    });
    const result = (await clickupSummarizeTask({ task_id: "task-42" })) as Record<
      string,
      unknown
    >;
    expect(result["status"]).toBe("ok");
    const task = result["task"] as Record<string, unknown>;
    expect(task["id"]).toBe("task-42");
    expect(task["delivery_tags"] as string[]).toContain("blocked");
  });
});

describe("clickup_summarize_list_status", () => {
  it("returns config_missing when no list_id available", async () => {
    const result = (await clickupSummarizeListStatus({})) as Record<string, unknown>;
    expect(result["status"]).toBe("error");
    expect(result["error_code"]).toBe("config_missing");
  });

  it("summarizes blockers, unassigned, and overdue tasks", async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        tasks: [
          {
            id: "task-1",
            name: "Blocked task",
            status: { status: "blocked" },
            assignees: [],
            priority: null,
            due_date: `${new Date("2000-01-01").getTime()}`,
            date_updated: `${Date.now()}`,
            description: null,
            url: "https://app.clickup.com/t/task-1",
          },
          {
            id: "task-2",
            name: "Healthy task",
            status: { status: "in progress" },
            assignees: [{ username: "alice" }],
            priority: null,
            due_date: `${new Date("2099-01-01").getTime()}`,
            date_updated: `${Date.now()}`,
            description: null,
            url: "https://app.clickup.com/t/task-2",
          },
        ],
      },
      error: null,
      headers: {},
    });
    const result = (await clickupSummarizeListStatus({ list_id: "list-1" })) as Record<
      string,
      unknown
    >;
    expect(result["status"]).toBe("ok");
    const summary = result["summary"] as Record<string, number>;
    expect(summary["open_task_count"]).toBe(2);
    expect(summary["blockers"]).toBe(1);
    expect(summary["unassigned"]).toBe(1);
    expect(summary["overdue"]).toBe(1);
    expect(Array.isArray(result["limitations"])).toBe(true);
  });
});

describe("clickup_list_spaces", () => {
  it("returns spaces on success", async () => {
    mockGet.mockResolvedValueOnce({
      data: { spaces: [{ id: "space-1", name: "Engineering", archived: false }] },
      error: null,
      headers: {},
    });
    const result = (await clickupListSpaces()) as Record<string, unknown>;
    expect(result["status"]).toBe("ok");
    const spaces = result["spaces"] as Record<string, unknown>[];
    expect(spaces[0]!["name"]).toBe("Engineering");
  });
});

describe("clickup_list_folders", () => {
  it("returns config_missing when no space_id available", async () => {
    const result = (await clickupListFolders({})) as Record<string, unknown>;
    expect(result["status"]).toBe("error");
    expect(result["error_code"]).toBe("config_missing");
  });

  it("returns folders on success", async () => {
    mockGet.mockResolvedValueOnce({
      data: { folders: [{ id: "folder-1", name: "Sprints", archived: false, lists: [{ id: "l1" }] }] },
      error: null,
      headers: {},
    });
    const result = (await clickupListFolders({ space_id: "space-1" })) as Record<
      string,
      unknown
    >;
    expect(result["status"]).toBe("ok");
    const folders = result["folders"] as Record<string, unknown>[];
    expect(folders[0]!["list_count"]).toBe(1);
  });
});

describe("clickup_list_lists", () => {
  it("returns config_missing when neither folder_id nor space_id available", async () => {
    const result = (await clickupListLists({})) as Record<string, unknown>;
    expect(result["status"]).toBe("error");
    expect(result["error_code"]).toBe("config_missing");
  });

  it("returns lists for a folder on success", async () => {
    mockGet.mockResolvedValueOnce({
      data: { lists: [{ id: "list-1", name: "Backlog", archived: false, task_count: 5 }] },
      error: null,
      headers: {},
    });
    const result = (await clickupListLists({ folder_id: "folder-1" })) as Record<
      string,
      unknown
    >;
    expect(result["status"]).toBe("ok");
    expect(result["folder_id"]).toBe("folder-1");
  });

  it("falls back to folderless space lists when no folder available", async () => {
    mockGet.mockResolvedValueOnce({
      data: { lists: [{ id: "list-2", name: "Folderless list", archived: false, task_count: 2 }] },
      error: null,
      headers: {},
    });
    const result = (await clickupListLists({ space_id: "space-1" })) as Record<
      string,
      unknown
    >;
    expect(result["status"]).toBe("ok");
    expect(result["space_id"]).toBe("space-1");
  });
});

describe("clickup_get_workspace_context", () => {
  it("returns workspace context on success", async () => {
    mockGet
      .mockResolvedValueOnce({
        data: { teams: [{ id: "9000000", name: "Acme Workspace" }] },
        error: null,
        headers: {},
      })
      .mockResolvedValueOnce({
        data: { spaces: [{ id: "space-1", name: "Engineering", archived: false }] },
        error: null,
        headers: {},
      });
    const result = (await clickupGetWorkspaceContext()) as Record<string, unknown>;
    expect(result["status"]).toBe("ok");
    const workspace = result["workspace"] as Record<string, unknown>;
    expect(workspace["name"]).toBe("Acme Workspace");
    expect(workspace["space_count"]).toBe(1);
  });

  it("returns resource_not_found when workspace ID does not match any team", async () => {
    mockGet.mockResolvedValueOnce({
      data: { teams: [{ id: "other-workspace", name: "Other" }] },
      error: null,
      headers: {},
    });
    const result = (await clickupGetWorkspaceContext()) as Record<string, unknown>;
    expect(result["status"]).toBe("error");
    expect(result["error_code"]).toBe("resource_not_found");
  });
});

describe("token redaction", () => {
  it("does not include token in error output", async () => {
    mockGet.mockResolvedValueOnce({
      data: null,
      error: {
        status: "error",
        error_code: "auth_failed",
        message: "ClickUp returned 401. Check that OH_MY_PM_CLICKUP_TOKEN is valid.",
      },
      headers: {},
    });
    const result = (await clickupListTasks({ list_id: "list-1" })) as Record<string, unknown>;
    const json = JSON.stringify(result);
    expect(json).not.toContain("placeholder-token");
    expect(json).not.toContain("pk_");
  });
});
