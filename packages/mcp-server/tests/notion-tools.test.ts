import { notionSearchPages } from "../src/tools/notion-search-pages";
import { notionSummarizePage } from "../src/tools/notion-summarize-page";
import { notionQueryDatabase } from "../src/tools/notion-query-database";
import { notionSummarizeDatabase } from "../src/tools/notion-summarize-database";
import { notionGetPageContext } from "../src/tools/notion-get-page-context";
import { NotionClient } from "../src/connectors/notion/client";

type GetFn = NotionClient["get"];
type PostQueryFn = NotionClient["postQuery"];
let mockGet: jest.MockedFunction<GetFn>;
let mockPostQuery: jest.MockedFunction<PostQueryFn>;

beforeEach(() => {
  process.env["OH_MY_PM_NOTION_TOKEN"] = "placeholder-token";
  mockGet = jest.fn();
  mockPostQuery = jest.fn();
  Object.defineProperty(NotionClient.prototype, "get", {
    value: mockGet,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(NotionClient.prototype, "postQuery", {
    value: mockPostQuery,
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  delete process.env["OH_MY_PM_NOTION_TOKEN"];
  delete process.env["OH_MY_PM_NOTION_PAGE_ID"];
  delete process.env["OH_MY_PM_NOTION_DATABASE_ID"];
  jest.restoreAllMocks();
});

describe("notion tools — degraded when token missing", () => {
  it("notion_search_pages returns degraded response", async () => {
    delete process.env["OH_MY_PM_NOTION_TOKEN"];
    const result = (await notionSearchPages({})) as Record<string, unknown>;
    expect(result["status"]).toBe("degraded");
    expect(result["error_code"]).toBe("auth_required");
  });

  it("notion_query_database returns degraded response", async () => {
    delete process.env["OH_MY_PM_NOTION_TOKEN"];
    const result = (await notionQueryDatabase({})) as Record<string, unknown>;
    expect(result["status"]).toBe("degraded");
  });
});

describe("notion_search_pages — mocked success", () => {
  it("returns results on success", async () => {
    mockPostQuery.mockResolvedValueOnce({
      data: {
        results: [
          { id: "page-1", object: "page", url: "https://notion.so/page-1", title: [{ plain_text: "Roadmap" }] },
        ],
      },
      error: null,
      headers: {},
    });
    const result = (await notionSearchPages({ query: "Roadmap" })) as Record<string, unknown>;
    expect(result["status"]).toBe("ok");
    const results = result["results"] as Record<string, unknown>[];
    expect(results[0]!["title"]).toBe("Roadmap");
  });
});

describe("notion_summarize_page", () => {
  it("returns config_missing when no page_id available", async () => {
    const result = (await notionSummarizePage({})) as Record<string, unknown>;
    expect(result["status"]).toBe("error");
    expect(result["error_code"]).toBe("config_missing");
  });

  it("returns resource_not_found when page missing", async () => {
    mockGet.mockResolvedValueOnce({ data: null, error: null, headers: {} });
    const result = (await notionSummarizePage({ page_id: "page-404" })) as Record<
      string,
      unknown
    >;
    expect(result["status"]).toBe("error");
    expect(result["error_code"]).toBe("resource_not_found");
  });

  it("returns page on success", async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        id: "page-1",
        url: "https://notion.so/page-1",
        last_edited_time: new Date().toISOString(),
        properties: { Name: { title: [{ plain_text: "Project Brief" }] } },
      },
      error: null,
      headers: {},
    });
    const result = (await notionSummarizePage({ page_id: "page-1" })) as Record<
      string,
      unknown
    >;
    expect(result["status"]).toBe("ok");
    const page = result["page"] as Record<string, unknown>;
    expect(page["title"]).toBe("Project Brief");
  });
});

