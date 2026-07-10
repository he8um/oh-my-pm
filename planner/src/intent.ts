import type { IntentCategory } from "@oh-my-pm/contracts";

/** Trim, lowercase, and collapse internal whitespace to single spaces. */
export function normalizeRequestText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Ordered, deterministic keyword rules; first matching category wins. */
const INTENT_RULES: readonly { intent: IntentCategory; keywords: readonly string[] }[] = [
  { intent: "status", keywords: ["status", "health", "doctor"] },
  { intent: "riskReview", keywords: ["risk", "risks", "blocked", "blocker"] },
  { intent: "nextTask", keywords: ["next", "todo", "task", "action item"] },
  { intent: "handoff", keywords: ["handoff", "summary", "brief"] },
];

/** Classify a request into an intent; empty requests classify to null. */
export function classifyIntent(request: string): IntentCategory | null {
  const normalized = normalizeRequestText(request);
  if (normalized === "") {
    return null;
  }
  for (const rule of INTENT_RULES) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword))) {
      return rule.intent;
    }
  }
  return "planning";
}
