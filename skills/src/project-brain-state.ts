// Pure Project Brain state derivation (v0.3 Phase 3).
//
// Turns already-normalized provider text items plus coverage information into
// canonical Project Brain state-item drafts and minimized evidence candidates.
// It reuses the existing deterministic risk/next-task extraction and Markdown
// section parsing; it never infers from unrestricted prose. It performs no I/O
// and reads no clock, environment, network, or randomness — every result is a
// pure function of its inputs. It registers NO new SkillId and leaves the Skill
// registry unchanged.
//
// The `EvidenceCandidate.fingerprintInput` field is EPHEMERAL: it exists only so
// the Runtime can compute a content fingerprint through the Kernel. It must
// never be persisted or returned in any public result.

import {
  collectMarkdownSectionItems,
  parseMarkdownProjectSections,
} from "./markdown-project.js";
import {
  extractNextTaskCandidates,
  extractRiskCandidates,
  normalizeSignalText,
} from "./project-signals.js";
import type { NextTaskCandidate, RiskCandidate } from "./project-signals.js";
import type { ProjectSignalSource, TextItem } from "./types.js";

/** A canonical state-item draft. Evidence reference ids are candidate ids until the
 * Runtime replaces them with final evidence ids. */
export interface StateItemDraft {
  readonly kind:
    | "milestone"
    | "task"
    | "risk"
    | "decision"
    | "dependency"
    | "blocker";
  readonly id: string;
  readonly title: string;
  /** Candidate ids backing this item (replaced with evidence ids downstream). */
  readonly evidenceRefIds: readonly string[];
  readonly status?: string;
  readonly severity?: string;
  readonly owner?: string;
  readonly dueDate?: string;
  readonly priority?: string;
  readonly metadata?: Readonly<Record<string, string>>;
}

/** The evidence source kind, mirroring the Project Brain contract taxonomy. */
export type EvidenceSourceKind =
  | "markdown"
  | "githubIssue"
  | "githubPullRequest"
  | "githubRepository"
  | "structured"
  | "generic";

/** A minimized evidence candidate. `fingerprintInput` is ephemeral (see above). */
export interface EvidenceCandidate {
  readonly candidateId: string;
  readonly sourceKind: EvidenceSourceKind;
  readonly sourceIdentity: string;
  readonly observedAt: string;
  readonly sourceUpdatedAt?: string;
  readonly provenance: Readonly<Record<string, string>>;
  readonly metadata?: Readonly<Record<string, string>>;
  /** EPHEMERAL bounded minimized text; never persisted or publicly returned. */
  readonly fingerprintInput: string;
}

/** A sanitized descriptor of one observed source. */
export interface SourceDescriptor {
  readonly sourceKind: EvidenceSourceKind;
  readonly sourceIdentity: string;
}

/** The derivation result. */
export interface ProjectStateDerivationResult {
  readonly objective?: string;
  readonly statusSummary: Readonly<Record<string, number>>;
  readonly sources: readonly SourceDescriptor[];
  readonly milestones: readonly StateItemDraft[];
  readonly tasks: readonly StateItemDraft[];
  readonly risks: readonly StateItemDraft[];
  readonly decisions: readonly StateItemDraft[];
  readonly dependencies: readonly StateItemDraft[];
  readonly blockers: readonly StateItemDraft[];
  readonly evidenceCandidates: readonly EvidenceCandidate[];
  readonly coverageGaps: readonly string[];
}

/** The derivation input. */
export interface ProjectStateDerivationInput {
  /** Normalized provider items (already stripped to allow-listed provenance). */
  readonly items: readonly TextItem[];
  /** Explicit structured tasks (direct declarations). */
  readonly explicitTasks?: readonly TextItem[];
  /** Explicit structured risks (direct declarations). */
  readonly explicitRisks?: readonly TextItem[];
  /** Injected reference instant for overdue/priority derivation (never a clock). */
  readonly now: string;
  /** Explicit coverage gap descriptors (partial/skipped sources). */
  readonly coverageGaps?: readonly string[];
  /** Caller-supplied observation timestamp for evidence candidates. */
  readonly observedAt: string;
}

