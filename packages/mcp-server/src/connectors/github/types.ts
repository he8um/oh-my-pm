export interface GitHubIssue {
  number: number;
  title: string;
  state: "open" | "closed";
  assignees: string[];
  labels: string[];
  created_at: string;
  updated_at: string;
  body_excerpt: string | null;
  url: string;
}

export interface GitHubMilestone {
  number: number;
  title: string;
  state: "open" | "closed";
  due_on: string | null;
  open_issues: number;
  closed_issues: number;
  completion_pct: number;
  url: string;
}

export interface GitHubRepositoryContext {
  name: string;
  full_name: string;
  description: string | null;
  default_branch: string;
  open_issues_count: number;
  is_private: boolean;
  url: string;
}

export interface GitHubRateLimitInfo {
  remaining: number;
  limit: number;
  reset_at: string | null;
  warning: boolean;
}
