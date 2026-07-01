import type { LinearIssue, LinearRateLimitInfo, LinearStateType } from "./types.js";
import { RATE_LIMIT_WARNING_THRESHOLD, STALE_DAYS_THRESHOLD } from "./limits.js";

// Parse Linear rate limit headers from a response, when present.
export function parseRateLimitHeaders(
  headers: Record<string, string | null>
): LinearRateLimitInfo {
  const remaining = parseInt(headers["x-ratelimit-requests-remaining"] ?? "999", 10);

  return {
    remaining: isNaN(remaining) ? 999 : remaining,
    warning: !isNaN(remaining) && remaining < RATE_LIMIT_WARNING_THRESHOLD,
  };
}

const STATE_TYPE_VALUES: LinearStateType[] = [
  "backlog",
  "unstarted",
  "started",
  "completed",
  "canceled",
];

export function classifyStateType(rawType: string): LinearStateType {
  return (STATE_TYPE_VALUES as string[]).includes(rawType)
    ? (rawType as LinearStateType)
    : "unknown";
}

const BLOCKED_PATTERN = /block/i;

export function extractDeliveryTags(issue: LinearIssue, now: Date = new Date()): string[] {
  const tags: string[] = [];
  if (BLOCKED_PATTERN.test(issue.state_name) || issue.labels.some((l) => BLOCKED_PATTERN.test(l))) {
    tags.push("blocked");
  }
  if (!issue.assignee) tags.push("unassigned");
  if (issue.estimate === null) tags.push("missing_estimate");
  if (!issue.cycle_name) tags.push("missing_cycle");
  if (issue.priority_label === "No priority") tags.push("missing_priority");
  if (issue.state_type === "unknown") tags.push("unclear_state");

  const isOpen = issue.state_type !== "completed" && issue.state_type !== "canceled";
  if (isOpen && issue.updated_at) {
    const updated = new Date(issue.updated_at);
    if (!isNaN(updated.getTime())) {
      const diffDays = (now.getTime() - updated.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays > STALE_DAYS_THRESHOLD) tags.push("stale");
    }
  }

  return tags;
}
