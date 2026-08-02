// The shared application result contract.
//
// Why this exists
// ---------------
// The two shared use cases already returned discriminated results with
// sanitized failure codes -- `ProjectWorkflowResult` keyed by a project root and
// `GitHubWorkflowResult` keyed by a repository. Both were correct, but each
// described its own SOURCE in its own field, so a consumer could not ask "where
// did this come from?" without knowing which use case it had called, and there
// was no shared place to carry diagnostics or provenance.
//
// `ApplicationResult<TData>` is that shared identity. It is deliberately
// ADDITIVE: the existing per-use-case results keep their exact shapes and public
// behaviour, and this envelope describes them uniformly. Nothing is forced into
// it -- a low-level pure function still returns whatever it returns.
//
// Constraints this contract must keep, because CLI and MCP both serialize it:
//
//   * deterministic field order when serialized (see applicationResultToJson);
//   * a stable `schemaVersion`;
//   * an explicit, safe source description;
//   * diagnostics separated from the primary data;
//   * provenance for derived findings that need traceability;
//   * no secrets, no process objects, no CLI formatting, no MCP content blocks,
//     no browser-specific fields.
//
// Pure types plus pure helpers: no filesystem, environment, clock, network, or
// randomness.

import type { JsonValue } from "@oh-my-pm/contracts";

/**
 * The application result schema version.
 *
 * Bumped only for a BREAKING change to the envelope itself. Adding an optional
 * field is compatible and does not bump it; removing or retyping a field, or
 * changing the meaning of an existing one, does. See docs/v0.5/contracts.md.
 */
export const APPLICATION_RESULT_SCHEMA_VERSION = "1";

// ---------------------------------------------------------------------------
// Source descriptors.
// ---------------------------------------------------------------------------

/**
 * The kinds of thing an application result can be derived FROM.
 *
 * Closed on purpose: a new source kind is a contract change that must be
 * considered, not something a caller can invent inline.
 */
export const SOURCE_KINDS = [
  "local-project",
  "github-repository",
  "github-issues",
  "github-pull-requests",
  "github-item",
  "github-search",
  "project-memory-snapshot",
  "project-timeline",
] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

/**
 * A normalized, safe description of where data came from.
 *
 * Carries identity and selection metadata ONLY. It must never carry a token, an
 * authorization header, a raw transport object, a resolved absolute path, or
 * document content:
 *
 *   * `reference` is the caller-supplied project root or the `owner/repo`
 *     repository slug exactly as it was given -- never a resolved path;
 *   * `selection` holds bounded selection metadata (state, limit, search kind);
 *   * `identifier` is a safe item number or snapshot id where one applies.
 *
 * The redaction guarantee is asserted by application/test and by the security
 * tests in tools; `assertSafeSourceDescriptor` below is the reusable check.
 */
export type SourceDescriptor = {
  readonly kind: SourceKind;
  /** Caller-supplied root or `owner/repo`. Never a resolved absolute path. */
  readonly reference: string;
  /** A safe item number, snapshot id, or similar. Absent when not applicable. */
  readonly identifier?: string;
  /** Bounded selection metadata. JSON-safe scalars only. */
  readonly selection?: Readonly<Record<string, string | number | boolean>>;
};

// ---------------------------------------------------------------------------
// Diagnostics.
// ---------------------------------------------------------------------------

export const DIAGNOSTIC_SEVERITIES = ["info", "warning", "error"] as const;
export type DiagnosticSeverity = (typeof DIAGNOSTIC_SEVERITIES)[number];

/**
 * A single machine-readable diagnostic, separate from the primary data.
 *
 * `code` is the stable contract -- a consumer branches on it, never on
 * `message`. `message` is safe, human-readable text that may name a
 * caller-supplied reference but never a secret, a resolved absolute path, or a
 * raw provider body.
 */
export type Diagnostic = {
  readonly code: string;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  /** What the user can do about it, when there is a concrete action. */
  readonly remediation?: string;
  /** Whether retrying the same call could plausibly succeed. */
  readonly retryable?: boolean;
  /** Where the diagnostic came from, when narrower than the result's source. */
  readonly source?: SourceDescriptor;
  /** JSON-safe structured detail. Never a cause chain or a stack trace. */
  readonly details?: Readonly<Record<string, JsonValue>>;
};

// ---------------------------------------------------------------------------
// Provenance.
// ---------------------------------------------------------------------------

/**
 * Where one derived finding came from.
 *
 * Optional by design: attaching provenance to every trivial field would bloat
 * simple outputs for no benefit. Use it for findings a reader may want to trace
 * back -- an extracted risk, a classified item -- and omit it elsewhere.
 */
export type ProvenanceRecord = {
  readonly source: SourceDescriptor;
  /** Repository-relative document path. Never absolute. */
  readonly document?: string;
  /** 1-indexed line, or an inclusive line range. */
  readonly line?: number;
  readonly lineEnd?: number;
  /** GitHub issue or pull-request number, where one applies. */
  readonly itemNumber?: number;
  /** Project Memory snapshot identifier, where one applies. */
  readonly snapshotId?: string;
  /** Which deterministic rule or extractor produced the finding. */
  readonly rule?: string;
  /** Set when the source was truncated or partially omitted by a bound. */
  readonly truncated?: boolean;
};

// ---------------------------------------------------------------------------
// The envelope.
// ---------------------------------------------------------------------------

