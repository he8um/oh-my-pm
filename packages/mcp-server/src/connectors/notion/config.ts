export interface NotionConfig {
  token: string | null;
  pageId: string | null;
  databaseId: string | null;
  apiBaseUrl: string;
}

export interface NotionConfigResult {
  config: NotionConfig | null;
  error: string | null;
}

export function loadNotionConfig(): NotionConfigResult {
  const token = process.env["OH_MY_PM_NOTION_TOKEN"] ?? null;
  const pageId = process.env["OH_MY_PM_NOTION_PAGE_ID"] ?? null;
  const databaseId = process.env["OH_MY_PM_NOTION_DATABASE_ID"] ?? null;
  const apiBaseUrl =
    process.env["OH_MY_PM_NOTION_API_BASE_URL"] ?? "https://api.notion.com/v1";

  return {
    config: { token, pageId, databaseId, apiBaseUrl },
    error: null,
  };
}
