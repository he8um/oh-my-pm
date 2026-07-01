// Tool names and resource identifiers are always English.
// Agent output language follows the user/project language setting.
// Technical identifiers (API, rollback, sprint, backlog, QA, CI/CD) are
// preserved in English in all outputs.

// Returns true if the string is a technical identifier that must stay in English.
export function isTechnicalIdentifier(term: string): boolean {
  const PRESERVED = new Set([
    "API", "rollback", "sprint", "backlog", "milestone", "QA", "CI/CD",
    "CI", "CD", "dependency", "handoff", "blocker", "RAG", "DRI", "SOW",
    "UAT", "RACI",
  ]);
  return PRESERVED.has(term);
}