/**
 * The shared shape at the application boundary, consumed by CLI and MCP.
 *
 * `generatedAt` is supplied by the caller's injected clock, never read from the
 * ambient one here, so a result stays byte-reproducible under a fixed clock.
 */
export type ApplicationResult<TData> = {
  readonly schemaVersion: string;
  /** The use case that produced this result, e.g. `project.brief`. */
  readonly operation: string;
  readonly generatedAt: string;
  readonly source: SourceDescriptor;
  readonly data: TData;
  readonly diagnostics: readonly Diagnostic[];
  readonly provenance: readonly ProvenanceRecord[];
};

/** Build an envelope, defaulting the collections so callers cannot omit them. */
export function applicationResult<TData>(input: {
  operation: string;
  generatedAt: string;
  source: SourceDescriptor;
  data: TData;
  diagnostics?: readonly Diagnostic[];
  provenance?: readonly ProvenanceRecord[];
}): ApplicationResult<TData> {
  return {
    schemaVersion: APPLICATION_RESULT_SCHEMA_VERSION,
    operation: input.operation,
    generatedAt: input.generatedAt,
    source: input.source,
    data: input.data,
    diagnostics: input.diagnostics ?? [],
    provenance: input.provenance ?? [],
  };
}

/**
 * Serialize an envelope with deterministic key order.
 *
 * `JSON.stringify` preserves insertion order, which is stable for
 * `applicationResult` output but NOT for an envelope assembled elsewhere or
 * round-tripped through a parser. Anything serialized into CLI stdout or an MCP
 * structured field goes through here, so byte-identical inputs give
 * byte-identical output regardless of how the object was built.
 */
export function applicationResultToJson<TData>(result: ApplicationResult<TData>): string {
  return JSON.stringify(orderedResult(result));
}

/** The envelope with every key in canonical order, ready to serialize. */
export function orderedResult<TData>(result: ApplicationResult<TData>): Record<string, unknown> {
  return {
    schemaVersion: result.schemaVersion,
    operation: result.operation,
    generatedAt: result.generatedAt,
    source: orderedSource(result.source),
    data: result.data,
    diagnostics: result.diagnostics.map(orderedDiagnostic),
    provenance: result.provenance.map(orderedProvenance),
  };
}

function orderedSource(source: SourceDescriptor): Record<string, unknown> {
  const out: Record<string, unknown> = { kind: source.kind, reference: source.reference };
  if (source.identifier !== undefined) out.identifier = source.identifier;
  if (source.selection !== undefined) {
    // Sort selection keys: a caller may build this object in any order.
    const selection: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(source.selection).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    )) {
      selection[key] = value;
    }
    out.selection = selection;
  }
  return out;
}

function orderedDiagnostic(diagnostic: Diagnostic): Record<string, unknown> {
  const out: Record<string, unknown> = {
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
  };
  if (diagnostic.remediation !== undefined) out.remediation = diagnostic.remediation;
  if (diagnostic.retryable !== undefined) out.retryable = diagnostic.retryable;
  if (diagnostic.source !== undefined) out.source = orderedSource(diagnostic.source);
  if (diagnostic.details !== undefined) {
    const details: Record<string, JsonValue> = {};
    for (const [key, value] of Object.entries(diagnostic.details).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    )) {
      details[key] = value;
    }
    out.details = details;
  }
  return out;
}

function orderedProvenance(record: ProvenanceRecord): Record<string, unknown> {
  const out: Record<string, unknown> = { source: orderedSource(record.source) };
  if (record.document !== undefined) out.document = record.document;
  if (record.line !== undefined) out.line = record.line;
  if (record.lineEnd !== undefined) out.lineEnd = record.lineEnd;
  if (record.itemNumber !== undefined) out.itemNumber = record.itemNumber;
  if (record.snapshotId !== undefined) out.snapshotId = record.snapshotId;
  if (record.rule !== undefined) out.rule = record.rule;
  if (record.truncated !== undefined) out.truncated = record.truncated;
  return out;
}

// ---------------------------------------------------------------------------
// Safety.
// ---------------------------------------------------------------------------

/** Substrings that must never appear in a source descriptor or diagnostic. */
const SECRET_MARKERS = [
  "authorization",
  "bearer ",
  "ghp_",
  "github_pat_",
  "gho_",
  "ghs_",
  "x-access-token",
  "private_token",
];

/**
 * Reasons a value is unsafe to carry in a result, or `null` when it is safe.
 *
 * Exported so the same rule is applied by the application tests, the security
 * tests, and any future surface, rather than being restated per call site.
 */
export function unsafeValueReason(value: string): string | null {
  const lower = value.toLowerCase();
  for (const marker of SECRET_MARKERS) {
    if (lower.includes(marker)) return `contains the secret marker "${marker}"`;
  }
  // A resolved absolute path leaks the machine layout. A caller-supplied
  // relative root is fine, which is why `reference` is documented as unresolved.
  if (value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value)) {
    return "looks like a resolved absolute path";
  }
  return null;
}

/** Throw when a source descriptor carries anything unsafe. */
export function assertSafeSourceDescriptor(source: SourceDescriptor): void {
  const check = (label: string, value: string) => {
    const reason = unsafeValueReason(value);
    if (reason !== null) {
      throw new Error(`unsafe source descriptor: ${label} ${reason}`);
    }
  };
  check("reference", source.reference);
  if (source.identifier !== undefined) check("identifier", source.identifier);
  for (const [key, value] of Object.entries(source.selection ?? {})) {
    if (typeof value === "string") check(`selection.${key}`, value);
  }
}