// --- Per-kind bounds (documented and enforced) -----------------------------

/** Maximum decisions retained. */
export const MAX_DECISIONS = 50;
/** Maximum dependencies retained. */
export const MAX_DEPENDENCIES = 50;
/** Maximum milestones retained. */
export const MAX_MILESTONES = 50;
/** Maximum blockers retained (a subset of risks). */
export const MAX_BLOCKERS = 20;
/** Maximum bytes of ephemeral fingerprint input per candidate. */
export const MAX_FINGERPRINT_INPUT_BYTES = 4096;

// Explicit-only section headings for structured item kinds. Only content under
// these exact headings (English + Persian) is treated as a decision/dependency/
// milestone; arbitrary prose never counts.
const DECISION_HEADINGS = [
  "decisions",
  "decision log",
  "decision record",
  "adr",
  "تصمیمات",
  "تصمیم‌ها",
  "تصمیم ها",
  "گزارش تصمیم",
];
const DEPENDENCY_HEADINGS = [
  "dependencies",
  "dependency",
  "external dependencies",
  "وابستگی‌ها",
  "وابستگی ها",
  "وابستگی",
];
const MILESTONE_HEADINGS = [
  "milestones",
  "milestone",
  "roadmap",
  "مایلستون‌ها",
  "مایلستون ها",
  "نقاط عطف",
  "نقشه راه",
];

/** Explicit blocker reason markers. A risk is a blocker only when its reason
 * carries an explicit blocker signal (never merely high severity). */
function isExplicitBlockerReason(reason: string): boolean {
  return (
    reason === "github_state:blocked" ||
    reason.endsWith(":blocker") ||
    reason.endsWith(":blockers") ||
    reason === "markdown_heading:blockers" ||
    reason === "github_body:blocker"
  );
}

/** Map a signal source to the Project Brain evidence source kind. */
function evidenceSourceKindOf(source: ProjectSignalSource): EvidenceSourceKind {
  switch (source) {
    case "markdown":
      return "markdown";
    case "github-issue":
    case "github-comment":
      return "githubIssue";
    case "github-pull-request":
    case "github-review":
    case "github-review-comment":
      return "githubPullRequest";
    case "github-repository":
      return "githubRepository";
    case "structured":
      return "structured";
    default:
      return "generic";
  }
}

/** Truncate a string to a bounded UTF-8 byte length (whole code points only). */
function boundBytes(value: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  if (encoder.encode(value).length <= maxBytes) return value;
  let out = "";
  for (const ch of value) {
    if (encoder.encode(out + ch).length > maxBytes) break;
    out += ch;
  }
  return out;
}

/** Deterministic evidence candidate registry keyed by candidate id. */
class CandidateRegistry {
  private readonly byId = new Map<string, EvidenceCandidate>();
  readonly order: string[] = [];

  /** Ensure a candidate exists for a source; returns its stable id. */
  ensure(candidate: EvidenceCandidate): string {
    if (!this.byId.has(candidate.candidateId)) {
      this.byId.set(candidate.candidateId, candidate);
      this.order.push(candidate.candidateId);
    }
    return candidate.candidateId;
  }

  list(): EvidenceCandidate[] {
    return this.order.map((id) => this.byId.get(id)!);
  }
}

/** Build a bounded, minimized fingerprint input for a candidate. */
function fingerprintInputFor(sourceIdentity: string, title: string): string {
  return boundBytes(`${sourceIdentity}\n${title}`, MAX_FINGERPRINT_INPUT_BYTES);
}

/** The candidate id for a risk/task candidate (its stable source id). */
function candidateIdForSignal(candidate: RiskCandidate | NextTaskCandidate): string {
  return `cand:${candidate.sourceId}`;
}

