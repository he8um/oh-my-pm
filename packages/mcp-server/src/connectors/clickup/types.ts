export interface ClickUpTask {
  id: string;
  name: string;
  status: string;
  status_type: "open" | "closed" | "unknown";
  assignees: string[];
  priority: string | null;
  due_date: string | null;
  date_updated: string | null;
  description_excerpt: string | null;
  url: string;
}

export interface ClickUpSpace {
  id: string;
  name: string;
  archived: boolean;
}

export interface ClickUpFolder {
  id: string;
  name: string;
  space_id: string;
  archived: boolean;
  list_count: number;
}

export interface ClickUpList {
  id: string;
  name: string;
  folder_id: string | null;
  space_id: string | null;
  archived: boolean;
  task_count: number | null;
}

export interface ClickUpWorkspaceContext {
  id: string;
  name: string;
  space_count: number;
}

export interface ClickUpRateLimitInfo {
  remaining: number;
  limit: number;
  warning: boolean;
}
