import type {
  IntentCategory,
  JsonValue,
  Locale,
  NormalizedItemType,
  NormalizedProviderItem,
  ProviderId,
  ProviderRequest,
  SkillId,
  SkillInputEnvelope,
  TaskGraph,
  TaskNode,
} from "@oh-my-pm/contracts";
import {
  NORMALIZED_ITEM_TYPE_VALUES,
  PROVIDER_ACTION_VALUES,
  PROVIDER_ID_VALUES,
} from "@oh-my-pm/contracts";

/**
 * Runtime-local mirror of the skills text item shape (not a shared contract).
 * Carries only the selected provider provenance the Skill layer is allowed to
 * see — never a raw provider `data` object or any unknown field.
 */
export type RuntimeTextItem = {
  id: string;
  title: string;
  body?: string;
  status?: string;
  owner?: string;
  due?: string;
  tags?: string[];
  source?: ProviderId;
  type?: NormalizedItemType;
  url?: string;
  repository?: string;
  number?: number;
  kind?: string;
  labels?: string[];
  assignees?: string[];
  author?: string;
  milestone?: string;
  createdAt?: string;
  updatedAt?: string;
  closedAt?: string;
  mergedAt?: string;
  requestedReviewers?: string[];
  // GitHub item-comment provenance (only present on comment notes). Carries the
  // bounded parent linkage and the author's repository association; never any
  // node id, avatar, reaction, raw API url, or nested user object.
  parentNumber?: number;
  parentType?: string;
  parentStatus?: string;
  authorAssociation?: string;
  // GitHub review / review-comment provenance (only present on review notes).
  // Approved provenance only; a raw review/review-comment object, diff_hunk,
  // commit id, node id, nested user, or api url is never carried.
  reviewState?: string;
  submittedAt?: string;
  filePath?: string;
  line?: number;
  startLine?: number;
  side?: "left" | "right";
  startSide?: "left" | "right";
};

const INTENT_TO_SKILL: Readonly<Record<IntentCategory, SkillId>> = {
  status: "summarizeStatus",
  riskReview: "extractRisks",
  nextTask: "deriveNextTasks",
  planning: "deriveNextTasks",
  handoff: "createHandoff",
};

export function skillIdForIntent(intent: IntentCategory): SkillId {
  return INTENT_TO_SKILL[intent];
}