/** Build the evidence candidate for a risk/task signal candidate. */
function candidateForSignal(
  candidate: RiskCandidate | NextTaskCandidate,
  observedAt: string,
): EvidenceCandidate {
  const provenance: Record<string, string> = {};
  if (candidate.line !== undefined) provenance["line"] = String(candidate.line);
  if (candidate.number !== undefined) provenance["number"] = String(candidate.number);
  if (candidate.filePath !== undefined) provenance["filePath"] = candidate.filePath;
  const metadata: Record<string, string> = {};
  if (candidate.repository !== undefined) metadata["repository"] = candidate.repository;
  if (candidate.author !== undefined) metadata["author"] = candidate.author;
  const evidenceCandidate: EvidenceCandidate = {
    candidateId: candidateIdForSignal(candidate),
    sourceKind: evidenceSourceKindOf(candidate.source),
    sourceIdentity: candidate.sourceId,
    observedAt,
    provenance,
    fingerprintInput: fingerprintInputFor(candidate.sourceId, candidate.title),
  };
  return Object.keys(metadata).length > 0
    ? { ...evidenceCandidate, metadata }
    : evidenceCandidate;
}

/** Convert a risk candidate to a state-item draft of the given kind. */
function riskDraft(
  candidate: RiskCandidate,
  kind: "risk" | "blocker",
  candidateId: string,
): StateItemDraft {
  const draft: StateItemDraft = {
    kind,
    id: candidate.id,
    title: candidate.title,
    evidenceRefIds: [candidateId],
    severity: candidate.severity,
  };
  const metadata: Record<string, string> = { reason: candidate.reason };
  const withOwner = candidate.owner !== undefined ? { ...draft, owner: candidate.owner } : draft;
  const withDue = candidate.due !== undefined ? { ...withOwner, dueDate: candidate.due } : withOwner;
  return { ...withDue, metadata };
}

/** Convert a task candidate to a task state-item draft. */
function taskDraft(candidate: NextTaskCandidate, candidateId: string): StateItemDraft {
  const draft: StateItemDraft = {
    kind: "task",
    id: candidate.id,
    title: candidate.title,
    evidenceRefIds: [candidateId],
    metadata: { reason: candidate.reason },
  };
  const withPriority =
    candidate.priority !== undefined ? { ...draft, priority: candidate.priority } : draft;
  const withOwner =
    candidate.owner !== undefined ? { ...withPriority, owner: candidate.owner } : withPriority;
  return candidate.due !== undefined ? { ...withOwner, dueDate: candidate.due } : withOwner;
}

/**
 * Collect explicit structured items (decisions/dependencies/milestones) from
 * Markdown sections under exact headings, with deterministic per-document ids.
 * Only content under a recognized heading counts.
 */
