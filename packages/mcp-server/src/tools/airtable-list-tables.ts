import { loadAirtableConfig } from "../connectors/airtable/config.js";
import { AirtableClient } from "../connectors/airtable/client.js";
import { fetchTables } from "../connectors/airtable/tables.js";
import { makeDegradedNoToken } from "../connectors/airtable/errors.js";
import { baseResponse } from "../utils/formatting.js";

export async function airtableListTables() {
  const { config, error: configError } = loadAirtableConfig();

  if (configError || !config) {
    return {
      status: "error" as const,
      error_code: "config_missing",
      message: configError ?? "Airtable connector is not configured.",
    };
  }

  if (!config.token) {
    return makeDegradedNoToken();
  }

  const client = new AirtableClient(config);
  const { tables, error } = await fetchTables(client);

  if (error) return error;

  const all = tables ?? [];

  return {
    ...baseResponse("ok"),
    data_source: "airtable" as const,
    base_id: config.baseId,
    tables: all.map((t) => ({
      id: t.id,
      name: t.name,
      field_count: t.field_count,
      primary_field_name: t.primary_field_name,
    })),
    total_returned: all.length,
  };
}
