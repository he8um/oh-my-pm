import type { JiraIssue, JiraRateLimitInfo, JiraStatusCategory } from "./types.js";
import { RATE_LIMIT_WARNING_THRESHOLD, STALE_DAYS_THRESHOLD } from "./limits.js";

// Parse Jira rate limit headers from a response, when present.
export function parseRateLimitHeaders(
  headers: Record<string, string | null>
): JiraRateLimitInfo {
  const remaining = parseInt(headers["x-ratelimit-remaining"] ?? "999", 10);

  return {
    remaining: isNaN(remaining) ? 999 : remaining,
    warning: !isNaN(remaining) && remaining < RATE_LIMIT_WARNING_THRESHOLD,
    retry_after: headers["retry-after"] ?? null,
  };
}

const STATUS_CATEGORY_KEY_MAP: Record<string, JiraStatusCategory> = {
  new: "todo",
  indeterminate: "in_progress",
  done: "done",
};

export function classifyStatusCategory(categoryKey: string): JiraStatusCategory {
  return STATUS_CATEGORY_KEY_MAP[categoryKey] ?? "unknown";
}

const BLOCKED_PATTERN = /block/i;

export function extractDeliveryTags(issue: JiraIssue, now: Date = new Date()): string[] {
  const tags: string[] = [];
  if (BLOCKED_PATTERN.test(issue.status_name) || issue.labels.some((l) => BLOCKED_PATTERN.test(l))) {
    tags.push("blocked");
  }
  if (!issue.assignee) tags.push("unassigned");
  if (issue.story_points === null) tags.push("missing_estimate");
  if (!issue.sprint_name) tags.push("missing_sprint");
  if (!issue.priority) tags.push("missing_priority");
  if (issue.status_category === "unknown") tags.push("unclear_status");

  const isOpen = issue.status_category !== "done";
  if (isOpen && issue.due_date) {
    const due = new Date(issue.due_date);
    if (!isNaN(due.getTime()) && due.getTime() < now.getTime()) {
      tags.push("overdue");
    }
  }

  if (isOpen && issue.updated_at) {
    const updated = new Date(issue.updated_at);
    if (!isNaN(updated.getTime())) {
      const diffDays = (now.getTime() - updated.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays > STALE_DAYS_THRESHOLD) tags.push("stale");
    }
  }

  return tags;
}