function collectStructuredKind(
  items: readonly TextItem[],
  headings: readonly string[],
  kind: "decision" | "dependency" | "milestone",
  registry: CandidateRegistry,
  observedAt: string,
  limit: number,
): StateItemDraft[] {
  const accepted = new Set(headings.map((h) => normalizeSignalText(h)));
  const drafts: StateItemDraft[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (item.body === undefined) continue;
    for (const section of parseMarkdownProjectSections(item)) {
      if (!accepted.has(normalizeSignalText(section.heading))) continue;
      let sequence = 0;
      for (const raw of section.items) {
        const title = raw.trim();
        if (title === "") continue;
        sequence += 1;
        const id = `${item.id}#${kind}-${sequence}`;
        const dedupeKey = `${item.id} ${normalizeSignalText(title)}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        const sourceIdentity = item.id;
        const candidateId = registry.ensure({
          candidateId: `cand:${id}`,
          sourceKind: "markdown",
          sourceIdentity,
          observedAt,
          provenance: { section: normalizeSignalText(section.heading) },
          fingerprintInput: fingerprintInputFor(sourceIdentity, title),
        });
        drafts.push({ kind, id, title, evidenceRefIds: [candidateId] });
        if (drafts.length >= limit) return drafts;
      }
    }
  }
  return drafts;
}

/**
 * Derive canonical Project Brain state drafts and minimized evidence candidates
 * from normalized items and coverage. Deterministic and pure.
 */
export function deriveProjectBrainState(
  input: ProjectStateDerivationInput,
): ProjectStateDerivationResult {
  const registry = new CandidateRegistry();

  // Risks and tasks reuse the existing deterministic extraction engine.
  const riskCandidates = extractRiskCandidates({
    explicitRisks: input.explicitRisks ?? [],
    items: input.items,
    now: input.now,
  });
  const taskCandidates = extractNextTaskCandidates({
    explicitTasks: input.explicitTasks ?? [],
    items: input.items,
    now: input.now,
  });

  const risks: StateItemDraft[] = [];
  const blockers: StateItemDraft[] = [];
  for (const candidate of riskCandidates) {
    const candidateId = registry.ensure(candidateForSignal(candidate, input.observedAt));
    risks.push(riskDraft(candidate, "risk", candidateId));
    if (isExplicitBlockerReason(candidate.reason) && blockers.length < MAX_BLOCKERS) {
      blockers.push(riskDraft(candidate, "blocker", candidateId));
    }
  }

  const tasks: StateItemDraft[] = [];
  for (const candidate of taskCandidates) {
    const candidateId = registry.ensure(candidateForSignal(candidate, input.observedAt));
    tasks.push(taskDraft(candidate, candidateId));
  }

  const decisions = collectStructuredKind(
    input.items,
    DECISION_HEADINGS,
    "decision",
    registry,
    input.observedAt,
    MAX_DECISIONS,
  );
  const dependencies = collectStructuredKind(
    input.items,
    DEPENDENCY_HEADINGS,
    "dependency",
    registry,
    input.observedAt,
    MAX_DEPENDENCIES,
  );
  const milestones = collectStructuredKind(
    input.items,
    MILESTONE_HEADINGS,
    "milestone",
    registry,
    input.observedAt,
    MAX_MILESTONES,
  );

  // Status summary: deterministic counts by kind (not content).
  const statusSummary: Record<string, number> = {
    milestone: milestones.length,
    task: tasks.length,
    risk: risks.length,
    decision: decisions.length,
    dependency: dependencies.length,
    blocker: blockers.length,
  };

  // Sources: sanitized descriptors of the observed source items, in order.
  const sources: SourceDescriptor[] = [];
  const seenSources = new Set<string>();
  for (const item of input.items) {
    const kind: EvidenceSourceKind =
      item.source === "github"
        ? githubItemKind(item)
        : item.body !== undefined
          ? "markdown"
          : "generic";
    const key = `${kind}:${item.id}`;
    if (seenSources.has(key)) continue;
    seenSources.add(key);
    sources.push({ sourceKind: kind, sourceIdentity: item.id });
  }

  const result: ProjectStateDerivationResult = {
    statusSummary,
    sources,
    milestones,
    tasks,
    risks,
    decisions,
    dependencies,
    blockers,
    evidenceCandidates: registry.list(),
    coverageGaps: [...(input.coverageGaps ?? [])],
  };

  // Objective: the first explicit "objective"/"goal" section item, when present.
  const objective = firstObjective(input.items);
  return objective !== undefined ? { ...result, objective } : result;
}

/** Classify a GitHub item's evidence source kind from its normalized kind. */
function githubItemKind(item: TextItem): EvidenceSourceKind {
  const kind = normalizeSignalText(item.kind ?? "");
  if (item.type === "record" || kind === "repository") return "githubRepository";
  if (item.type === "pullRequest" || kind === "pullrequest") return "githubPullRequest";
  return "githubIssue";
}

const OBJECTIVE_HEADINGS = ["objective", "goal", "objectives", "goals", "هدف", "اهداف"];

/** The first explicit objective/goal section item across documents, or undefined. */
function firstObjective(items: readonly TextItem[]): string | undefined {
  const collected = collectMarkdownSectionItems(items, OBJECTIVE_HEADINGS);
  return collected.length > 0 ? collected[0] : undefined;
}
