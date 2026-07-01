import { loadClickUpConfig } from "../src/connectors/clickup/config";

afterEach(() => {
  delete process.env["OH_MY_PM_CLICKUP_WORKSPACE_ID"];
  delete process.env["OH_MY_PM_CLICKUP_TOKEN"];
  delete process.env["OH_MY_PM_CLICKUP_SPACE_ID"];
  delete process.env["OH_MY_PM_CLICKUP_FOLDER_ID"];
  delete process.env["OH_MY_PM_CLICKUP_LIST_ID"];
  delete process.env["OH_MY_PM_CLICKUP_API_BASE_URL"];
});

describe("loadClickUpConfig", () => {
  it("returns error when workspace ID is missing", () => {
    const result = loadClickUpConfig();
    expect(result.config).toBeNull();
    expect(result.error).toContain("OH_MY_PM_CLICKUP_WORKSPACE_ID");
  });

  it("returns config when workspace ID is set, token optional", () => {
    process.env["OH_MY_PM_CLICKUP_WORKSPACE_ID"] = "1234567";
    const result = loadClickUpConfig();
    expect(result.error).toBeNull();
    expect(result.config?.workspaceId).toBe("1234567");
    expect(result.config?.token).toBeNull();
  });

  it("reads token from environment", () => {
    process.env["OH_MY_PM_CLICKUP_WORKSPACE_ID"] = "1234567";
    process.env["OH_MY_PM_CLICKUP_TOKEN"] = "placeholder-token";
    const result = loadClickUpConfig();
    expect(result.config?.token).toBe("placeholder-token");
  });

  it("reads optional space/folder/list IDs from environment", () => {
    process.env["OH_MY_PM_CLICKUP_WORKSPACE_ID"] = "1234567";
    process.env["OH_MY_PM_CLICKUP_SPACE_ID"] = "space-1";
    process.env["OH_MY_PM_CLICKUP_FOLDER_ID"] = "folder-1";
    process.env["OH_MY_PM_CLICKUP_LIST_ID"] = "list-1";
    const result = loadClickUpConfig();
    expect(result.config?.spaceId).toBe("space-1");
    expect(result.config?.folderId).toBe("folder-1");
    expect(result.config?.listId).toBe("list-1");
  });

  it("uses default API base URL when not set", () => {
    process.env["OH_MY_PM_CLICKUP_WORKSPACE_ID"] = "1234567";
    const result = loadClickUpConfig();
    expect(result.config?.apiBaseUrl).toBe("https://api.clickup.com/api/v2");
  });

  it("respects custom API base URL", () => {
    process.env["OH_MY_PM_CLICKUP_WORKSPACE_ID"] = "1234567";
    process.env["OH_MY_PM_CLICKUP_API_BASE_URL"] = "https://clickup.example.com/api/v2";
    const result = loadClickUpConfig();
    expect(result.config?.apiBaseUrl).toBe("https://clickup.example.com/api/v2");
  });
});
