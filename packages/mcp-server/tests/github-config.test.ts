import { loadGitHubConfig } from "../src/connectors/github/config";

afterEach(() => {
  delete process.env["OH_MY_PM_GITHUB_OWNER"];
  delete process.env["OH_MY_PM_GITHUB_REPO"];
  delete process.env["OH_MY_PM_GITHUB_TOKEN"];
  delete process.env["OH_MY_PM_GITHUB_API_BASE_URL"];
});

describe("loadGitHubConfig", () => {
  it("returns error when owner and repo are missing", () => {
    const result = loadGitHubConfig();
    expect(result.config).toBeNull();
    expect(result.error).toContain("OH_MY_PM_GITHUB_OWNER");
  });

  it("returns error when only owner is set", () => {
    process.env["OH_MY_PM_GITHUB_OWNER"] = "myorg";
    const result = loadGitHubConfig();
    expect(result.config).toBeNull();
    expect(result.error).not.toBeNull();
  });

  it("returns config when owner and repo are set, token optional", () => {
    process.env["OH_MY_PM_GITHUB_OWNER"] = "myorg";
    process.env["OH_MY_PM_GITHUB_REPO"] = "myrepo";
    const result = loadGitHubConfig();
    expect(result.error).toBeNull();
    expect(result.config?.owner).toBe("myorg");
    expect(result.config?.repo).toBe("myrepo");
    expect(result.config?.token).toBeNull();
  });

  it("reads token from environment", () => {
    process.env["OH_MY_PM_GITHUB_OWNER"] = "myorg";
    process.env["OH_MY_PM_GITHUB_REPO"] = "myrepo";
    process.env["OH_MY_PM_GITHUB_TOKEN"] = "placeholder-token";
    const result = loadGitHubConfig();
    expect(result.config?.token).toBe("placeholder-token");
  });

  it("uses default API base URL when not set", () => {
    process.env["OH_MY_PM_GITHUB_OWNER"] = "myorg";
    process.env["OH_MY_PM_GITHUB_REPO"] = "myrepo";
    const result = loadGitHubConfig();
    expect(result.config?.apiBaseUrl).toBe("https://api.github.com");
  });

  it("respects custom API base URL for GitHub Enterprise", () => {
    process.env["OH_MY_PM_GITHUB_OWNER"] = "myorg";
    process.env["OH_MY_PM_GITHUB_REPO"] = "myrepo";
    process.env["OH_MY_PM_GITHUB_API_BASE_URL"] = "https://github.example.com/api/v3";
    const result = loadGitHubConfig();
    expect(result.config?.apiBaseUrl).toBe("https://github.example.com/api/v3");
  });
});
