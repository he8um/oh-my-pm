import { loadAirtableConfig } from "../src/connectors/airtable/config";

afterEach(() => {
  delete process.env["OH_MY_PM_AIRTABLE_BASE_ID"];
  delete process.env["OH_MY_PM_AIRTABLE_TOKEN"];
  delete process.env["OH_MY_PM_AIRTABLE_TABLE_ID"];
  delete process.env["OH_MY_PM_AIRTABLE_TABLE_NAME"];
  delete process.env["OH_MY_PM_AIRTABLE_API_BASE_URL"];
});

describe("loadAirtableConfig", () => {
  it("returns error when base ID is missing", () => {
    const result = loadAirtableConfig();
    expect(result.config).toBeNull();
    expect(result.error).toContain("OH_MY_PM_AIRTABLE_BASE_ID");
  });

  it("returns config when base ID is set, token optional", () => {
    process.env["OH_MY_PM_AIRTABLE_BASE_ID"] = "appXXXXXXXXXXXXXX";
    const result = loadAirtableConfig();
    expect(result.error).toBeNull();
    expect(result.config?.baseId).toBe("appXXXXXXXXXXXXXX");
    expect(result.config?.token).toBeNull();
  });

  it("reads token from environment", () => {
    process.env["OH_MY_PM_AIRTABLE_BASE_ID"] = "appXXXXXXXXXXXXXX";
    process.env["OH_MY_PM_AIRTABLE_TOKEN"] = "placeholder-token";
    const result = loadAirtableConfig();
    expect(result.config?.token).toBe("placeholder-token");
  });

  it("reads optional table ID and table name from environment", () => {
    process.env["OH_MY_PM_AIRTABLE_BASE_ID"] = "appXXXXXXXXXXXXXX";
    process.env["OH_MY_PM_AIRTABLE_TABLE_ID"] = "tblXXXXXXXXXXXXXX";
    process.env["OH_MY_PM_AIRTABLE_TABLE_NAME"] = "Tasks";
    const result = loadAirtableConfig();
    expect(result.config?.tableId).toBe("tblXXXXXXXXXXXXXX");
    expect(result.config?.tableName).toBe("Tasks");
  });

  it("uses default API base URL when not set", () => {
    process.env["OH_MY_PM_AIRTABLE_BASE_ID"] = "appXXXXXXXXXXXXXX";
    const result = loadAirtableConfig();
    expect(result.config?.apiBaseUrl).toBe("https://api.airtable.com/v0");
  });

  it("respects custom API base URL", () => {
    process.env["OH_MY_PM_AIRTABLE_BASE_ID"] = "appXXXXXXXXXXXXXX";
    process.env["OH_MY_PM_AIRTABLE_API_BASE_URL"] = "https://airtable.example.com/v0";
    const result = loadAirtableConfig();
    expect(result.config?.apiBaseUrl).toBe("https://airtable.example.com/v0");
  });
});
