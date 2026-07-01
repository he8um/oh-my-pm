import type { ClickUpRateLimitInfo, ClickUpTask } from "./types.js";
import { RATE_LIMIT_WARNING_THRESHOLD, STALE_DAYS_THRESHOLD } from "./limits.js";

// Parse ClickUp rate limit headers from a response, when present.
export function parseRateLimitHeaders(
  headers: Record<string, string | null>
): ClickUpRateLimitInfo {
  const remaining = parseInt(headers["x-ratelimit-remaining"] ?? "999", 10);
  const limit = parseInt(headers["x-ratelimit-limit"] ?? "100", 10);

  return {
    remaining: isNaN(remaining) ? 999 : remaining,
    limit: isNaN(limit) ? 100 : limit,
    warning: !isNaN(remaining) && remaining < RATE_LIMIT_WARNING_THRESHOLD,
  };
}

const CLOSED_STATUS_PATTERN = /closed|complete|done/i;
const BLOCKED_STATUS_PATTERN = /block/i;

export function classifyStatusType(statusName: string): "open" | "closed" | "unknown" {
  if (!statusName) return "unknown";
  if (CLOSED_STATUS_PATTERN.test(statusName)) return "closed";
  return "open";
}

export function extractDeliveryTags(task: ClickUpTask, now: Date = new Date()): string[] {
  const tags: string[] = [];
  if (BLOCKED_STATUS_PATTERN.test(task.status)) tags.push("blocked");
  if (task.assignees.length === 0) tags.push("unassigned");
  if (!task.due_date) tags.push("missing_due_date");
  if (task.status_type === "open" && task.due_date && new Date(task.due_date) < now) {
    tags.push("overdue");
  }
  if (task.date_updated) {
    const updated = new Date(task.date_updated);
    if (!isNaN(updated.getTime())) {
      const diffDays = (now.getTime() - updated.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays > STALE_DAYS_THRESHOLD) tags.push("stale");
    }
  }
  return tags;
}
