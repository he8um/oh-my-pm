import { z } from "zod";
import { loadAirtableConfig } from "../connectors/airtable/config.js";
import { AirtableClient } from "../connectors/airtable/client.js";
import { fetchTableSchema, resolveTableIdentifier } from "../connectors/airtable/tables.js";
import { makeDegradedNoToken } from "../connectors/airtable/errors.js";
import { baseResponse } from "../utils/formatting.js";

export const airtableDescribeTableSchema = {
  table_id: z.string().optional().describe(
    "Airtable table ID or name to describe. Defaults to OH_MY_PM_AIRTABLE_TABLE_ID / OH_MY_PM_AIRTABLE_TABLE_NAME if not set."
  ),
};

export async function airtableDescribeTable(params: { table_id?: string }) {
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
  const table = resolveTableIdentifier(client, params.table_id);
  if (!table) {
    return {
      status: "error" as const,
      error_code: "config_missing",
      message:
        "No table_id provided and neither OH_MY_PM_AIRTABLE_TABLE_ID nor " +
        "OH_MY_PM_AIRTABLE_TABLE_NAME is set.",
    };
  }

  const { schema, error } = await fetchTableSchema(client, table);

  if (error) return error;
  if (!schema) {
    return {
      status: "error" as const,
      error_code: "resource_not_found",
      message: `Table "${table}" not found in base ${config.baseId}.`,
    };
  }

  return {
    ...baseResponse("ok"),
    data_source: "airtable" as const,
    base_id: config.baseId,
    table: {
      id: schema.id,
      name: schema.name,
      fields: schema.fields,
      views: schema.views,
    },
  };
}
