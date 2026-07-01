import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// All v0.7.0 tools are read-only. This function documents the constraint and
// provides a hook for future policy enforcement if write tools are ever added.
export function enforceReadOnly(_server: McpServer): void {
  // No write tools are registered in v0.7.0.
  // Write actions require all five conditions from docs/mcp-security-policy.md.
}

// Returns true if the given tool name is a permitted read-only tool.
export function isReadOnlyTool(toolName: string): boolean {
  const READ_ONLY_TOOLS = new Set([
    "inspect_project_context",
    "diagnose_project",
    "prepare_agent_handoff",
    "summarize_delivery_status",
  ]);
  return READ_ONLY_TOOLS.has(toolName);
}