describe("notion_query_database", () => {
  it("returns config_missing when no database_id available", async () => {
    const result = (await notionQueryDatabase({})) as Record<string, unknown>;
    expect(result["status"]).toBe("error");
    expect(result["error_code"]).toBe("config_missing");
  });

  it("returns items with data-quality tags on success", async () => {
    mockPostQuery.mockResolvedValueOnce({
      data: {
        results: [
          {
            id: "item-1",
            url: "https://notion.so/item-1",
            last_edited_time: new Date().toISOString(),
            properties: {
              Name: { title: [{ plain_text: "Task 1" }] },
              Owner: { people: [] },
            },
          },
        ],
      },
      error: null,
      headers: {},
    });
    const result = (await notionQueryDatabase({ database_id: "db-1" })) as Record<
      string,
      unknown
    >;
    expect(result["status"]).toBe("ok");
    const items = result["items"] as Record<string, unknown>[];
    expect(items.length).toBe(1);
    expect(items[0]!["data_quality_tags"]).toContain("missing_owner");
  });
});

describe("notion_summarize_database", () => {
  it("returns config_missing when no database_id available", async () => {
    const result = (await notionSummarizeDatabase({})) as Record<string, unknown>;
    expect(result["status"]).toBe("error");
    expect(result["error_code"]).toBe("config_missing");
  });

  it("summarizes missing owner and stale items", async () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 30);
    mockPostQuery.mockResolvedValueOnce({
      data: {
        results: [
          {
            id: "item-1",
            url: "https://notion.so/item-1",
            last_edited_time: oldDate.toISOString(),
            properties: {
              Name: { title: [{ plain_text: "Stale item" }] },
              Owner: { people: [] },
              Status: { status: { name: "In Progress" } },
            },
          },
        ],
      },
      error: null,
      headers: {},
    });
    const result = (await notionSummarizeDatabase({ database_id: "db-1" })) as Record<
      string,
      unknown
    >;
    expect(result["status"]).toBe("ok");
    const summary = result["summary"] as Record<string, number>;
    expect(summary["item_count"]).toBe(1);
    expect(summary["missing_owner"]).toBe(1);
    expect(summary["stale"]).toBe(1);
    expect(Array.isArray(result["limitations"])).toBe(true);
  });
});

describe("notion_get_page_context", () => {
  it("returns config_missing when no page_id available", async () => {
    const result = (await notionGetPageContext({})) as Record<string, unknown>;
    expect(result["status"]).toBe("error");
    expect(result["error_code"]).toBe("config_missing");
  });

  it("returns page metadata plus content blocks on success", async () => {
    mockGet
      .mockResolvedValueOnce({
        data: {
          id: "page-1",
          url: "https://notion.so/page-1",
          last_edited_time: new Date().toISOString(),
          properties: { Name: { title: [{ plain_text: "Handoff Notes" }] } },
        },
        error: null,
        headers: {},
      })
      .mockResolvedValueOnce({
        data: {
          results: [
            {
              type: "paragraph",
              paragraph: { rich_text: [{ plain_text: "Context for the next agent." }] },
            },
          ],
        },
        error: null,
        headers: {},
      });
    const result = (await notionGetPageContext({ page_id: "page-1" })) as Record<
      string,
      unknown
    >;
    expect(result["status"]).toBe("ok");
    const page = result["page"] as Record<string, unknown>;
    expect(page["title"]).toBe("Handoff Notes");
    const blocks = result["content_blocks"] as Record<string, unknown>[];
    expect(blocks[0]!["text_excerpt"]).toBe("Context for the next agent.");
  });
});

describe("token redaction", () => {
  it("does not include token in error output", async () => {
    mockPostQuery.mockResolvedValueOnce({
      data: null,
      error: {
        status: "error",
        error_code: "auth_failed",
        message: "Notion returned 401. Check that OH_MY_PM_NOTION_TOKEN is valid.",
      },
      headers: {},
    });
    const result = (await notionSearchPages({})) as Record<string, unknown>;
    const json = JSON.stringify(result);
    expect(json).not.toContain("placeholder-token");
    expect(json).not.toContain("secret_");
  });
});
