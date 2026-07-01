import { loadNotionConfig } from "../src/connectors/notion/config";

afterEach(() => {
  delete process.env["OH_MY_PM_NOTION_TOKEN"];
  delete process.env["OH_MY_PM_NOTION_PAGE_ID"];
  delete process.env["OH_MY_PM_NOTION_DATABASE_ID"];
  delete process.env["OH_MY_PM_NOTION_API_BASE_URL"];
});

describe("loadNotionConfig", () => {
  it("returns a config with null token when nothing is set", () => {
    const result = loadNotionConfig();
    expect(result.error).toBeNull();
    expect(result.config?.token).toBeNull();
    expect(result.config?.pageId).toBeNull();
    expect(result.config?.databaseId).toBeNull();
  });

  it("reads token from environment", () => {
    process.env["OH_MY_PM_NOTION_TOKEN"] = "placeholder-token";
    const result = loadNotionConfig();
    expect(result.config?.token).toBe("placeholder-token");
  });

  it("reads optional page and database IDs from environment", () => {
    process.env["OH_MY_PM_NOTION_PAGE_ID"] = "page-1";
    process.env["OH_MY_PM_NOTION_DATABASE_ID"] = "database-1";
    const result = loadNotionConfig();
    expect(result.config?.pageId).toBe("page-1");
    expect(result.config?.databaseId).toBe("database-1");
  });

  it("uses default API base URL when not set", () => {
    const result = loadNotionConfig();
    expect(result.config?.apiBaseUrl).toBe("https://api.notion.com/v1");
  });

  it("respects custom API base URL", () => {
    process.env["OH_MY_PM_NOTION_API_BASE_URL"] = "https://notion.example.com/v1";
    const result = loadNotionConfig();
    expect(result.config?.apiBaseUrl).toBe("https://notion.example.com/v1");
  });
});
