import type { JiraClient } from "./client.js";
import type { JiraIssue } from "./types.js";
import { excerptDescription, clampMaxItems } from "./limits.js";
import { classifyStatusCategory } from "./formatters.js";

// Commonly used Agile-API story point custom field. Used only as a fallback
// when no better estimate signal is available — never assumed to be exact.
const STORY_POINTS_FALLBACK_FIELD = "customfield_10016";

interface RawJiraIssueFields {
  summary: string;
  status: { name: string; statusCategory: { key: string } };
  assignee: { displayName: string } | null;
  priority: { name: string } | null;
  duedate: string | null;
  updated: string;
  description: string | null;
  labels: string[];
  sprint?: { name: string } | null;
  [STORY_POINTS_FALLBACK_FIELD]?: number | null;
}

interface RawJiraIssue {
  id: string;
  key: string;
  fields: RawJiraIssueFields;
}

function extractDescriptionText(description: unknown): string | null {
  if (typeof description === "string") return description;
  return null;
}

function toJiraIssue(raw: RawJiraIssue, siteBaseUrl: string): JiraIssue {
  const f = raw.fields;
  return {
    id: raw.id,
    key: raw.key,
    summary: f.summary,
    status_name: f.status?.name ?? "Unknown",
    status_category: classifyStatusCategory(f.status?.statusCategory?.key ?? ""),
    assignee: f.assignee?.displayName ?? null,
    priority: f.priority?.name ?? null,
    story_points: f[STORY_POINTS_FALLBACK_FIELD] ?? null,
    sprint_name: f.sprint?.name ?? null,
    labels: f.labels ?? [],
    due_date: f.duedate ?? null,
    updated_at: f.updated ?? null,
    description_excerpt: excerptDescription(extractDescriptionText(f.description)),
    url: `${siteBaseUrl}/browse/${raw.key}`,
  };
}

interface SearchIssuesResponse {
  issues: RawJiraIssue[];
}

export async function fetchOpenIssuesInProject(
  client: JiraClient,
  projectKey: string,
  maxItems?: number
): Promise<{ issues: JiraIssue[] | null; error: unknown | null }> {
  const limit = clampMaxItems(maxItems);
  const jql = encodeURIComponent(`project = "${projectKey}" AND statusCategory != Done`);
  const result = await client.get<SearchIssuesResponse>(
    `/rest/api/3/search?jql=${jql}&maxResults=${limit}`
  );

  if (result.error) return { issues: null, error: result.error };

  const raw = result.data?.issues ?? [];
  const issues = raw.slice(0, limit).map((i) => toJiraIssue(i, client.baseUrl));

  return { issues, error: null };
}

export async function fetchIssueByKey(
  client: JiraClient,
  issueKey: string
): Promise<{ issue: JiraIssue | null; error: unknown | null }> {
  const result = await client.get<RawJiraIssue>(`/rest/api/3/issue/${issueKey}`);

  if (result.error) return { issue: null, error: result.error };
  if (!result.data) return { issue: null, error: null };

  return { issue: toJiraIssue(result.data, client.baseUrl), error: null };
}
