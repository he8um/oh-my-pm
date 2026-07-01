import type { GitHubClient } from "./client.js";
import type { GitHubIssue } from "./types.js";
import { excerptBody, clampMaxItems } from "./limits.js";

interface RawGitHubIssue {
  number: number;
  title: string;
  state: string;
  assignees: { login: string }[];
  labels: { name: string }[];
  created_at: string;
  updated_at: string;
  body: string | null;
  html_url: string;
  pull_request?: unknown;
}

export async function fetchOpenIssues(
  client: GitHubClient,
  maxItems?: number
): Promise<{ issues: GitHubIssue[] | null; error: unknown | null }> {
  const limit = clampMaxItems(maxItems);
  const perPage = Math.min(limit, 100);
  const result = await client.get<RawGitHubIssue[]>(
    `/repos/${client.owner}/${client.repo}/issues?state=open&per_page=${perPage}&page=1`
  );

  if (result.error) return { issues: null, error: result.error };

  const raw = result.data ?? [];
  const issues: GitHubIssue[] = raw
    .filter((i) => !i.pull_request) // exclude PRs from issues endpoint
    .slice(0, limit)
    .map((i) => ({
      number: i.number,
      title: i.title,
      state: i.state === "closed" ? "closed" : "open",
      assignees: i.assignees.map((a) => a.login),
      labels: i.labels.map((l) => l.name),
      created_at: i.created_at,
      updated_at: i.updated_at,
      body_excerpt: excerptBody(i.body),
      url: i.html_url,
    }));

  return { issues, error: null };
}

export async function fetchIssueByNumber(
  client: GitHubClient,
  issueNumber: number
): Promise<{ issue: GitHubIssue | null; error: unknown | null }> {
  const result = await client.get<RawGitHubIssue>(
    `/repos/${client.owner}/${client.repo}/issues/${issueNumber}`
  );

  if (result.error) return { issue: null, error: result.error };
  if (!result.data) return { issue: null, error: null };

  const i = result.data;
  return {
    issue: {
      number: i.number,
      title: i.title,
      state: i.state === "closed" ? "closed" : "open",
      assignees: i.assignees.map((a) => a.login),
      labels: i.labels.map((l) => l.name),
      created_at: i.created_at,
      updated_at: i.updated_at,
      body_excerpt: excerptBody(i.body),
      url: i.html_url,
    },
    error: null,
  };
}
