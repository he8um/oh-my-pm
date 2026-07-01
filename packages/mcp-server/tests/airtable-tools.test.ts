import { airtableListBases } from "../src/tools/airtable-list-bases";
import { airtableListTables } from "../src/tools/airtable-list-tables";
import { airtableDescribeTable } from "../src/tools/airtable-describe-table";
import { airtableListRecords } from "../src/tools/airtable-list-records";
import { airtableSummarizeBaseStatus } from "../src/tools/airtable-summarize-base-status";
import { AirtableClient } from "../src/connectors/airtable/client";

type GetFn = AirtableClient["get"];
let mockGet: jest.MockedFunction<GetFn>;

beforeEach(() => {
  process.env["OH_MY_PM_AIRTABLE_BASE_ID"] = "appXXXXXXXXXXXXXX";
  process.env["OH_MY_PM_AIRTABLE_TOKEN"] = "placeholder-token";
  mockGet = jest.fn();
  Object.defineProperty(AirtableClient.prototype, "get", {
    value: mockGet,
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  delete process.env["OH_MY_PM_AIRTABLE_BASE_ID"];
  delete process.env["OH_MY_PM_AIRTABLE_TOKEN"];
  delete process.env["OH_MY_PM_AIRTABLE_TABLE_ID"];
  delete process.env["OH_MY_PM_AIRTABLE_TABLE_NAME"];
  jest.restoreAllMocks();
});

describe("airtable_list_bases — config missing", () => {
  it("returns config_missing error when base ID not set", async () => {
    delete process.env["OH_MY_PM_AIRTABLE_BASE_ID"];
    const result = (await airtableListBases()) as Record<string, unknown>;
    expect(result["status"]).toBe("error");
    expect(result["error_code"]).toBe("config_missing");
  });

  it("returns degraded response when token missing", async () => {
    delete process.env["OH_MY_PM_AIRTABLE_TOKEN"];
    const result = (await airtableListBases()) as Record<string, unknown>;
    expect(result["status"]).toBe("degraded");
    expect(result["error_code"]).toBe("auth_required");
  });
});

describe("airtable_list_bases — mocked success", () => {
  it("returns bases on 200 response", async () => {
    mockGet.mockResolvedValueOnce({
      data: { bases: [{ id: "appXXXXXXXXXXXXXX", name: "Delivery Tracker", permissionLevel: "create" }] },
      error: null,
      headers: {},
    });
    const result = (await airtableListBases()) as Record<string, unknown>;
    expect(result["status"]).toBe("ok");
    const bases = result["bases"] as Record<string, unknown>[];
    expect(bases.length).toBe(1);
    expect(bases[0]!["name"]).toBe("Delivery Tracker");
  });
});

describe("airtable_list_bases — 401 auth error", () => {
  it("returns auth_failed error on 401", async () => {
    mockGet.mockResolvedValueOnce({
      data: null,
      error: { status: "error", error_code: "auth_failed", message: "check token" },
      headers: {},
    });
    const result = (await airtableListBases()) as Record<string, unknown>;
    expect(result["status"]).toBe("error");
    expect(result["error_code"]).toBe("auth_failed");
  });
});

describe("airtable_list_tables", () => {
  it("returns tables with field counts on success", async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        tables: [
          {
            id: "tbl1",
            name: "Tasks",
            primaryFieldId: "fld1",
            fields: [
              { id: "fld1", name: "Name", type: "singleLineText" },
              { id: "fld2", name: "Owner", type: "singleLineText" },
            ],
            views: [{ id: "viw1", name: "Grid view", type: "grid" }],
          },
        ],
      },
      error: null,
      headers: {},
    });
    const result = (await airtableListTables()) as Record<string, unknown>;
    expect(result["status"]).toBe("ok");
    const tables = result["tables"] as Record<string, unknown>[];
    expect(tables[0]!["field_count"]).toBe(2);
    expect(tables[0]!["primary_field_name"]).toBe("Name");
  });
});

