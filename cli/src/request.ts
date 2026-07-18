import type { RuntimeRequest } from "@oh-my-pm/contracts";
import { DEFAULT_PROJECT_DOCUMENT_MAX_FILES } from "./node-project-documents.js";
import type { GitHubCliOperation, RuntimeCliCommand } from "./types.js";

/**
 * Deterministic RuntimeRequest for a GitHub workflow. The repository is carried
 * as the provider query; the request text routes the existing intent
 * classification (status/riskReview/nextTask/handoff). No token, no headers,
 * and no API URL ever enter the Runtime request.
 */
export function createGitHubRuntimeRequest(
  operation: GitHubCliOperation,
  repository: string,
  limit: number,
  source: "cli" | "mcp",
): RuntimeRequest {
  const requestText =
    operation === "brief"
      ? `status brief for GitHub repository ${repository}`
      : operation === "risks"
        ? `review risks for GitHub repository ${repository}`
        : operation === "next"
          ? `derive next tasks for GitHub repository ${repository}`
          : `create handoff for GitHub repository ${repository}`;
  return {
    id: `${source}-github-${operation}`,
    kind: "plan",
    locale: "en",
    payload: {
      source,
      request: requestText,
      context: {
        providerRequests: [
          {
            providerId: "github",
            action: "list",
            query: repository,
            limit,
          },
        ],
      },
    },
  };
}

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
