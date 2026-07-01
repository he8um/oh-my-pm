import type { GitHubRateLimitInfo } from "./types.js";

// Parse GitHub rate limit headers from a response.
export function parseRateLimitHeaders(
  headers: Record<string, string | null>
): GitHubRateLimitInfo {
  const remaining = parseInt(headers["x-ratelimit-remaining"] ?? "999", 10);
  const limit = parseInt(headers["x-ratelimit-limit"] ?? "60", 10);
  const resetTs = headers["x-ratelimit-reset"];
  const reset_at = resetTs
    ? new Date(parseInt(resetTs, 10) * 1000).toISOString()
    : null;

  return {
    remaining: isNaN(remaining) ? 999 : remaining,
    limit: isNaN(limit) ? 60 : limit,
    reset_at,
    warning: !isNaN(remaining) && remaining < 10,
  };
}

// Translate a list of GitHub issue labels into delivery-relevant tag list.
export function extractDeliveryTags(labels: string[]): string[] {
  const BLOCKER_PATTERNS = /blocker|blocked|critical|urgent|p0/i;
  const STALE_PATTERNS = /stale|no-activity|waiting/i;
  const tags: string[] = [];
  if (labels.some((l) => BLOCKER_PATTERNS.test(l))) tags.push("blocker");
  if (labels.some((l) => STALE_PATTERNS.test(l))) tags.push("stale");
  return tags;
}
