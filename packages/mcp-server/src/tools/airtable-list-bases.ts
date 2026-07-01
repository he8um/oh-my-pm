import { loadAirtableConfig } from "../connectors/airtable/config.js";
import { AirtableClient } from "../connectors/airtable/client.js";
import { fetchBases } from "../connectors/airtable/bases.js";
import { makeDegradedNoToken } from "../connectors/airtable/errors.js";
import { baseResponse } from "../utils/formatting.js";

export async function airtableListBases() {
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
  const { bases, error } = await fetchBases(client);

  if (error) return error;

  const all = bases ?? [];

  return {
    ...baseResponse("ok"),
    data_source: "airtable" as const,
    bases: all.map((b) => ({
      id: b.id,
      name: b.name,
      permission_level: b.permission_level,
    })),
    total_returned: all.length,
  };
}
