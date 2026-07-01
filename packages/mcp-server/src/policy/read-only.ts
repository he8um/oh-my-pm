import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// All tools are read-only. This function documents the constraint and provides
// a hook for future policy enforcement if write tools are ever added.
export function enforceReadOnly(_server: McpServer): void {
  // No write tools are registered.
  // Write actions require all five conditions from docs/mcp-security-policy.md.
}

export const GITHUB_READ_ONLY_TOOLS = new Set([
  "github_list_issues",
  "github_summarize_issue",
  "github_list_milestones",
  "github_get_repository_context",
]);

const LOCAL_READ_ONLY_TOOLS = new Set([
  "inspect_project_context",
  "diagnose_project",
  "prepare_agent_handoff",
  "summarize_delivery_status",
]);

// Returns true if the given tool name is a permitted read-only tool.
export function isReadOnlyTool(toolName: string): boolean {
  return LOCAL_READ_ONLY_TOOLS.has(toolName) || GITHUB_READ_ONLY_TOOLS.has(toolName);
}
