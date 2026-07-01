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
import { clickupListTasks, clickupListTasksSchema } from "./tools/clickup-list-tasks.js";
import { clickupSummarizeTask, clickupSummarizeTaskSchema } from "./tools/clickup-summarize-task.js";
import {
  clickupSummarizeListStatus,
  clickupSummarizeListStatusSchema,
} from "./tools/clickup-summarize-list-status.js";
import { clickupListSpaces } from "./tools/clickup-list-spaces.js";
import { clickupListFolders, clickupListFoldersSchema } from "./tools/clickup-list-folders.js";
import { clickupListLists, clickupListListsSchema } from "./tools/clickup-list-lists.js";
import { clickupGetWorkspaceContext } from "./tools/clickup-get-workspace-context.js";
import { airtableListBases } from "./tools/airtable-list-bases.js";
import { airtableListTables } from "./tools/airtable-list-tables.js";
import { airtableDescribeTable, airtableDescribeTableSchema } from "./tools/airtable-describe-table.js";
import { airtableListRecords, airtableListRecordsSchema } from "./tools/airtable-list-records.js";
import {
  airtableSummarizeBaseStatus,
  airtableSummarizeBaseStatusSchema,
} from "./tools/airtable-summarize-base-status.js";
import { linearListIssues, linearListIssuesSchema } from "./tools/linear-list-issues.js";
import { linearSummarizeIssue, linearSummarizeIssueSchema } from "./tools/linear-summarize-issue.js";
import {
  linearSummarizeProjectStatus,
  linearSummarizeProjectStatusSchema,
} from "./tools/linear-summarize-project-status.js";
import { linearListTeams } from "./tools/linear-list-teams.js";
import { linearListProjects } from "./tools/linear-list-projects.js";
import { jiraListIssues, jiraListIssuesSchema } from "./tools/jira-list-issues.js";
import { jiraSummarizeIssue, jiraSummarizeIssueSchema } from "./tools/jira-summarize-issue.js";
import {
  jiraSummarizeProjectStatus,
  jiraSummarizeProjectStatusSchema,
} from "./tools/jira-summarize-project-status.js";
import { jiraListProjects } from "./tools/jira-list-projects.js";
import { jiraListBoards } from "./tools/jira-list-boards.js";
import { notionSearchPages, notionSearchPagesSchema } from "./tools/notion-search-pages.js";
import { notionSummarizePage, notionSummarizePageSchema } from "./tools/notion-summarize-page.js";
import { notionQueryDatabase, notionQueryDatabaseSchema } from "./tools/notion-query-database.js";
import {
  notionSummarizeDatabase,
  notionSummarizeDatabaseSchema,
} from "./tools/notion-summarize-database.js";
import { notionGetPageContext, notionGetPageContextSchema } from "./tools/notion-get-page-context.js";
import { registerResources } from "./resources/registry.js";
import { registerPrompts } from "./prompts/registry.js";
import { enforceReadOnly } from "./policy/read-only.js";

