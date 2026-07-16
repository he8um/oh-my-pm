import { executeMcpProjectTool } from "@oh-my-pm/mcp-server";
import type { McpProjectToolExecution } from "@oh-my-pm/mcp-server";

export type McpProjectToolExamples = {
  brief: McpProjectToolExecution;
  risks: McpProjectToolExecution;
  next: McpProjectToolExecution;
  handoff: McpProjectToolExecution;
};

/**
 * Run all four read-only local project tools through the shared MCP runner. No
 * stdio process is involved: this calls the exported runner directly, so it is
 * safe to use in tests and documentation.
 */
export function runMcpProjectToolExamples(root: string): McpProjectToolExamples {
  return {
    brief: executeMcpProjectTool("brief", root),
    risks: executeMcpProjectTool("risks", root),
    next: executeMcpProjectTool("next", root),
    handoff: executeMcpProjectTool("handoff", root),
  };
}
