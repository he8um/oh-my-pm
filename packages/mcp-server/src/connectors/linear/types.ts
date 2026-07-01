export type LinearStateType =
  | "backlog"
  | "unstarted"
  | "started"
  | "completed"
  | "canceled"
  | "unknown";

export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  state_name: string;
  state_type: LinearStateType;
  assignee: string | null;
  priority_label: string;
  estimate: number | null;
  cycle_name: string | null;
  labels: string[];
  updated_at: string | null;
  description_excerpt: string | null;
  url: string;
}

export interface LinearTeam {
  id: string;
  key: string;
  name: string;
}

export interface LinearProject {
  id: string;
  name: string;
  state: string;
  target_date: string | null;
}

export interface LinearWorkspaceContext {
  id: string;
  name: string;
  url_key: string;
}

export interface LinearRateLimitInfo {
  remaining: number;
  warning: boolean;
}
