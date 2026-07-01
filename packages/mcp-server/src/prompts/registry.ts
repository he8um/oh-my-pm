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

  // ── ClickUp connector prompts ──────────────────────────────────────────

  server.prompt(
    "summarize-clickup-delivery-status",
    "Summarize delivery status using ClickUp list and task data.",
    async () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "You are the Oh My PM Head of Delivery agent.",
              "Use clickup_summarize_list_status and clickup_list_tasks to produce a delivery status summary.",
              "Output: open task count, blockers, stale tasks, unassigned tasks, overdue tasks, next actions.",
              "State assumptions and limitations explicitly. Format: structured — bullets and a short table. Under 250 words.",
            ].join(" "),
          },
        },
      ],
    })
  );

  server.prompt(
    "diagnose-clickup-task-backlog",
    "Diagnose the ClickUp task backlog using delivery semantics.",
    async () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "You are the Oh My PM Head of Delivery agent.",
              "Use clickup_list_tasks and clickup_summarize_list_status to diagnose the task backlog.",
              "Identify: blocked work, stale work, unassigned work, missing due dates, overdue work, unclear statuses.",
              "Note that dependency risk is not computed — the connector does not read task dependencies.",
              "Format: structured — bullets grouped by risk category. Under 300 words.",
            ].join(" "),
          },
        },
      ],
    })
  );

  server.prompt(
    "prepare-clickup-project-handoff",
    "Prepare a project handoff prompt seeded with current ClickUp task and list context.",
    async () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "You are the Oh My PM Head of Delivery agent.",
              "Use clickup_summarize_list_status and prepare_agent_handoff together.",
              "Produce a self-contained handoff prompt under 300 words that includes: current list status, blockers, unassigned or undated tasks (handoff gaps), and immediate next actions.",
            ].join(" "),
          },
        },
      ],
    })
  );

  // ── Airtable connector prompts ─────────────────────────────────────────

  server.prompt(
    "summarize-airtable-base-status",
    "Summarize delivery status using Airtable table and record data.",
    async () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "You are the Oh My PM Head of Delivery agent.",
              "Use airtable_summarize_base_status and airtable_list_records to produce a delivery status summary.",
              "Output: record count, missing owners, missing due dates, missing required fields, stale records, next actions.",
              "State assumptions and limitations explicitly — owner/status/due-date detection is heuristic, not a fixed schema.",
              "Format: structured — bullets and a short table. Under 250 words.",
            ].join(" "),
          },
        },
      ],
    })
  );

  server.prompt(
    "diagnose-airtable-data-quality",
    "Diagnose Airtable table data quality using delivery semantics.",
    async () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "You are the Oh My PM Head of Delivery agent.",
              "Use airtable_list_records and airtable_summarize_base_status to diagnose data quality.",
              "Identify: missing required fields, empty owner fields, stale records, unclear statuses, unlinked records.",
              "Note that cross-base source-of-truth ambiguity and linked-record dependency resolution are not computed in this connector.",
              "Format: structured — bullets grouped by issue category. Under 300 words.",
            ].join(" "),
          },
        },
      ],
    })
  );

  server.prompt(
    "prepare-airtable-project-handoff",
    "Prepare a project handoff prompt seeded with current Airtable table and record context.",
    async () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "You are the Oh My PM Head of Delivery agent.",
              "Use airtable_summarize_base_status and prepare_agent_handoff together.",
              "Produce a self-contained handoff prompt under 300 words that includes: current table status, missing-owner or missing-due-date records (handoff gaps), and immediate next actions.",
            ].join(" "),
          },
        },
      ],
    })
  );
}
