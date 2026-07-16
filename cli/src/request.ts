import type { RuntimeRequest } from "@oh-my-pm/contracts";
import { DEFAULT_PROJECT_DOCUMENT_MAX_FILES } from "./node-project-documents.js";
import type { RuntimeCliCommand } from "./types.js";

/** Deterministic RuntimeRequest for a CLI command: no time, no randomness. */
export function createRuntimeRequest(command: RuntimeCliCommand, input?: string): RuntimeRequest {
  if (command === "plan") {
    return {
      id: "cli-plan",
      kind: "plan",
      locale: "en",
      payload: { source: "cli", request: input ?? "", context: {} },
    };
  }
  if (command === "brief") {
    // The project root never enters the Runtime payload; the Runtime only
    // sees normalized items from the already-populated local provider. The
    // request text contains "status" so intent classification stays on the
    // status intent deterministically.
    return {
      id: "cli-brief",
      kind: "plan",
      locale: "en",
      payload: {
        source: "cli",
        request: "status brief for the current project",
        context: {
          providerRequests: [
            {
              providerId: "local",
              action: "list",
              query: "",
              limit: DEFAULT_PROJECT_DOCUMENT_MAX_FILES,
            },
          ],
        },
      },
    };
  }
  return {
    id: `cli-${command}`,
    kind: command,
    locale: "en",
    payload: { source: "cli" },
  };
}
