import { z } from "zod";
import { loadAirtableConfig } from "../connectors/airtable/config.js";
import { AirtableClient } from "../connectors/airtable/client.js";
import { fetchRecords } from "../connectors/airtable/records.js";
import { resolveTableIdentifier } from "../connectors/airtable/tables.js";
import { extractDataQualityTags } from "../connectors/airtable/formatters.js";
import { makeDegradedNoToken } from "../connectors/airtable/errors.js";
import { baseResponse } from "../utils/formatting.js";
import { DEFAULT_MAX_RECORDS } from "../connectors/airtable/limits.js";

export const airtableListRecordsSchema = {
  table_id: z.string().optional().describe(
    "Airtable table ID or name to read records from. Defaults to OH_MY_PM_AIRTABLE_TABLE_ID / OH_MY_PM_AIRTABLE_TABLE_NAME if not set."
  ),
  max_items: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe(`Maximum records to return. Default ${DEFAULT_MAX_RECORDS}, hard max 100.`),
  required_fields: z
    .array(z.string())
    .optional()
    .describe("Field names to flag as missing_required_field when empty."),
};

export async function airtableListRecords(
  params: { table_id?: string; max_items?: number; required_fields?: string[] }
) {
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

  const { records, error } = await fetchRecords(client, table, params.max_items);

  if (error) return error;

  const all = records ?? [];
  const requiredFields = params.required_fields ?? [];

  return {
    ...baseResponse("ok"),
    data_source: "airtable" as const,
    base_id: config.baseId,
    table_id: table,
    records: all.map((r) => ({
      id: r.id,
      fields: r.fields,
      created_time: r.created_time,
      data_quality_tags: extractDataQualityTags(r, requiredFields),
    })),
    total_returned: all.length,
    assumptions: [
      "Owner, status, and due-date detection is heuristic — matched by field name pattern, not a fixed schema.",
      "Attachments are not fetched; long text field values are truncated to 500 characters.",
      "Comments are not fetched.",
    ],
  };
}