function isRecord(value: JsonValue | undefined): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOf(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Trimmed non-empty string, or undefined. Never mutates the source. */
function trimmedStringOf(value: JsonValue | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** Trimmed non-empty string entries, first occurrence preserved, in order. */
function trimmedStringArrayOf(value: JsonValue | undefined): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (trimmed === "" || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

/** Positive safe integer, or undefined. */
function positiveIntegerOf(value: JsonValue | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    return undefined;
  }
  return value;
}

/** Parse a providerRead node payload into a ProviderRequest; null when invalid. */
export function providerRequestFromNode(node: TaskNode): ProviderRequest | null {
  if (node.kind !== "providerRead" || !isRecord(node.payload)) {
    return null;
  }
  const raw = node.payload["providerRequest"];
  if (!isRecord(raw)) {
    return null;
  }
  const providerId = stringOf(raw["providerId"]);
  const action = stringOf(raw["action"]);
  const query = stringOf(raw["query"]);
  if (
    providerId === undefined ||
    !(PROVIDER_ID_VALUES as readonly string[]).includes(providerId) ||
    action === undefined ||
    !(PROVIDER_ACTION_VALUES as readonly string[]).includes(action) ||
    query === undefined
  ) {
    return null;
  }
  const request: ProviderRequest = {
    providerId: providerId as ProviderRequest["providerId"],
    action: action as ProviderRequest["action"],
    query,
  };
  const limit = raw["limit"];
  if (limit !== undefined) {
    if (typeof limit !== "number" || !Number.isInteger(limit)) {
      return null;
    }
    request.limit = limit;
  }
  return request;
}

/**
 * Map normalized provider items into the structured text-item shape, carrying
 * only the selected provenance the Skill layer is allowed to see. Raw `data`
 * objects, `metadata`, nested provider objects, and unknown fields are never
 * retained. Input items are never mutated.
 */
export function providerItemsToTextItems(
  items: readonly NormalizedProviderItem[],
): RuntimeTextItem[] {
  return items.map((item) => {
    const text: RuntimeTextItem = { id: item.id, title: item.title };

    // Item-level provenance (from the normalized item, not its data payload).
    if (
      typeof item.source === "string" &&
      (PROVIDER_ID_VALUES as readonly string[]).includes(item.source)
    ) {
      text.source = item.source;
    }
    if (
      typeof item.type === "string" &&
      (NORMALIZED_ITEM_TYPE_VALUES as readonly string[]).includes(item.type)
    ) {
      text.type = item.type;
    }
    const url = trimmedStringOf(item.url);
    if (url !== undefined) text.url = url;

    if (isRecord(item.data)) {
      const data = item.data;
      // Document-shaped items (e.g. loaded Markdown files) carry their text
      // in data.content; body and summary keep precedence when present.
      const body = stringOf(data["body"]) ?? stringOf(data["summary"]) ?? stringOf(data["content"]);
      if (body !== undefined) text.body = body;

      const status = trimmedStringOf(data["status"]);
      if (status !== undefined) text.status = status;
      const owner = trimmedStringOf(data["owner"]);
      if (owner !== undefined) text.owner = owner;
      const due = trimmedStringOf(data["due"]);
      if (due !== undefined) text.due = due;
      const tags = trimmedStringArrayOf(data["tags"]);
      if (tags !== undefined) text.tags = tags;

      const repository = trimmedStringOf(data["repository"]);
      if (repository !== undefined) text.repository = repository;
      const num = positiveIntegerOf(data["number"]);
      if (num !== undefined) text.number = num;
      const kind = trimmedStringOf(data["kind"]);
      if (kind !== undefined) text.kind = kind;
      const labels = trimmedStringArrayOf(data["labels"]);
      if (labels !== undefined) text.labels = labels;
      const assignees = trimmedStringArrayOf(data["assignees"]);
      if (assignees !== undefined) text.assignees = assignees;
      const author = trimmedStringOf(data["author"]);
      if (author !== undefined) text.author = author;
      const milestone = trimmedStringOf(data["milestone"]);
      if (milestone !== undefined) text.milestone = milestone;
      const createdAt = trimmedStringOf(data["createdAt"]);
      if (createdAt !== undefined) text.createdAt = createdAt;
      const updatedAt = trimmedStringOf(data["updatedAt"]);
      if (updatedAt !== undefined) text.updatedAt = updatedAt;
      const closedAt = trimmedStringOf(data["closedAt"]);
      if (closedAt !== undefined) text.closedAt = closedAt;
      const mergedAt = trimmedStringOf(data["mergedAt"]);
      if (mergedAt !== undefined) text.mergedAt = mergedAt;
      const requestedReviewers = trimmedStringArrayOf(data["requestedReviewers"]);
      if (requestedReviewers !== undefined) text.requestedReviewers = requestedReviewers;

      // GitHub item-comment provenance (only present on comment notes).
      const parentNumber = positiveIntegerOf(data["parentNumber"]);
      if (parentNumber !== undefined) text.parentNumber = parentNumber;
      const parentType = trimmedStringOf(data["parentType"]);
      if (parentType !== undefined) text.parentType = parentType;
      const parentStatus = trimmedStringOf(data["parentStatus"]);
      if (parentStatus !== undefined) text.parentStatus = parentStatus;
      const authorAssociation = trimmedStringOf(data["authorAssociation"]);
      if (authorAssociation !== undefined) text.authorAssociation = authorAssociation;

      // GitHub review / review-comment provenance (only present on review notes).
      // Approved fields only; a raw review/review-comment object, diff_hunk,
      // commit id, node id, nested user, or api url is never carried.
      const reviewState = trimmedStringOf(data["reviewState"]);
      if (reviewState !== undefined) text.reviewState = reviewState;
      const submittedAt = trimmedStringOf(data["submittedAt"]);
      if (submittedAt !== undefined) text.submittedAt = submittedAt;
      const filePath = trimmedStringOf(data["filePath"]);
      if (filePath !== undefined) text.filePath = filePath;
      const line = positiveIntegerOf(data["line"]);
      if (line !== undefined) text.line = line;
      const startLine = positiveIntegerOf(data["startLine"]);
      if (startLine !== undefined) text.startLine = startLine;
      const side = sideOf(data["side"]);
      if (side !== undefined) text.side = side;
      const startSide = sideOf(data["startSide"]);
      if (startSide !== undefined) text.startSide = startSide;
    }
    return text;
  });
}

/** Read a normalized diff side, accepting only the lowercase "left"/"right". */
function sideOf(value: unknown): "left" | "right" | undefined {
  if (value === "left" || value === "right") return value;
  return undefined;
}

/** Trimmed non-empty notes from the planner context, in order. */
export function notesFromPlannerContext(context: JsonValue): string[] {
  if (!isRecord(context) || !Array.isArray(context["notes"])) {
    return [];
  }
  const notes: string[] = [];
  for (const entry of context["notes"]) {
    if (typeof entry === "string" && entry.trim() !== "") {
      notes.push(entry.trim());
    }
  }
  return notes;
}

function toJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

/** Build the deterministic skill input envelope for a plan execution. */
export function skillInputForPlan(input: {
  skillId: SkillId;
  locale: Locale;
  now: string;
  request: string;
  graph: TaskGraph;
  providerItems: readonly NormalizedProviderItem[];
  notes: readonly string[];
}): SkillInputEnvelope {
  const items = providerItemsToTextItems(input.providerItems);
  const inputObject: { [key: string]: JsonValue } = {
    title: input.request,
    summary: input.request,
    context: { graph: toJsonValue(input.graph) },
  };
  // Generic provider items are context, not declarations: they flow to the
  // skill as items only. Explicit tasks/risks/changes collections are for
  // direct Skill callers outside the Runtime plan path.
  if (items.length > 0) {
    inputObject["items"] = toJsonValue(items);
  }
  if (input.notes.length > 0) {
    inputObject["notes"] = [...input.notes];
  }
  return {
    skillId: input.skillId,
    context: { locale: input.locale, now: input.now },
    input: inputObject,
  };
}
