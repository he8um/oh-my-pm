import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { inspectProjectContext } from "./tools/inspect-project-context.js";
import { diagnoseProject } from "./tools/diagnose-project.js";
import { prepareAgentHandoff } from "./tools/prepare-agent-handoff.js";
import { summarizeDeliveryStatus } from "./tools/summarize-delivery-status.js";
import { registerResources } from "./resources/registry.js";
import { registerPrompts } from "./prompts/registry.js";
import { enforceReadOnly } from "./policy/read-only.js";

export async function startServer(): Promise<void> {
  const server = new McpServer({
    name: "oh-my-pm",
    version: "0.7.0",
  });

  enforceReadOnly(server);

  // ── Tools ──────────────────────────────────────────────────────────────────

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

  // ── Resources and Prompts ──────────────────────────────────────────────────
  registerResources(server);
  registerPrompts(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
