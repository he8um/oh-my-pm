export type JiraStatusCategory = "todo" | "in_progress" | "done" | "unknown";

export interface JiraIssue {
  id: string;
  key: string;
  summary: string;
  status_name: string;
  status_category: JiraStatusCategory;
  assignee: string | null;
  priority: string | null;
  story_points: number | null;
  sprint_name: string | null;
  labels: string[];
  due_date: string | null;
  updated_at: string | null;
  description_excerpt: string | null;
  url: string;
}

export interface JiraProject {
  id: string;
  key: string;
  name: string;
}

export interface JiraBoard {
  id: number;
  name: string;
  type: string;
}

export interface JiraSprint {
  id: number;
  name: string;
  state: string;
  start_date: string | null;
  end_date: string | null;
}

export interface JiraSiteContext {
  base_url: string;
}

export interface JiraRateLimitInfo {
  remaining: number;
  warning: boolean;
  retry_after: string | null;
}
