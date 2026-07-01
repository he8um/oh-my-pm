export interface AirtableConfig {
  token: string | null;
  baseId: string;
  tableId: string | null;
  tableName: string | null;
  apiBaseUrl: string;
}

export interface AirtableConfigResult {
  config: AirtableConfig | null;
  error: string | null;
}

export function loadAirtableConfig(): AirtableConfigResult {
  const baseId = process.env["OH_MY_PM_AIRTABLE_BASE_ID"] ?? "";
  const token = process.env["OH_MY_PM_AIRTABLE_TOKEN"] ?? null;
  const tableId = process.env["OH_MY_PM_AIRTABLE_TABLE_ID"] ?? null;
  const tableName = process.env["OH_MY_PM_AIRTABLE_TABLE_NAME"] ?? null;
  const apiBaseUrl =
    process.env["OH_MY_PM_AIRTABLE_API_BASE_URL"] ?? "https://api.airtable.com/v0";

  if (!baseId) {
    return {
      config: null,
      error:
        "OH_MY_PM_AIRTABLE_BASE_ID must be set. " +
        "Example: OH_MY_PM_AIRTABLE_BASE_ID=appXXXXXXXXXXXXXX",
    };
  }

  return {
    config: { token, baseId, tableId, tableName, apiBaseUrl },
    error: null,
  };
}
