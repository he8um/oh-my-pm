import { loadLinearConfig } from "../src/connectors/linear/config";

afterEach(() => {
  delete process.env["OH_MY_PM_LINEAR_TEAM_ID"];
  delete process.env["OH_MY_PM_LINEAR_TOKEN"];
  delete process.env["OH_MY_PM_LINEAR_WORKSPACE_ID"];
  delete process.env["OH_MY_PM_LINEAR_PROJECT_ID"];
  delete process.env["OH_MY_PM_LINEAR_API_BASE_URL"];
});

describe("loadLinearConfig", () => {
  it("returns error when team ID is missing", () => {
    const result = loadLinearConfig();
    expect(result.config).toBeNull();
    expect(result.error).toContain("OH_MY_PM_LINEAR_TEAM_ID");
  });

  it("returns config when team ID is set, token optional", () => {
    process.env["OH_MY_PM_LINEAR_TEAM_ID"] = "team-1234";
    const result = loadLinearConfig();
    expect(result.error).toBeNull();
    expect(result.config?.teamId).toBe("team-1234");
    expect(result.config?.token).toBeNull();
  });

  it("reads token from environment", () => {
    process.env["OH_MY_PM_LINEAR_TEAM_ID"] = "team-1234";
    process.env["OH_MY_PM_LINEAR_TOKEN"] = "placeholder-token";
    const result = loadLinearConfig();
    expect(result.config?.token).toBe("placeholder-token");
  });

  it("reads optional workspace and project IDs from environment", () => {
    process.env["OH_MY_PM_LINEAR_TEAM_ID"] = "team-1234";
    process.env["OH_MY_PM_LINEAR_WORKSPACE_ID"] = "workspace-1";
    process.env["OH_MY_PM_LINEAR_PROJECT_ID"] = "project-1";
    const result = loadLinearConfig();
    expect(result.config?.workspaceId).toBe("workspace-1");
    expect(result.config?.projectId).toBe("project-1");
  });

  it("uses default API base URL when not set", () => {
    process.env["OH_MY_PM_LINEAR_TEAM_ID"] = "team-1234";
    const result = loadLinearConfig();
    expect(result.config?.apiBaseUrl).toBe("https://api.linear.app/graphql");
  });

  it("respects custom API base URL", () => {
    process.env["OH_MY_PM_LINEAR_TEAM_ID"] = "team-1234";
    process.env["OH_MY_PM_LINEAR_API_BASE_URL"] = "https://linear.example.com/graphql";
    const result = loadLinearConfig();
    expect(result.config?.apiBaseUrl).toBe("https://linear.example.com/graphql");
  });
});
