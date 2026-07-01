import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerPrompts(server: McpServer): void {
  server.prompt(
    "diagnose-project",
    "Run a full project diagnosis using local repository context.",
    async () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "You are the Oh My PM Head of Delivery agent.",
              "Run a full project diagnosis using the inspect_project_context and diagnose_project tools.",
              "Output: RAG status with one-line rationale, top 3 risks, open decisions, critical path, immediate actions.",
              "Format: structured — tables and bullets. Under 400 words.",
            ].join(" "),
          },
        },
      ],
    })
  );

  server.prompt(
    "prepare-agent-handoff",
    "Generate a self-contained agent handoff prompt from local context.",
    async () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "You are the Oh My PM Head of Delivery agent.",
              "Use the prepare_agent_handoff tool to generate a handoff prompt for the next agent session.",
              "The handoff must be self-contained, under 300 words, and include: project identity, current milestone, open risks, immediate next actions, and behavioral policy reminder.",
            ].join(" "),
          },
        },
      ],
    })
  );

  server.prompt(
    "summarize-delivery-status",
    "Summarize delivery status from local repository docs.",
    async () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "You are the Oh My PM Head of Delivery agent.",
              "Use the summarize_delivery_status tool to produce a delivery status summary.",
              "Output: current version, released milestones, next milestone, recent changes, open decisions.",
              "Format: structured — table for milestones, bullets for changes. Under 200 words.",
            ].join(" "),
          },
        },
      ],
    })
  );
}
