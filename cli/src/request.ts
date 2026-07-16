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
  if (command === "brief" || command === "risks") {
    // The project root never enters the Runtime payload; the Runtime only
    // sees normalized items from the already-populated local provider. The
    // request text is chosen so deterministic intent classification selects
    // the status intent for brief and the riskReview intent for risks.
    return {
      id: `cli-${command}`,
      kind: "plan",
      locale: "en",
      payload: {
        source: "cli",
        request:
          command === "brief" ? "status brief for the current project" : "review project risks",
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
