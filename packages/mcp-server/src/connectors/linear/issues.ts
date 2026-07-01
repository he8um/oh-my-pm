import type { LinearClient } from "./client.js";
import type { LinearIssue } from "./types.js";
import { excerptDescription, clampMaxItems } from "./limits.js";
import { classifyStateType } from "./formatters.js";

interface RawLinearIssue {
  id: string;
  identifier: string;
  title: string;
  state: { name: string; type: string };
  assignee: { name: string } | null;
  priorityLabel: string;
  estimate: number | null;
  cycle: { name: string } | null;
  labels: { nodes: { name: string }[] };
  updatedAt: string;
  description: string | null;
  url: string;
}

function toLinearIssue(i: RawLinearIssue): LinearIssue {
  return {
    id: i.id,
    identifier: i.identifier,
    title: i.title,
    state_name: i.state?.name ?? "unknown",
    state_type: classifyStateType(i.state?.type ?? ""),
    assignee: i.assignee?.name ?? null,
    priority_label: i.priorityLabel,
    estimate: i.estimate,
    cycle_name: i.cycle?.name ?? null,
    labels: (i.labels?.nodes ?? []).map((l) => l.name),
    updated_at: i.updatedAt,
    description_excerpt: excerptDescription(i.description),
    url: i.url,
  };
}

const ISSUE_FIELDS = `
  id
  identifier
  title
  state { name type }
  assignee { name }
  priorityLabel
  estimate
  cycle { name }
  labels { nodes { name } }
  updatedAt
  description
  url
`;

const LIST_ISSUES_QUERY = `
  query ListTeamIssues($teamId: String!, $first: Int!) {
    team(id: $teamId) {
      issues(first: $first, filter: { state: { type: { nin: ["completed", "canceled"] } } }) {
        nodes { ${ISSUE_FIELDS} }
      }
    }
  }
`;

const ISSUE_BY_ID_QUERY = `
  query IssueByIdentifier($id: String!) {
    issue(id: $id) { ${ISSUE_FIELDS} }
  }
`;

interface ListIssuesResponse {
  team: { issues: { nodes: RawLinearIssue[] } } | null;
}

interface IssueByIdResponse {
  issue: RawLinearIssue | null;
}

export async function fetchOpenIssuesInTeam(
  client: LinearClient,
  teamId: string,
  maxItems?: number
): Promise<{ issues: LinearIssue[] | null; error: unknown | null }> {
  const limit = clampMaxItems(maxItems);
  const result = await client.query<ListIssuesResponse>(LIST_ISSUES_QUERY, {
    teamId,
    first: limit,
  });

  if (result.error) return { issues: null, error: result.error };

  const raw = result.data?.team?.issues.nodes ?? [];
  const issues = raw.slice(0, limit).map(toLinearIssue);

  return { issues, error: null };
}

export async function fetchIssueByIdentifier(
  client: LinearClient,
  issueId: string
): Promise<{ issue: LinearIssue | null; error: unknown | null }> {
  const result = await client.query<IssueByIdResponse>(ISSUE_BY_ID_QUERY, { id: issueId });

  if (result.error) return { issue: null, error: result.error };
  if (!result.data?.issue) return { issue: null, error: null };

  return { issue: toLinearIssue(result.data.issue), error: null };
}
