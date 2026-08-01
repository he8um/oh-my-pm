import type { JsonValue, RuntimeRequest } from "@oh-my-pm/contracts";
import { createGitHubProviderRequest } from "@oh-my-pm/providers";
import type { GitHubSourceSelection } from "@oh-my-pm/providers";
import { DEFAULT_PROJECT_DOCUMENT_MAX_FILES } from "./project-document-limits.js";
import type { ProjectWorkflowOperation, RuntimeWorkflowCommand } from "./types.js";

export type GitHubWorkflowRequestInput = {
  operation: ProjectWorkflowOperation;
  repository: string;
  selection: GitHubSourceSelection;
  caller: "cli" | "mcp";
};

/** Short, bounded phrase describing the selected source for the request text. */
function sourcePhrase(selection: GitHubSourceSelection): string {
  return `using ${selection.mode} source`;
}

/**
 * Deterministic RuntimeRequest for a GitHub workflow. The provider request is
 * built from the resolved source selection through the shared provider builder;
 * the request text routes the existing intent classification and names only the
 * bounded source mode (never the search query, token, headers, or API URL).
 */
export function createGitHubRuntimeRequest(input: GitHubWorkflowRequestInput): RuntimeRequest {
  const { operation, repository, selection, caller } = input;
  const phrase = sourcePhrase(selection);
  const requestText =
    operation === "brief"
      ? `status brief for GitHub repository ${repository} ${phrase}`
      : operation === "risks"
        ? `review risks for GitHub repository ${repository} ${phrase}`
        : operation === "next"
          ? `derive next tasks for GitHub repository ${repository} ${phrase}`
          : `create handoff for GitHub repository ${repository} ${phrase}`;
  const providerRequest = createGitHubProviderRequest({ repository, selection });
  // Re-materialize as a plain JSON record for the Runtime payload (the typed
  // ProviderRequest lacks a JSON index signature).
  const providerRequestJson: Record<string, JsonValue> = {
    providerId: providerRequest.providerId,
    action: providerRequest.action,
    query: providerRequest.query,
  };
  if (providerRequest.limit !== undefined) {
    providerRequestJson["limit"] = providerRequest.limit;
  }
  return {
    id: `${caller}-github-${operation}`,
    kind: "plan",
    locale: "en",
    payload: {
      source: caller,
      request: requestText,
      context: {
        providerRequests: [providerRequestJson],
      },
    },
  };
}

/**
 * Deterministic RuntimeRequest for a project workflow: no time, no randomness.
 *
 * The `cli-` request id prefix and the `"cli"` payload source are a fixed part
 * of the observable response contract, shared by every presentation surface —
 * the MCP local project tools have always issued exactly these requests. They
 * are deliberately not parameterized by caller: changing them would change the
 * `id` field of published CLI JSON output.
 */
export function createRuntimeRequest(
  command: RuntimeWorkflowCommand,
  input?: string,
): RuntimeRequest {
  if (command === "plan") {
    return {
      id: "cli-plan",
      kind: "plan",
      locale: "en",
      payload: { source: "cli", request: input ?? "", context: {} },
    };
  }
  if (
    command === "brief" ||
    command === "risks" ||
    command === "next" ||
    command === "handoff"
  ) {
    // The project root never enters the Runtime payload; the Runtime only
    // sees normalized items from the already-populated local provider. The
    // request text is chosen so deterministic intent classification selects
    // the status intent for brief, the riskReview intent for risks, the
    // nextTask intent for next, and the handoff intent for handoff.
    const requestText =
      command === "brief"
        ? "status brief for the current project"
        : command === "risks"
          ? "review project risks"
          : command === "next"
            ? "derive next project tasks"
            : "create project handoff";
    return {
      id: `cli-${command}`,
      kind: "plan",
      locale: "en",
      payload: {
        source: "cli",
        request: requestText,
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