describe("airtable_describe_table", () => {
  it("returns config_missing when no table available", async () => {
    mockGet.mockResolvedValueOnce({ data: { tables: [] }, error: null, headers: {} });
    const result = (await airtableDescribeTable({})) as Record<string, unknown>;
    expect(result["status"]).toBe("error");
    expect(result["error_code"]).toBe("config_missing");
  });

  it("returns resource_not_found when table does not match", async () => {
    mockGet.mockResolvedValueOnce({
      data: { tables: [{ id: "tbl1", name: "Tasks", primaryFieldId: "fld1", fields: [], views: [] }] },
      error: null,
      headers: {},
    });
    const result = (await airtableDescribeTable({ table_id: "tblMissing" })) as Record<
      string,
      unknown
    >;
    expect(result["status"]).toBe("error");
    expect(result["error_code"]).toBe("resource_not_found");
  });

  it("returns schema on success", async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        tables: [
          {
            id: "tbl1",
            name: "Tasks",
            primaryFieldId: "fld1",
            fields: [{ id: "fld1", name: "Name", type: "singleLineText" }],
            views: [{ id: "viw1", name: "Grid view", type: "grid" }],
          },
        ],
      },
      error: null,
      headers: {},
    });
    const result = (await airtableDescribeTable({ table_id: "tbl1" })) as Record<
      string,
      unknown
    >;
    expect(result["status"]).toBe("ok");
    const table = result["table"] as Record<string, unknown>;
    expect(table["name"]).toBe("Tasks");
    expect((table["fields"] as unknown[]).length).toBe(1);
  });
});

describe("airtable_list_records", () => {
  it("returns config_missing when no table available", async () => {
    const result = (await airtableListRecords({})) as Record<string, unknown>;
    expect(result["status"]).toBe("error");
    expect(result["error_code"]).toBe("config_missing");
  });

  it("returns records with data-quality tags on success", async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        records: [
          {
            id: "rec1",
            fields: { Name: "Task 1", Owner: "" },
            createdTime: new Date().toISOString(),
          },
        ],
      },
      error: null,
      headers: {},
    });
    const result = (await airtableListRecords({ table_id: "tbl1" })) as Record<
      string,
      unknown
    >;
    expect(result["status"]).toBe("ok");
    const records = result["records"] as Record<string, unknown>[];
    expect(records.length).toBe(1);
    expect(records[0]!["data_quality_tags"]).toContain("missing_owner");
  });

  it("uses OH_MY_PM_AIRTABLE_TABLE_ID as default when table_id omitted", async () => {
    process.env["OH_MY_PM_AIRTABLE_TABLE_ID"] = "tblDefault";
    mockGet.mockResolvedValueOnce({ data: { records: [] }, error: null, headers: {} });
    const result = (await airtableListRecords({})) as Record<string, unknown>;
    expect(result["status"]).toBe("ok");
    expect(result["table_id"]).toBe("tblDefault");
  });
});

describe("airtable_list_records — 429 rate limit", () => {
  it("returns rate_limited error on 429", async () => {
    mockGet.mockResolvedValueOnce({
      data: null,
      error: { status: "error", error_code: "rate_limited", message: "slow down" },
      headers: {},
    });
    const result = (await airtableListRecords({ table_id: "tbl1" })) as Record<
      string,
      unknown
    >;
    expect(result["status"]).toBe("error");
    expect(result["error_code"]).toBe("rate_limited");
  });
});

describe("airtable_summarize_base_status", () => {
  it("returns config_missing when no table available", async () => {
    const result = (await airtableSummarizeBaseStatus({})) as Record<string, unknown>;
    expect(result["status"]).toBe("error");
    expect(result["error_code"]).toBe("config_missing");
  });

  it("summarizes missing owner, missing due date, and stale records", async () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 30);
    mockGet.mockResolvedValueOnce({
      data: {
        records: [
          {
            id: "rec1",
            fields: { Name: "Task 1", Owner: "", Status: "In Progress" },
            createdTime: oldDate.toISOString(),
          },
          {
            id: "rec2",
            fields: { Name: "Task 2", Owner: "alice", Status: "Done" },
            createdTime: new Date().toISOString(),
          },
        ],
      },
      error: null,
      headers: {},
    });
    const result = (await airtableSummarizeBaseStatus({ table_id: "tbl1" })) as Record<
      string,
      unknown
    >;
    expect(result["status"]).toBe("ok");
    const summary = result["summary"] as Record<string, number>;
    expect(summary["record_count"]).toBe(2);
    expect(summary["missing_owner"]).toBe(1);
    expect(summary["stale"]).toBe(1);
    expect(Array.isArray(result["limitations"])).toBe(true);
  });
});

describe("token redaction", () => {
  it("does not include token in error output", async () => {
    mockGet.mockResolvedValueOnce({
      data: null,
      error: {
        status: "error",
        error_code: "auth_failed",
        message: "Airtable returned 401. Check that OH_MY_PM_AIRTABLE_TOKEN is valid.",
      },
      headers: {},
    });
    const result = (await airtableListBases()) as Record<string, unknown>;
    const json = JSON.stringify(result);
    expect(json).not.toContain("placeholder-token");
    expect(json).not.toContain("pat");
  });
});
