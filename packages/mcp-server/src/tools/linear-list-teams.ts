import { loadLinearConfig } from "../connectors/linear/config.js";
import { LinearClient } from "../connectors/linear/client.js";
import { fetchTeams } from "../connectors/linear/teams.js";
import { makeDegradedNoToken } from "../connectors/linear/errors.js";
import { baseResponse } from "../utils/formatting.js";

export async function linearListTeams() {
  const { config, error: configError } = loadLinearConfig();

  if (configError || !config) {
    return {
      status: "error" as const,
      error_code: "config_missing",
      message: configError ?? "Linear connector is not configured.",
    };
  }

  if (!config.token) {
    return makeDegradedNoToken();
  }

  const client = new LinearClient(config);
  const { teams, error } = await fetchTeams(client);

  if (error) return error;

  const all = teams ?? [];

  return {
    ...baseResponse("ok"),
    data_source: "linear" as const,
    teams: all.map((t) => ({ id: t.id, key: t.key, name: t.name })),
    total_returned: all.length,
  };
}
