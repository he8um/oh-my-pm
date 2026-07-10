import type { RuntimeRequest } from "@oh-my-pm/contracts";
import type { CliCommand } from "./types.js";

/** Deterministic RuntimeRequest for a CLI command: no time, no randomness. */
export function createRuntimeRequest(command: CliCommand): RuntimeRequest {
  return {
    id: `cli-${command}`,
    kind: command,
    locale: "en",
    payload: { source: "cli" },
  };
}
