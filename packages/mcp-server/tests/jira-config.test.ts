import { loadJiraConfig } from "../src/connectors/jira/config";

afterEach(() => {
  delete process.env["OH_MY_PM_JIRA_BASE_URL"];
  delete process.env["OH_MY_PM_JIRA_EMAIL"];
  delete process.env["OH_MY_PM_JIRA_TOKEN"];
  delete process.env["OH_MY_PM_JIRA_PROJECT_KEY"];
  delete process.env["OH_MY_PM_JIRA_BOARD_ID"];
});

describe("loadJiraConfig", () => {
  it("returns error when base URL is missing", () => {
    const result = loadJiraConfig();
    expect(result.config).toBeNull();
    expect(result.error).toContain("OH_MY_PM_JIRA_BASE_URL");
  });

  it("returns error when project key is missing", () => {
    process.env["OH_MY_PM_JIRA_BASE_URL"] = "https://example.atlassian.net";
    const result = loadJiraConfig();
    expect(result.config).toBeNull();
    expect(result.error).toContain("OH_MY_PM_JIRA_PROJECT_KEY");
  });

  it("returns config when base URL and project key are set, email/token optional", () => {
    process.env["OH_MY_PM_JIRA_BASE_URL"] = "https://example.atlassian.net";
    process.env["OH_MY_PM_JIRA_PROJECT_KEY"] = "PROJ";
    const result = loadJiraConfig();
    expect(result.error).toBeNull();
    expect(result.config?.baseUrl).toBe("https://example.atlassian.net");
    expect(result.config?.projectKey).toBe("PROJ");
    expect(result.config?.email).toBeNull();
    expect(result.config?.token).toBeNull();
  });

  it("reads email and token from environment", () => {
    process.env["OH_MY_PM_JIRA_BASE_URL"] = "https://example.atlassian.net";
    process.env["OH_MY_PM_JIRA_PROJECT_KEY"] = "PROJ";
    process.env["OH_MY_PM_JIRA_EMAIL"] = "user@example.com";
    process.env["OH_MY_PM_JIRA_TOKEN"] = "placeholder-token";
    const result = loadJiraConfig();
    expect(result.config?.email).toBe("user@example.com");
    expect(result.config?.token).toBe("placeholder-token");
  });

  it("reads optional board ID from environment", () => {
    process.env["OH_MY_PM_JIRA_BASE_URL"] = "https://example.atlassian.net";
    process.env["OH_MY_PM_JIRA_PROJECT_KEY"] = "PROJ";
    process.env["OH_MY_PM_JIRA_BOARD_ID"] = "42";
    const result = loadJiraConfig();
    expect(result.config?.boardId).toBe("42");
  });
});
