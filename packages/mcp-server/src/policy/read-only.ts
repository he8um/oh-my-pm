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

export const CLICKUP_READ_ONLY_TOOLS = new Set([
  "clickup_list_tasks",
  "clickup_summarize_task",
  "clickup_summarize_list_status",
  "clickup_list_spaces",
  "clickup_list_folders",
  "clickup_list_lists",
  "clickup_get_workspace_context",
]);

export const AIRTABLE_READ_ONLY_TOOLS = new Set([
  "airtable_list_bases",
  "airtable_list_tables",
  "airtable_describe_table",
  "airtable_list_records",
  "airtable_summarize_base_status",
]);

export const LINEAR_READ_ONLY_TOOLS = new Set([
  "linear_list_issues",
  "linear_summarize_issue",
  "linear_summarize_project_status",
  "linear_list_teams",
  "linear_list_projects",
]);

export const JIRA_READ_ONLY_TOOLS = new Set([
  "jira_list_issues",
  "jira_summarize_issue",
  "jira_summarize_project_status",
  "jira_list_projects",
  "jira_list_boards",
]);

const LOCAL_READ_ONLY_TOOLS = new Set([
  "inspect_project_context",
  "diagnose_project",
  "prepare_agent_handoff",
  "summarize_delivery_status",
]);

// Returns true if the given tool name is a permitted read-only tool.
export function isReadOnlyTool(toolName: string): boolean {
  return (
    LOCAL_READ_ONLY_TOOLS.has(toolName) ||
    GITHUB_READ_ONLY_TOOLS.has(toolName) ||
    CLICKUP_READ_ONLY_TOOLS.has(toolName) ||
    AIRTABLE_READ_ONLY_TOOLS.has(toolName) ||
    LINEAR_READ_ONLY_TOOLS.has(toolName) ||
    JIRA_READ_ONLY_TOOLS.has(toolName)
  );
}
