import { loadLinearConfig } from "../connectors/linear/config.js";
import { LinearClient } from "../connectors/linear/client.js";
import { fetchProjectsInTeam } from "../connectors/linear/projects.js";
import { makeDegradedNoToken } from "../connectors/linear/errors.js";
import { baseResponse } from "../utils/formatting.js";

export async function linearListProjects() {
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
  const { projects, error } = await fetchProjectsInTeam(client, config.teamId);

  if (error) return error;

  const all = projects ?? [];

  return {
    ...baseResponse("ok"),
    data_source: "linear" as const,
    team_id: config.teamId,
    projects: all.map((p) => ({
      id: p.id,
      name: p.name,
      state: p.state,
      target_date: p.target_date,
    })),
    total_returned: all.length,
  };
}
