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

  // ── Linear connector prompts ───────────────────────────────────────────

  server.prompt(
    "summarize-linear-delivery-status",
    "Summarize delivery status using Linear issue and project data.",
    async () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "You are the Oh My PM Head of Delivery agent.",
              "Use linear_summarize_project_status and linear_list_issues to produce a delivery status summary.",
              "Output: open issue count, blockers, unassigned issues, missing estimates, missing cycles, stale issues, next actions.",
              "State assumptions and limitations explicitly. Format: structured — bullets and a short table. Under 250 words.",
            ].join(" "),
          },
        },
      ],
    })
  );

  server.prompt(
    "diagnose-linear-issue-backlog",
    "Diagnose the Linear issue backlog using delivery semantics.",
    async () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "You are the Oh My PM Head of Delivery agent.",
              "Use linear_list_issues and linear_summarize_project_status to diagnose the issue backlog.",
              "Identify: blocked work, stale work, unassigned work, missing estimates, missing cycles, unclear states, missing priorities.",
              "Note that dependency risk is not computed — the connector does not read issue relations (blocks/blocked-by/related).",
              "Format: structured — bullets grouped by risk category. Under 300 words.",
            ].join(" "),
          },
        },
      ],
    })
  );

  server.prompt(
    "prepare-linear-project-handoff",
    "Prepare a project handoff prompt seeded with current Linear issue and project context.",
    async () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "You are the Oh My PM Head of Delivery agent.",
              "Use linear_summarize_project_status and prepare_agent_handoff together.",
              "Produce a self-contained handoff prompt under 300 words that includes: current team issue status, blockers, unassigned or unestimated issues (handoff gaps), and immediate next actions.",
            ].join(" "),
          },
        },
      ],
    })
  );

  // ── Jira connector prompts ─────────────────────────────────────────────

  server.prompt(
    "summarize-jira-delivery-status",
    "Summarize delivery status using Jira issue, board, and sprint data.",
    async () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "You are the Oh My PM Head of Delivery agent.",
              "Use jira_summarize_project_status and jira_list_issues to produce a delivery status summary.",
              "Output: open issue count, blockers, unassigned issues, missing estimates, missing sprint assignment, overdue issues, stale issues, active sprint completion rate if available, next actions.",
              "State assumptions and limitations explicitly. Format: structured — bullets and a short table. Under 250 words.",
            ].join(" "),
          },
        },
      ],
    })
  );

  server.prompt(
    "diagnose-jira-issue-backlog",
    "Diagnose the Jira issue backlog using delivery semantics.",
    async () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "You are the Oh My PM Head of Delivery agent.",
              "Use jira_list_issues and jira_summarize_project_status to diagnose the issue backlog.",
              "Identify: blocked work, stale work, unassigned work, missing estimates, missing sprint assignment, overdue issues, unclear statuses, missing priorities.",
              "Note that dependency risk is not computed — the connector does not read Jira issue links.",
              "Format: structured — bullets grouped by risk category. Under 300 words.",
            ].join(" "),
          },
        },
      ],
    })
  );

  server.prompt(
    "prepare-jira-project-handoff",
    "Prepare a project handoff prompt seeded with current Jira issue and project context.",
    async () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "You are the Oh My PM Head of Delivery agent.",
              "Use jira_summarize_project_status and prepare_agent_handoff together.",
              "Produce a self-contained handoff prompt under 300 words that includes: current project issue status, blockers, unassigned or unestimated issues (handoff gaps), and immediate next actions.",
            ].join(" "),
          },
        },
      ],
    })
  );

  // ── Notion connector prompts ───────────────────────────────────────────

  server.prompt(
    "summarize-notion-delivery-status",
    "Summarize delivery status using Notion database and page data.",
    async () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "You are the Oh My PM Head of Delivery agent.",
              "Use notion_summarize_database and notion_query_database to produce a delivery status summary.",
              "Output: item count, missing owners, missing status, missing due dates, stale items, next actions.",
              "State assumptions and limitations explicitly — owner/status/due-date detection is heuristic, not a fixed schema.",
              "Format: structured — bullets and a short table. Under 250 words.",
            ].join(" "),
          },
        },
      ],
    })
  );

  server.prompt(
    "diagnose-notion-knowledge-base",
    "Diagnose Notion knowledge-base health using delivery semantics.",
    async () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "You are the Oh My PM Head of Delivery agent.",
              "Use notion_search_pages, notion_query_database, and notion_summarize_database to diagnose knowledge-base health.",
              "Identify: stale documentation, missing owners, missing status fields, missing due dates, database property gaps.",
              "Note that source-of-truth ambiguity, unclear next actions, and relation/backlink resolution are not computed in this connector.",
              "Format: structured — bullets grouped by issue category. Under 300 words.",
            ].join(" "),
          },
        },
      ],
    })
  );

  server.prompt(
    "prepare-notion-project-handoff",
    "Prepare a project handoff prompt seeded with current Notion page and database context.",
    async () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "You are the Oh My PM Head of Delivery agent.",
              "Use notion_summarize_database and prepare_agent_handoff together.",
              "Produce a self-contained handoff prompt under 300 words that includes: current database status, missing-owner or missing-due-date items (handoff gaps), and immediate next actions.",
            ].join(" "),
          },
        },
      ],
    })
  );
}