export async function startServer(): Promise<void> {
  const server = new McpServer({
    name: "oh-my-pm",
    version: "0.13.0",
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

  // ── ClickUp connector tools (read-only) ────────────────────────────────────

  server.tool(
    "clickup_list_tasks",
    "List open ClickUp tasks in a list with delivery tags (blocked, stale, unassigned, missing due date, overdue). Requires OH_MY_PM_CLICKUP_WORKSPACE_ID and OH_MY_PM_CLICKUP_TOKEN.",
    clickupListTasksSchema,
    async (params) => {
      const result = await clickupListTasks(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "clickup_summarize_task",
    "Get a structured summary of a single ClickUp task by ID.",
    clickupSummarizeTaskSchema,
    async (params) => {
      const result = await clickupSummarizeTask(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "clickup_summarize_list_status",
    "Summarize delivery status of a ClickUp list: open task count, blockers, stale, unassigned, missing due dates, overdue, and next-action candidates.",
    clickupSummarizeListStatusSchema,
    async (params) => {
      const result = await clickupSummarizeListStatus(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "clickup_list_spaces",
    "List spaces in the configured ClickUp workspace.",
    {},
    async () => {
      const result = await clickupListSpaces();
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "clickup_list_folders",
    "List folders in a configured or specified ClickUp space.",
    clickupListFoldersSchema,
    async (params) => {
      const result = await clickupListFolders(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "clickup_list_lists",
    "List lists in a configured or specified ClickUp folder or space.",
    clickupListListsSchema,
    async (params) => {
      const result = await clickupListLists(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "clickup_get_workspace_context",
    "Get ClickUp workspace identity: name, ID, and space count.",
    {},
    async () => {
      const result = await clickupGetWorkspaceContext();
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ── Airtable connector tools (read-only) ────────────────────────────────────

  server.tool(
    "airtable_list_bases",
    "List Airtable bases accessible to the configured token. Requires OH_MY_PM_AIRTABLE_TOKEN.",
    {},
    async () => {
      const result = await airtableListBases();
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "airtable_list_tables",
    "List tables in the configured Airtable base, with field counts. Requires OH_MY_PM_AIRTABLE_BASE_ID.",
    {},
    async () => {
      const result = await airtableListTables();
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "airtable_describe_table",
    "Describe an Airtable table's schema: field names, types, and views.",
    airtableDescribeTableSchema,
    async (params) => {
      const result = await airtableDescribeTable(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "airtable_list_records",
    "List records in an Airtable table with data-quality tags (missing owner, missing due date, missing required field, stale).",
    airtableListRecordsSchema,
    async (params) => {
      const result = await airtableListRecords(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "airtable_summarize_base_status",
    "Summarize delivery status of an Airtable table: record count, missing owners, missing due dates, missing required fields, stale records, next actions.",
    airtableSummarizeBaseStatusSchema,
    async (params) => {
      const result = await airtableSummarizeBaseStatus(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ── Linear connector tools (read-only) ──────────────────────────────────────

  server.tool(
    "linear_list_issues",
    "List open Linear issues in the configured team with delivery tags (blocked, stale, unassigned, missing estimate, missing cycle). Requires OH_MY_PM_LINEAR_TEAM_ID and OH_MY_PM_LINEAR_TOKEN.",
    linearListIssuesSchema,
    async (params) => {
      const result = await linearListIssues(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "linear_summarize_issue",
    "Get a structured summary of a single Linear issue by identifier (e.g. ENG-123).",
    linearSummarizeIssueSchema,
    async (params) => {
      const result = await linearSummarizeIssue(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "linear_summarize_project_status",
    "Summarize delivery status of the configured Linear team: open issue count, blockers, unassigned issues, missing estimates, missing cycles, stale issues, next actions.",
    linearSummarizeProjectStatusSchema,
    async (params) => {
      const result = await linearSummarizeProjectStatus(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "linear_list_teams",
    "List teams accessible to the configured Linear token.",
    {},
    async () => {
      const result = await linearListTeams();
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "linear_list_projects",
    "List projects in the configured Linear team.",
    {},
    async () => {
      const result = await linearListProjects();
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ── Jira connector tools (read-only) ────────────────────────────────────────

  server.tool(
    "jira_list_issues",
    "List open Jira issues in the configured project with delivery tags (blocked, stale, unassigned, missing estimate, missing sprint, overdue). Requires OH_MY_PM_JIRA_BASE_URL, OH_MY_PM_JIRA_PROJECT_KEY, OH_MY_PM_JIRA_EMAIL, and OH_MY_PM_JIRA_TOKEN.",
    jiraListIssuesSchema,
    async (params) => {
      const result = await jiraListIssues(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "jira_summarize_issue",
    "Get a structured summary of a single Jira issue by key (e.g. PROJ-123).",
    jiraSummarizeIssueSchema,
    async (params) => {
      const result = await jiraSummarizeIssue(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "jira_summarize_project_status",
    "Summarize delivery status of the configured Jira project: open issue count, blockers, unassigned issues, missing estimates, missing sprint assignment, overdue issues, stale issues, active sprint completion rate, next actions.",
    jiraSummarizeProjectStatusSchema,
    async (params) => {
      const result = await jiraSummarizeProjectStatus(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "jira_list_projects",
    "List projects accessible to the configured Jira site.",
    {},
    async () => {
      const result = await jiraListProjects();
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "jira_list_boards",
    "List boards in the configured Jira project.",
    {},
    async () => {
      const result = await jiraListBoards();
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ── Notion connector tools (read-only) ──────────────────────────────────────

  server.tool(
    "notion_search_pages",
    "Search the configured Notion workspace for pages/databases accessible to the integration. Requires OH_MY_PM_NOTION_TOKEN.",
    notionSearchPagesSchema,
    async (params) => {
      const result = await notionSearchPages(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "notion_summarize_page",
    "Get a structured summary of a single Notion page: properties and metadata.",
    notionSummarizePageSchema,
    async (params) => {
      const result = await notionSummarizePage(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "notion_query_database",
    "List items in a Notion database with data-quality tags (missing owner, missing status, missing due date, stale), optional status filter.",
    notionQueryDatabaseSchema,
    async (params) => {
      const result = await notionQueryDatabase(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "notion_summarize_database",
    "Summarize delivery status of a Notion database: item count, data-quality issues, handoff gaps, next actions.",
    notionSummarizeDatabaseSchema,
    async (params) => {
      const result = await notionSummarizeDatabase(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "notion_get_page_context",
    "Get a Notion page's properties plus its first-level block children as plain-text content, bounded.",
    notionGetPageContextSchema,
    async (params) => {
      const result = await notionGetPageContext(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ── Resources and Prompts ──────────────────────────────────────────────────
  registerResources(server);
  registerPrompts(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
