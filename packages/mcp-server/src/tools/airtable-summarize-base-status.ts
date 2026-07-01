import { z } from "zod";
import { loadAirtableConfig } from "../connectors/airtable/config.js";
import { AirtableClient } from "../connectors/airtable/client.js";
import { fetchRecords } from "../connectors/airtable/records.js";
import { resolveTableIdentifier } from "../connectors/airtable/tables.js";
import { extractDataQualityTags } from "../connectors/airtable/formatters.js";
import { makeDegradedNoToken } from "../connectors/airtable/errors.js";
import { baseResponse } from "../utils/formatting.js";
import { HARD_MAX_RECORDS } from "../connectors/airtable/limits.js";

export const airtableSummarizeBaseStatusSchema = {
  table_id: z.string().optional().describe(
    "Airtable table ID or name to summarize. Defaults to OH_MY_PM_AIRTABLE_TABLE_ID / OH_MY_PM_AIRTABLE_TABLE_NAME if not set."
  ),
  required_fields: z
    .array(z.string())
    .optional()
    .describe("Field names to flag as missing_required_field when empty."),
};

export async function airtableSummarizeBaseStatus(
  params: { table_id?: string; required_fields?: string[] }
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

  const { records, error } = await fetchRecords(client, table, HARD_MAX_RECORDS);

  if (error) return error;

  const all = records ?? [];
  const requiredFields = params.required_fields ?? [];
  const tagged = all.map((r) => ({
    record: r,
    tags: extractDataQualityTags(r, requiredFields),
  }));

  const missingOwner = tagged.filter((t) => t.tags.includes("missing_owner"));
  const missingDueDate = tagged.filter((t) => t.tags.includes("missing_due_date"));
  const missingRequiredField = tagged.filter((t) => t.tags.includes("missing_required_field"));
  const stale = tagged.filter((t) => t.tags.includes("stale"));

  const nextActionCandidates = [...missingRequiredField, ...stale]
    .filter((t, i, arr) => arr.findIndex((x) => x.record.id === t.record.id) === i)
    .slice(0, 5)
    .map((t) => ({ id: t.record.id, tags: t.tags }));

  return {
    ...baseResponse("ok"),
    data_source: "airtable" as const,
    base_id: config.baseId,
    table_id: table,
    summary: {
      record_count: all.length,
      missing_owner: missingOwner.length,
      missing_due_date: missingDueDate.length,
      missing_required_field: missingRequiredField.length,
      stale: stale.length,
    },
    handoff_gaps: missingOwner
      .filter((t) => missingDueDate.some((m) => m.record.id === t.record.id))
      .map((t) => ({ id: t.record.id })),
    recommended_next_actions: nextActionCandidates,
    assumptions: [
      `Reading up to ${HARD_MAX_RECORDS} records for this summary.`,
      "Owner, status, and due-date detection is heuristic — matched by field name pattern, not a fixed schema.",
      "Stale means no status change signal in more than 14 days, approximated from record creation time.",
    ],
    limitations: [
      "Single base/table scope only — cross-base source-of-truth ambiguity is not computed.",
      "Linked-record fields are not resolved — unclear-dependency risk is not computed.",
    ],
  };
}
