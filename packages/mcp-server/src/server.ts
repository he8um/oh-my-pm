import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { inspectProjectContext } from "./tools/inspect-project-context.js";
import { diagnoseProject } from "./tools/diagnose-project.js";
import { prepareAgentHandoff } from "./tools/prepare-agent-handoff.js";
import { summarizeDeliveryStatus } from "./tools/summarize-delivery-status.js";
import { githubListIssues, githubListIssuesSchema } from "./tools/github-list-issues.js";
import { githubSummarizeIssue, githubSummarizeIssueSchema } from "./tools/github-summarize-issue.js";
import { githubListMilestones } from "./tools/github-list-milestones.js";
import { githubGetRepositoryContext } from "./tools/github-get-repository-context.js";
import { registerResources } from "./resources/registry.js";
import { registerPrompts } from "./prompts/registry.js";
import { enforceReadOnly } from "./policy/read-only.js";

export async function startServer(): Promise<void> {
  const server = new McpServer({
    name: "oh-my-pm",
    version: "0.8.0",
  });

  enforceReadOnly(server);

  // ── Local context tools ────────────────────────────────────────────────────

  server.tool(
    "inspect_project_context",
    "Read current project context from the local repository (AGENTS.md, VERSION, README.md).",
    {},
    async () => {
      const result = await inspectProjectContext();
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "diagnose_project",
    "Run a structured project diagnosis from local repository context.",
    { focus: z.string().optional().describe("Optional focus area or hint for the diagnosis.") },
    async ({ focus }) => {
      const result = await diagnoseProject(focus);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "prepare_agent_handoff",
    "Generate a self-contained agent handoff prompt from current local context.",
    { context: z.string().optional().describe("Optional current session context to include in the handoff.") },
    async ({ context }) => {
      const result = await prepareAgentHandoff(context);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "summarize_delivery_status",
    "Summarize delivery status from local repository docs (ROADMAP.md, CHANGELOG.md).",
    {},
    async () => {
      const result = await summarizeDeliveryStatus();
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ── GitHub connector tools (read-only) ────────────────────────────────────

  server.tool(
    "github_list_issues",
    "List open GitHub issues with title, assignees, labels, and delivery tags. Requires OH_MY_PM_GITHUB_OWNER and OH_MY_PM_GITHUB_REPO.",
    githubListIssuesSchema,
    async (params) => {
      const result = await githubListIssues(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "github_summarize_issue",
    "Get a structured summary of a single GitHub issue by number.",
    githubSummarizeIssueSchema,
    async (params) => {
      const result = await githubSummarizeIssue(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "github_list_milestones",
    "List open GitHub milestones with due date, completion percentage, and overdue flag.",
    {},
    async () => {
      const result = await githubListMilestones();
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "github_get_repository_context",
    "Get GitHub repository name, description, default branch, and open issue count.",
    {},
    async () => {
      const result = await githubGetRepositoryContext();
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ── Resources and Prompts ──────────────────────────────────────────────────
  registerResources(server);
  registerPrompts(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
