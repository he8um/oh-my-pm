// Pure, deterministic project-signal extraction. No Node imports and no
// filesystem, environment, network, random, or real-clock access. Every result
// is a pure function of normalized inputs plus the injected `now`. The module
// turns explicit Skill input, Markdown documents, and normalized GitHub items
// into line/item-level risk and next-task candidates.

import type { NormalizedItemType } from "@oh-my-pm/contracts";
import { isBlockedItem, isDoneItem, normalizeText } from "./helpers.js";
import {
  matchActionMarker,
  matchRiskMarker,
  parseMarkdownSignalEntries,
} from "./markdown-project.js";
import type { MarkdownSignalEntry } from "./markdown-project.js";
import type { ProjectSignalSource, TextItem } from "./types.js";

export type { ProjectSignalSource } from "./types.js";

export type RiskCandidate = {
  id: string;
  title: string;
  severity: "low" | "medium" | "high";
  reason: string;
  source: ProjectSignalSource;
  sourceId: string;
  sourceType?: NormalizedItemType;
  url?: string;
  owner?: string;
  due?: string;
  repository?: string;
  number?: number;
};

export type NextTaskCandidate = {
  id: string;
  title: string;
  reason: string;
  source: ProjectSignalSource;
  sourceId: string;
  sourceType?: NormalizedItemType;
  priority?: "low" | "medium" | "high";
  url?: string;
  owner?: string;
  due?: string;
  repository?: string;
  number?: number;
};

export const MAX_RISKS = 20;
export const MAX_NEXT_TASKS = 10;

type Severity = "low" | "medium" | "high";
type Priority = "low" | "medium" | "high";

// --- Canonical matching normalization (Step 4) -----------------------------

const ZERO_WIDTH_NON_JOINER = "‌";
const ARABIC_YEH = "ي";
const PERSIAN_YEH = "ی";
const ARABIC_KAF = "ك";
const PERSIAN_KAF = "ک";

/**
 * Deterministic matching normalizer. Trims, lowercases without locale APIs,
 * unifies Arabic/Persian yeh and kaf, replaces ZWNJ with a space, collapses
 * whitespace, and drops one trailing colon. Preserves arbitrary Unicode letters.
 * Never used to alter a displayed title.
 */
export function normalizeSignalText(value: string): string {
  let result = value.trim().toLowerCase();
  result = result
    .split(ARABIC_YEH)
    .join(PERSIAN_YEH)
    .split(ARABIC_KAF)
    .join(PERSIAN_KAF)
    .split(ZERO_WIDTH_NON_JOINER)
    .join(" ");
  result = result.replace(/\s+/g, " ").trim();
  return result.replace(/:$/, "");
}

/**
 * Token normalizer for labels: applies the base normalization, then folds `_`,
 * `/`, and repeated `-` separators to a single `-`.
 */
