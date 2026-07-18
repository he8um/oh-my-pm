import type {
  JsonValue,
  NormalizedItemType,
  ProviderId,
  SkillId,
  SkillInputEnvelope,
  SkillOutputEnvelope,
} from "@oh-my-pm/contracts";

export type SkillDescriptor = {
  id: SkillId;
  name: string;
  deterministic: true;
  readOnly: true;
};

export type SkillResult = SkillOutputEnvelope;

export type Skill = {
  descriptor: SkillDescriptor;
  execute(input: SkillInputEnvelope): SkillResult;
};

export type SkillRegistry = {
  list(): readonly SkillDescriptor[];
  get(id: SkillId): Skill | undefined;
  execute(input: SkillInputEnvelope): SkillResult;
};

export type SkillFailureCode = "OMP-S-5001" | "OMP-S-5002" | "OMP-S-5003";

export type TextItem = {
  id: string;
  title: string;
  body?: string;
  status?: string;
  owner?: string;
  due?: string;
  tags?: string[];
  // Selected provider provenance (never a raw provider data object).
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
};

export type ProjectSignalSource =
  | "structured"
  | "markdown"
  | "github-repository"
  | "github-issue"
  | "github-pull-request"
  | "generic";

export type SkillInputObject = {
  title?: string;
  summary?: string;
  items?: TextItem[];
  changes?: TextItem[];
  notes?: string[];
  risks?: TextItem[];
  decisions?: TextItem[];
  tasks?: TextItem[];
  context?: JsonValue;
};

export type StatusSummary = {
  title: string;
  summary: string;
  counts: {
    total: number;
    done: number;
    blocked: number;
    open: number;
  };
  highlights: string[];
  generatedAt: string;
};

export type RiskSummary = {
  risks: Array<{
    id: string;
    title: string;
    severity: "low" | "medium" | "high";
    reason: string;
    source?: ProjectSignalSource;
    sourceType?: NormalizedItemType;
    url?: string;
    owner?: string;
    due?: string;
    repository?: string;
    number?: number;
  }>;
};

export type NextTasksResult = {
  tasks: Array<{
    id: string;
    title: string;
    reason: string;
    source?: ProjectSignalSource;
    sourceType?: NormalizedItemType;
    priority?: "low" | "medium" | "high";
    url?: string;
    owner?: string;
    due?: string;
    repository?: string;
    number?: number;
  }>;
};

export type HandoffResult = {
  title: string;
  sections: Array<{
    heading: string;
    items: string[];
  }>;
  generatedAt: string;
};

export type ReviewChangesResult = {
  changes: Array<{
    id: string;
    title: string;
    classification: "added" | "updated" | "blocked" | "unknown";
  }>;
};
