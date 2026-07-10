import type {
  IntentCategory,
  JsonValue,
  Locale,
  NormalizedProviderItem,
  ProviderRequest,
  SkillId,
  SkillInputEnvelope,
  TaskGraph,
  TaskNode,
} from "@oh-my-pm/contracts";
import { PROVIDER_ACTION_VALUES, PROVIDER_ID_VALUES } from "@oh-my-pm/contracts";

/** Runtime-local mirror of the skills text item shape (not a shared contract). */
export type RuntimeTextItem = {
  id: string;
  title: string;
  body?: string;
  status?: string;
  owner?: string;
  due?: string;
  tags?: string[];
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

/** Map normalized provider items into the structured text-item shape. */
export function providerItemsToTextItems(
  items: readonly NormalizedProviderItem[],
): RuntimeTextItem[] {
  return items.map((item) => {
    const text: RuntimeTextItem = { id: item.id, title: item.title };
    if (isRecord(item.data)) {
      const body = stringOf(item.data["body"]) ?? stringOf(item.data["summary"]);
      if (body !== undefined) text.body = body;
      const status = stringOf(item.data["status"]);
      if (status !== undefined) text.status = status;
      const owner = stringOf(item.data["owner"]);
      if (owner !== undefined) text.owner = owner;
      const due = stringOf(item.data["due"]);
      if (due !== undefined) text.due = due;
      const tags = item.data["tags"];
      if (Array.isArray(tags) && tags.every((tag) => typeof tag === "string")) {
        text.tags = tags;
      }
    }
    return text;
  });
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
  if (items.length > 0) {
    const itemsJson = toJsonValue(items);
    inputObject["items"] = itemsJson;
    inputObject["tasks"] = itemsJson;
    inputObject["risks"] = itemsJson;
    inputObject["changes"] = itemsJson;
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