export function normalizeSignalToken(value: string): string {
  const base = normalizeSignalText(value);
  return base.replace(/[_/\s]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}


// --- Deterministic due-date comparison (Step 5) ----------------------------

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_WITH_TZ = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/** Days in a month using the Gregorian leap-year rule. No clock access. */
function daysInMonth(year: number, month: number): number {
  const lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return lengths[month - 1] ?? 0;
}

/**
 * Parse a due/now value into a comparable epoch-millis instant using only the
 * value itself (no machine clock, no timezone inference). Date-only values are
 * anchored to 23:59:59.999Z. Timestamps must carry a timezone. Returns null for
 * anything invalid. Calendar validity (including leap days) is checked
 * arithmetically so the Skill layer never constructs a Date from ambient time.
 */
export function parseComparableInstant(value: string): number | null {
  const trimmed = value.trim();
  const dateOnly = DATE_ONLY.exec(trimmed);
  if (dateOnly !== null) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    if (month < 1 || month > 12) return null;
    if (day < 1 || day > daysInMonth(year, month)) return null;
    // Date.UTC with all explicit fields is a pure calendar computation.
    return Date.UTC(year, month - 1, day, 23, 59, 59, 999);
  }
  if (ISO_WITH_TZ.test(trimmed)) {
    const ms = Date.parse(trimmed);
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

/**
 * True when `due` is strictly before `now` (both parseable). An unparseable
 * `now` disables overdue inference. Done/closed state is checked by the caller.
 */
export function isOverdue(due: string | undefined, now: string): boolean {
  if (due === undefined) return false;
  const nowMs = parseComparableInstant(now);
  if (nowMs === null) return false;
  const dueMs = parseComparableInstant(due);
  if (dueMs === null) return false;
  return dueMs < nowMs;
}

// --- GitHub label / title taxonomy (Step 9, 11) ----------------------------

const HIGH_LABELS = new Set([
  "blocker",
  "blocked",
  "critical",
  "security",
  "urgent",
  "p0",
  "priority-critical",
  "priority-high",
  "sev0",
  "sev1",
]);
const MEDIUM_LABELS = new Set([
  "risk",
  "dependency",
  "waiting",
  "waiting-on",
  "needs-info",
  "needs-information",
  "p1",
  "priority-medium",
  "sev2",
]);
const LOW_LABELS = new Set(["risk-low", "p2", "priority-low", "sev3"]);
const NO_ACTION_LABELS = new Set([
  "duplicate",
  "invalid",
  "wontfix",
  "won't-fix",
  "not-planned",
]);

function labelSeverity(label: string): Severity | null {
  const token = normalizeSignalToken(label);
  if (HIGH_LABELS.has(token)) return "high";
  if (MEDIUM_LABELS.has(token)) return "medium";
  if (LOW_LABELS.has(token)) return "low";
  return null;
}

function isNoActionLabel(label: string): boolean {
  return NO_ACTION_LABELS.has(normalizeSignalToken(label));
}

/** First label (source order) matching a given severity, with its raw token. */
function firstLabelOfSeverity(
  labels: readonly string[],
  severity: Severity,
): { label: string; token: string } | null {
  for (const label of labels) {
    if (labelSeverity(label) === severity) {
      return { label, token: normalizeSignalToken(label) };
    }
  }
  return null;
}

// Bounded exact title phrases (word/phrase boundary matching, not includes()).
const HIGH_TITLE = ["blocked", "blocker", "critical", "urgent", "security", "overdue"];
const MEDIUM_TITLE = ["risk", "dependency", "delayed", "delay", "waiting", "missing"];
const LOW_TITLE = ["concern", "known issue"];

/** Word/phrase-boundary token search over a normalized title. */
function titlePhrase(title: string, phrases: readonly string[]): string | null {
  const normalized = ` ${normalizeSignalText(title)} `;
  for (const phrase of phrases) {
    if (normalized.includes(` ${phrase} `)) return phrase;
  }
  return null;
}

// --- Body signal helpers ---------------------------------------------------

type BodySignal = { kind: "blocker" | "risk" | "concern"; reason: string };

const RISK_HEADING_HIGH = new Set(
  ["blocker", "blockers", "blocked", "issues and blockers"].map((h) => normalizeSignalText(h)),
);
const RISK_HEADING_MEDIUM = new Set(
  ["risk", "risks", "risk register", "open risks", "known risks", "dependencies", "dependency"].map(
    (h) => normalizeSignalText(h),
  ),
);
const RISK_HEADING_LOW = new Set(["concerns", "known issues"].map((h) => normalizeSignalText(h)));

/**
 * Scan a GitHub item body for the strongest explicit risk signal, recognized
 * only inside a matching risk heading section or as an explicit line marker.
 * Body narrative outside those structures never counts.
 */
function bodyRiskSignal(body: string | undefined): BodySignal | null {
  if (body === undefined) return null;
  const entries = parseMarkdownSignalEntries({ id: "body", title: "body", body });
  let best: BodySignal | null = null;
  const consider = (candidate: BodySignal): void => {
    const rank = { concern: 0, risk: 1, blocker: 2 } as const;
    if (best === null || rank[candidate.kind] > rank[best.kind]) best = candidate;
  };
  for (const entry of entries) {
    if (entry.kind === "marker") {
      const marker = matchRiskMarker(entry.text);
      if (marker !== null) {
        const p = normalizeSignalText(marker.prefix);
        if (p === "blocker" || p === "blocked by" || p === "مانع" || p === "مسدودکننده") {
          consider({ kind: "blocker", reason: "github_body:blocker" });
        } else if (p === "dependency" || p === "risk" || p === "وابستگی" || p === "ریسک") {
          consider({ kind: "risk", reason: "github_body:risk" });
        } else {
          consider({ kind: "concern", reason: "github_body:concern" });
        }
      }
      continue;
    }
    if (entry.normalizedHeading === "") continue;
    if (RISK_HEADING_HIGH.has(entry.normalizedHeading)) {
      consider({ kind: "blocker", reason: "github_body:blocker" });
    } else if (RISK_HEADING_MEDIUM.has(entry.normalizedHeading)) {
      consider({ kind: "risk", reason: "github_body:risk" });
    } else if (RISK_HEADING_LOW.has(entry.normalizedHeading)) {
      consider({ kind: "concern", reason: "github_body:concern" });
    }
  }
  return best;
}

// --- GitHub item classification (Step 10-12) -------------------------------

function githubSource(item: TextItem): ProjectSignalSource {
  if (item.type === "record" || normalizeSignalText(item.kind ?? "") === "repository") {
    return "github-repository";
  }
  if (item.type === "pullRequest" || normalizeSignalText(item.kind ?? "") === "pullrequest") {
    return "github-pull-request";
  }
  return "github-issue";
}

function isGitHubItem(item: TextItem): boolean {
  return item.source === "github";
}

function isRepositoryRecord(item: TextItem): boolean {
  return (
    item.source === "github" &&
    item.type === "record" &&
    normalizeSignalText(item.kind ?? "") === "repository"
  );
}

function hasBlockerLabelOrTag(item: TextItem): boolean {
  const values = [...(item.labels ?? []), ...(item.tags ?? [])];
  return values.some((v) => {
    const token = normalizeSignalToken(v);
    return token === "blocker" || token === "blocked";
  });
}

function riskMetadata(item: TextItem): Partial<RiskCandidate> {
  const meta: Partial<RiskCandidate> = {};
  if (item.url !== undefined) meta.url = item.url;
  if (item.owner !== undefined) meta.owner = item.owner;
  if (item.due !== undefined) meta.due = item.due;
  if (item.repository !== undefined) meta.repository = item.repository;
  if (item.number !== undefined) meta.number = item.number;
  if (item.type !== undefined) meta.sourceType = item.type;
  return meta;
}

function taskMetadata(item: TextItem): Partial<NextTaskCandidate> {
  const meta: Partial<NextTaskCandidate> = {};
  if (item.url !== undefined) meta.url = item.url;
  if (item.owner !== undefined) meta.owner = item.owner;
  if (item.due !== undefined) meta.due = item.due;
  if (item.repository !== undefined) meta.repository = item.repository;
  if (item.number !== undefined) meta.number = item.number;
  if (item.type !== undefined) meta.sourceType = item.type;
  return meta;
}

/**
 * Classify a single GitHub issue/PR into at most one risk candidate, following
 * the exact precedence ladder. Returns null when no risk signal applies.
 */
export function classifyGitHubRisk(
  item: TextItem,
  now: string,
): RiskCandidate | null {
  const status = normalizeSignalText(item.status ?? "");
  const done = isDoneItem(item);
  const base = {
    id: item.id,
    title: item.title,
    source: githubSource(item),
    sourceId: item.id,
    ...riskMetadata(item),
  };

  // 1. overdue due date on an open/draft (not done/closed/merged) item.
  if (!done && (status === "open" || status === "draft" || status === "") && isOverdue(item.due, now)) {
    return { ...base, severity: "high", reason: "github_due:overdue" };
  }
  // 2. blocked status or exact blocker/blocked label/tag.
  if (status === "blocked" || hasBlockerLabelOrTag(item)) {
    return { ...base, severity: "high", reason: "github_state:blocked" };
  }
  const labels = item.labels ?? [];
  // 3. first high-risk label.
  const high = firstLabelOfSeverity(labels, "high");
  if (high !== null) return { ...base, severity: "high", reason: `github_label:${high.token}` };
  // 4. explicit blocker heading/marker in body.
  const body = bodyRiskSignal(item.body);
  if (body !== null && body.kind === "blocker") {
    return { ...base, severity: "high", reason: body.reason };
  }
  // 5. first medium-risk label.
  const medium = firstLabelOfSeverity(labels, "medium");
  if (medium !== null) return { ...base, severity: "medium", reason: `github_label:${medium.token}` };
  // 6. explicit risk/dependency heading/marker in body.
  if (body !== null && body.kind === "risk") {
    return { ...base, severity: "medium", reason: body.reason };
  }
  // 7. first low-risk label.
  const low = firstLabelOfSeverity(labels, "low");
  if (low !== null) return { ...base, severity: "low", reason: `github_label:${low.token}` };
  // 8. explicit concern/known-issue heading/marker in body.
  if (body !== null && body.kind === "concern") {
    return { ...base, severity: "low", reason: body.reason };
  }
  // 9. bounded exact risk phrase in title.
  const highTitle = titlePhrase(item.title, HIGH_TITLE);
  if (highTitle !== null) {
    return { ...base, severity: "high", reason: `github_title:${highTitle.replace(/\s+/g, "-")}` };
  }
  const mediumTitle = titlePhrase(item.title, MEDIUM_TITLE);
  if (mediumTitle !== null) {
    return { ...base, severity: "medium", reason: `github_title:${mediumTitle.replace(/\s+/g, "-")}` };
  }
  const lowTitle = titlePhrase(item.title, LOW_TITLE);
  if (lowTitle !== null) {
    return { ...base, severity: "low", reason: `github_title:${lowTitle.replace(/\s+/g, "-")}` };
  }
  return null;
}

/** Repository record risk (archived/disabled), or null. */
function classifyGitHubRepositoryRisk(item: TextItem): RiskCandidate | null {
  const signals = [normalizeSignalText(item.status ?? ""), ...(item.tags ?? []).map(normalizeSignalText)];
  const base = {
    id: item.id,
    title: item.title,
    source: "github-repository" as const,
    sourceId: item.id,
    ...riskMetadata(item),
  };
  if (signals.includes("disabled")) {
    return { ...base, severity: "high", reason: "github_repository:disabled" };
  }
  if (signals.includes("archived")) {
    return { ...base, severity: "medium", reason: "github_repository:archived" };
  }
  return null;
}

/**
 * Classify a GitHub issue/PR into a next-task candidate, or null when it is not
 * eligible (repository record, terminal state, no-action label, blocked, empty
 * title). Priority is derived deterministically.
 */
export function classifyGitHubNextTask(
  item: TextItem,
  now: string,
): NextTaskCandidate | null {
  if (isRepositoryRecord(item)) return null;
  if (item.title.trim() === "") return null;
  const status = normalizeSignalText(item.status ?? "");
  const isPr = githubSource(item) === "github-pull-request";

  // Eligible states: issue open; PR open or draft.
  const eligible = isPr ? status === "open" || status === "draft" : status === "open";
  if (!eligible) return null;
  if (isDoneItem(item) || isBlockedItem(item)) return null;
  if (hasBlockerLabelOrTag(item)) return null;
  const labels = item.labels ?? [];
  if (labels.some(isNoActionLabel)) return null;
  // Explicit body blocker also excludes.
  const body = bodyRiskSignal(item.body);
  if (body !== null && body.kind === "blocker") return null;

  const reason = isPr
    ? status === "draft"
      ? "github_pull_request:draft"
      : "github_pull_request:open"
    : "github_issue:open";

  // Priority precedence.
  let priority: Priority;
  if (isOverdue(item.due, now) || firstLabelOfSeverity(labels, "high") !== null) {
    priority = "high";
  } else if (
    firstLabelOfSeverity(labels, "medium") !== null ||
    (item.due !== undefined && parseComparableInstant(item.due) !== null) ||
    (isPr && (item.requestedReviewers ?? []).length > 0)
  ) {
    priority = "medium";
  } else {
    priority = "low";
  }

  return {
    id: item.id,
    title: item.title,
    reason,
    source: githubSource(item),
    sourceId: item.id,
    priority,
    ...taskMetadata(item),
  };
}

// --- Markdown extraction (Step 7-8) ----------------------------------------

const MD_RISK_HEADING_HIGH = new Set(
  [
    "blocker",
    "blockers",
    "blocked",
    "issues and blockers",
    "موانع",
    "مانع",
    "بلاکرها",
    "بلاکر ها",
  ].map((h) => normalizeSignalText(h)),
);
const MD_RISK_HEADING_MEDIUM = new Set(
  [
    "risk",
    "risks",
    "risk register",
    "open risks",
    "known risks",
    "dependencies",
    "dependency",
    "ریسک",
    "ریسک‌ها",
    "ریسک ها",
    "ریسک‌های باز",
    "ریسک های باز",
    "وابستگی‌ها",
    "وابستگی ها",
    "وابستگی",
  ].map((h) => normalizeSignalText(h)),
);
const MD_RISK_HEADING_LOW = new Set(
  [
    "concerns",
    "known issues",
    "نگرانی‌ها",
    "نگرانی ها",
    "مشکلات شناخته‌شده",
    "مشکلات شناخته شده",
  ].map((h) => normalizeSignalText(h)),
);

function markdownHeadingSeverity(
  normalizedHeading: string,
): { severity: Severity; reason: string } | null {
  if (MD_RISK_HEADING_HIGH.has(normalizedHeading)) {
    return { severity: "high", reason: "markdown_heading:blockers" };
  }
  if (MD_RISK_HEADING_MEDIUM.has(normalizedHeading)) {
    // Dependencies map to a dedicated reason while staying medium.
    const isDependency =
      normalizedHeading === "dependencies" ||
      normalizedHeading === "dependency" ||
      normalizedHeading === normalizeSignalText("وابستگی") ||
      normalizedHeading === normalizeSignalText("وابستگی‌ها") ||
      normalizedHeading === normalizeSignalText("وابستگی ها");
    return { severity: "medium", reason: isDependency ? "markdown_heading:dependencies" : "markdown_heading:risks" };
  }
  if (MD_RISK_HEADING_LOW.has(normalizedHeading)) {
    return { severity: "low", reason: "markdown_heading:risks" };
  }
  return null;
}

function markerRiskSeverity(prefix: string): { severity: Severity; reason: string } {
  const p = normalizeSignalText(prefix);
  if (p === "blocker" || p === "blocked by" || p === "مانع" || p === "مسدودکننده") {
    return { severity: "high", reason: "markdown_marker:blocker" };
  }
  if (p === "dependency" || p === "وابستگی") {
    return { severity: "medium", reason: "markdown_marker:dependency" };
  }
  if (p === "risk" || p === "ریسک") {
    return { severity: "medium", reason: "markdown_marker:risk" };
  }
  return { severity: "low", reason: "markdown_marker:concern" };
}

const MD_ACTION_HEADINGS = new Set(
  [
    "next",
    "next steps",
    "next actions",
    "action",
    "actions",
    "action items",
    "tasks",
    "todo",
    "to do",
    "active work",
    "current work",
    "open items",
    "بعدی",
    "گام بعدی",
    "گام‌های بعدی",
    "گام های بعدی",
    "اقدام",
    "اقدامات",
    "اقدامات بعدی",
    "کارهای بعدی",
    "کار های بعدی",
    "وظایف",
    "تسک‌ها",
    "تسک ها",
    "کارهای باز",
    "کار های باز",
    "کارهای جاری",
    "کار های جاری",
  ].map((h) => normalizeSignalText(h)),
);

function actionHeadingReason(normalizedHeading: string): string {
  if (
    normalizedHeading === "action items" ||
    normalizedHeading === "action" ||
    normalizedHeading === "actions" ||
    normalizedHeading === normalizeSignalText("اقدام") ||
    normalizedHeading === normalizeSignalText("اقدامات")
  ) {
    return "markdown_heading:action_items";
  }
  return "markdown_heading:next_steps";
}

function actionMarkerReason(prefix: string): string {
  const p = normalizeSignalText(prefix);
  if (
    p === "action" ||
    p === "action item" ||
    p === "اقدام" ||
    p === "اقدام بعدی" ||
    p === "task" ||
    p === "todo" ||
    p === "کار" ||
    p === "وظیفه" ||
    p === "تسک"
  ) {
    return "markdown_marker:action";
  }
  return "markdown_marker:next";
}

// Priority markers (Step 8).
const PRIORITY_MARKERS: Array<{ pattern: RegExp; priority: Priority }> = [
  { pattern: /^\[p0\]\s*/i, priority: "high" },
  { pattern: /^\[p1\]\s*/i, priority: "medium" },
  { pattern: /^\[p2\]\s*/i, priority: "low" },
  { pattern: /^p0:\s*/i, priority: "high" },
  { pattern: /^p1:\s*/i, priority: "medium" },
  { pattern: /^p2:\s*/i, priority: "low" },
  { pattern: /^critical:\s*/i, priority: "high" },
  { pattern: /^urgent:\s*/i, priority: "high" },
  { pattern: /^high:\s*/i, priority: "medium" },
  { pattern: /^medium:\s*/i, priority: "low" },
  { pattern: /^low:\s*/i, priority: "low" },
];
const PRIORITY_MARKERS_FA: Array<{ prefix: string; priority: Priority }> = [
  { prefix: "بحرانی", priority: "high" },
  { prefix: "فوری", priority: "high" },
  { prefix: "بالا", priority: "medium" },
  { prefix: "متوسط", priority: "low" },
  { prefix: "پایین", priority: "low" },
];

/** Strip a leading priority marker; returns the remainder and priority. */
function stripPriorityMarker(title: string): { title: string; priority?: Priority } {
  for (const marker of PRIORITY_MARKERS) {
    if (marker.pattern.test(title)) {
      const remainder = title.replace(marker.pattern, "").trim();
      if (remainder === "") return { title };
      return { title: remainder, priority: marker.priority };
    }
  }
  const colonIndex = title.indexOf(":");
  if (colonIndex !== -1) {
    const head = normalizeSignalText(title.slice(0, colonIndex));
    for (const marker of PRIORITY_MARKERS_FA) {
      if (head === marker.prefix) {
        const remainder = title.slice(colonIndex + 1).trim();
        if (remainder === "") return { title };
        return { title: remainder, priority: marker.priority };
      }
    }
  }
  return { title };
}

// --- Structured explicit classification (Step 13) --------------------------

const GENERIC_HIGH_TOKENS = ["blocked", "blocker", "overdue", "urgent", "critical"];
const GENERIC_MEDIUM_TOKENS = ["risk", "dependency", "delay", "delayed", "waiting", "missing"];

function explicitRiskSeverity(item: TextItem): Severity {
  const signals = [
    normalizeSignalText(item.status ?? ""),
    ...(item.tags ?? []).map((t) => normalizeSignalText(t)),
  ];
  if (signals.some((s) => GENERIC_HIGH_TOKENS.includes(s))) return "high";
  if (signals.some((s) => GENERIC_MEDIUM_TOKENS.includes(s))) return "medium";
  const titleHigh = titlePhrase(item.title, HIGH_TITLE);
  if (titleHigh !== null) return "high";
  const titleMedium = titlePhrase(item.title, MEDIUM_TITLE);
  if (titleMedium !== null) return "medium";
  return "low";
}

function hasOperationalField(item: TextItem): boolean {
  return (
    item.status !== undefined ||
    item.owner !== undefined ||
    item.due !== undefined ||
    (item.tags !== undefined && item.tags.length > 0)
  );
}

// --- Public extraction (Step 14: ordering, dedupe, limits) -----------------

class OrderedRisks {
  private readonly byId = new Set<string>();
  private readonly bySource = new Set<string>();
  private readonly byMarkdown = new Set<string>();
  readonly items: RiskCandidate[] = [];

  add(candidate: RiskCandidate): void {
    if (this.byId.has(candidate.id)) return;
    if (candidate.source !== "markdown" && candidate.source !== "structured") {
      if (this.bySource.has(candidate.sourceId)) return;
    }
    if (candidate.source === "markdown") {
      const key = `${candidate.sourceId} ${normalizeSignalText(candidate.title)}`;
      if (this.byMarkdown.has(key)) return;
      this.byMarkdown.add(key);
    }
    this.byId.add(candidate.id);
    this.bySource.add(candidate.sourceId);
    this.items.push(candidate);
  }
}

class OrderedTasks {
  private readonly byId = new Set<string>();
  private readonly bySource = new Set<string>();
  private readonly byMarkdown = new Set<string>();
  readonly items: NextTaskCandidate[] = [];

  add(candidate: NextTaskCandidate): void {
    if (this.byId.has(candidate.id)) return;
    if (candidate.source !== "markdown" && candidate.source !== "structured") {
      if (this.bySource.has(candidate.sourceId)) return;
    }
    if (candidate.source === "markdown") {
      const key = `${candidate.sourceId} ${normalizeSignalText(candidate.title)}`;
      if (this.byMarkdown.has(key)) return;
      this.byMarkdown.add(key);
    }
    this.byId.add(candidate.id);
    this.bySource.add(candidate.sourceId);
    this.items.push(candidate);
  }
}

function isMarkdownItem(item: TextItem): boolean {
  // Loaded Markdown documents arrive as generic/document items with a body and
  // are not GitHub items.
  return !isGitHubItem(item) && item.body !== undefined;
}

/** Markdown risk candidates for one item, in line order. */
function markdownRiskCandidates(item: TextItem): RiskCandidate[] {
  const entries = parseMarkdownSignalEntries(item);
  const out: RiskCandidate[] = [];

  // First pass to know per-section list presence: re-parse grouping by heading.
  const bySection: Array<{ heading: string; sev: { severity: Severity; reason: string } | null; entries: MarkdownSignalEntry[] }> = [];
  for (const entry of entries) {
    if (bySection.length === 0 || bySection[bySection.length - 1]!.heading !== entry.heading) {
      bySection.push({
        heading: entry.heading,
        sev: markdownHeadingSeverity(entry.normalizedHeading),
        entries: [],
      });
    }
    bySection[bySection.length - 1]!.entries.push(entry);
  }

  for (const section of bySection) {
    const hasListItems = section.entries.some(
      (e) => e.kind === "list-item" || e.kind === "numbered-item" || e.kind === "unchecked-task" || e.kind === "checked-task",
    );
    for (const entry of section.entries) {
      // Explicit markers are always candidates regardless of heading.
      if (entry.kind === "marker") {
        const marker = matchRiskMarker(entry.text);
        if (marker !== null) {
          const sev = markerRiskSeverity(marker.prefix);
          out.push(makeMdRisk(item, entry, sev.severity, sev.reason, marker.body));
        }
        continue;
      }
      if (section.sev === null) continue;
      // Checked tasks are resolved and excluded.
      if (entry.kind === "checked-task") continue;
      if (entry.kind === "list-item" || entry.kind === "numbered-item" || entry.kind === "unchecked-task") {
        out.push(makeMdRisk(item, entry, section.sev.severity, section.sev.reason));
      } else if (entry.kind === "paragraph" && !hasListItems) {
        out.push(makeMdRisk(item, entry, section.sev.severity, section.sev.reason));
      }
    }
  }
  return out;
}

function makeMdRisk(
  item: TextItem,
  entry: MarkdownSignalEntry,
  severity: Severity,
  reason: string,
  overrideTitle?: string,
): RiskCandidate {
  return {
    id: `${item.id}#risk-${entry.sequence}`,
    title: overrideTitle ?? entry.text,
    severity,
    reason,
    source: "markdown",
    sourceId: item.id,
  };
}

/** Markdown next-task candidates for one item, in line order. */
function markdownTaskCandidates(item: TextItem): NextTaskCandidate[] {
  const entries = parseMarkdownSignalEntries(item);
  const out: NextTaskCandidate[] = [];

  // Determine which headings are risk sections (their list items are risks,
  // never tasks).
  const sectionRisk = new Map<string, boolean>();
  const bySection: Array<{ heading: string; isAction: boolean; isRisk: boolean; entries: MarkdownSignalEntry[] }> = [];
  for (const entry of entries) {
    if (bySection.length === 0 || bySection[bySection.length - 1]!.heading !== entry.heading) {
      bySection.push({
        heading: entry.heading,
        isAction: MD_ACTION_HEADINGS.has(entry.normalizedHeading),
        isRisk: markdownHeadingSeverity(entry.normalizedHeading) !== null,
        entries: [],
      });
    }
    bySection[bySection.length - 1]!.entries.push(entry);
  }
  void sectionRisk;

  for (const section of bySection) {
    for (const entry of section.entries) {
      if (entry.kind === "marker") {
        const marker = matchActionMarker(entry.text);
        if (marker !== null) {
          out.push(makeMdTask(item, entry, actionMarkerReason(marker.prefix), marker.body, "action"));
        }
        continue;
      }
      // Unchecked checklist entries anywhere become tasks (unless in a risk
      // section, where they are risks).
      if (entry.kind === "unchecked-task" && !section.isRisk) {
        out.push(makeMdTask(item, entry, "markdown_unchecked_task", entry.text, "task"));
        continue;
      }
      // Checked tasks never become tasks.
      if (entry.kind === "checked-task") continue;
      // List/numbered items under an action heading become tasks.
      if ((entry.kind === "list-item" || entry.kind === "numbered-item") && section.isAction) {
        out.push(makeMdTask(item, entry, actionHeadingReason(entry.normalizedHeading), entry.text, "action"));
      }
    }
  }
  return out;
}

function makeMdTask(
  item: TextItem,
  entry: MarkdownSignalEntry,
  reason: string,
  rawTitle: string,
  idKind: "task" | "action",
): NextTaskCandidate {
  const stripped = stripPriorityMarker(rawTitle);
  const candidate: NextTaskCandidate = {
    id: `${item.id}#${idKind}-${entry.sequence}`,
    title: stripped.title,
    reason,
    source: "markdown",
    sourceId: item.id,
  };
  if (stripped.priority !== undefined) candidate.priority = stripped.priority;
  return candidate;
}

/** Extract deterministic risk candidates. */
export function extractRiskCandidates(input: {
  explicitRisks: readonly TextItem[];
  items: readonly TextItem[];
  now: string;
}): RiskCandidate[] {
  const risks = new OrderedRisks();

  // 1. explicit structured risks.
  for (const item of input.explicitRisks) {
    risks.add({
      id: item.id,
      title: item.title,
      severity: explicitRiskSeverity(item),
      reason: "explicit",
      source: "structured",
      sourceId: item.id,
      ...riskMetadata(item),
    });
  }

  // 2. Markdown candidates in document/line order.
  for (const item of input.items) {
    if (!isMarkdownItem(item)) continue;
    for (const candidate of markdownRiskCandidates(item)) {
      risks.add(candidate);
    }
  }

  // 3. GitHub candidates in provider order.
  for (const item of input.items) {
    if (!isGitHubItem(item)) continue;
    if (isRepositoryRecord(item)) {
      const repoRisk = classifyGitHubRepositoryRisk(item);
      if (repoRisk !== null) risks.add(repoRisk);
      continue;
    }
    const risk = classifyGitHubRisk(item, input.now);
    if (risk !== null) risks.add(risk);
  }

  // 4. generic fallback (non-GitHub, non-Markdown items only).
  for (const item of input.items) {
    if (isGitHubItem(item) || isMarkdownItem(item)) continue;
    const signals = [
      normalizeSignalText(item.status ?? ""),
      ...(item.tags ?? []).map((t) => normalizeSignalText(t)),
    ];
    const titleHigh = titlePhrase(item.title, HIGH_TITLE);
    const titleMedium = titlePhrase(item.title, MEDIUM_TITLE);
    let severity: Severity | null = null;
    if (signals.some((s) => GENERIC_HIGH_TOKENS.includes(s)) || titleHigh !== null) severity = "high";
    else if (signals.some((s) => GENERIC_MEDIUM_TOKENS.includes(s)) || titleMedium !== null) severity = "medium";
    if (severity === null) continue;
    risks.add({
      id: item.id,
      title: item.title,
      severity,
      reason: "explicit",
      source: "generic",
      sourceId: item.id,
      ...riskMetadata(item),
    });
  }

  return risks.items.slice(0, MAX_RISKS);
}

/** Extract deterministic next-task candidates. */
export function extractNextTaskCandidates(input: {
  explicitTasks: readonly TextItem[];
  items: readonly TextItem[];
  now: string;
}): NextTaskCandidate[] {
  const tasks = new OrderedTasks();

  // 1. explicit structured tasks.
  for (const item of input.explicitTasks) {
    tasks.add({
      id: item.id,
      title: item.title,
      reason: "explicit",
      source: "structured",
      sourceId: item.id,
      ...taskMetadata(item),
    });
  }

  // 2. Markdown unchecked/action candidates in document/line order.
  for (const item of input.items) {
    if (!isMarkdownItem(item)) continue;
    for (const candidate of markdownTaskCandidates(item)) {
      tasks.add(candidate);
    }
  }

  // 3. GitHub high/medium/low buckets in provider order.
  const gh: NextTaskCandidate[] = [];
  for (const item of input.items) {
    if (!isGitHubItem(item)) continue;
    const task = classifyGitHubNextTask(item, input.now);
    if (task !== null) gh.push(task);
  }
  for (const bucket of ["high", "medium", "low"] as const) {
    for (const task of gh) {
      if (task.priority === bucket) tasks.add(task);
    }
  }

  // 4. generic fallback (non-GitHub, non-Markdown items only).
  for (const item of input.items) {
    if (isGitHubItem(item) || isMarkdownItem(item)) continue;
    if (!hasOperationalField(item) || isDoneItem(item) || isBlockedItem(item)) continue;
    tasks.add({
      id: item.id,
      title: item.title,
      reason: item.due !== undefined ? "open_with_due" : "open_item",
      source: "generic",
      sourceId: item.id,
      ...taskMetadata(item),
    });
  }

  return tasks.items.slice(0, MAX_NEXT_TASKS);
}

