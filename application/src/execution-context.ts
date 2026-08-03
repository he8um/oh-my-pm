// The presentation-neutral execution context.
//
// Why this exists
// ---------------
// `ApplicationResult<T>` carries a `generatedAt` that must come from an injected
// clock, never an ambient one, so a result stays byte-reproducible. Before this
// type there was no shared way to pass that clock, and the two surfaces had each
// grown their own fixed-time constant -- `LOCAL_FIXED_NOW` in the CLI and
// `LOCAL_WORKFLOW_FIXED_NOW` in the application -- holding the same value for
// the same reason. That is the seam this context owns.
//
// Deliberately minimal. It carries what a use case genuinely needs and nothing
// else:
//
//   * `operationId` -- correlates the diagnostics of one invocation;
//   * `now` -- the injected clock behind every `generatedAt`;
//   * `signal` -- optional cooperative cancellation, for remote or long-running
//     work only.
//
// A logger and a redactor were considered and deliberately left out. Neither has
// a consumer today: sanitization already happens where a result is constructed
// (see `unsafeValueReason` and `assertSafeSourceDescriptor` in result.ts), and
// no use case logs. Declaring them now would add public surface that nothing
// implements and that a future contributor would have to keep working. Add
// either one when a verified consumer exists, not before.
//
// What this type must never carry, because it is consumed by every surface:
// a process object, an environment map, a stream, a terminal concept, an MCP
// concept, or a browser concept. Those belong at the composition root.

/**
 * Cross-surface execution context for an application use case.
 *
 * Pure data plus one clock function. No filesystem, environment, network, or
 * randomness reaches a use case through here.
 */
export type ExecutionContext = {
  /**
   * Stable identifier for one invocation.
   *
   * Correlates the diagnostics emitted by a single call. Supplied by the
   * caller, because only the composition root knows what an "operation" means
   * on its surface -- a CLI process, one MCP tool call, one test.
   */
  readonly operationId: string;

  /**
   * The injected clock.
   *
   * Every `generatedAt` in an `ApplicationResult` comes from here. A use case
   * must not call `Date.now()` or `new Date()` itself; doing so would make its
   * output unreproducible and break the golden baseline.
   */
  readonly now: () => Date;

  /**
   * Optional cooperative cancellation.
   *
   * Present only for genuinely long-running or remote work -- GitHub pagination
   * is the case this release supports. Bounded local Markdown reads do not take
   * a signal: adding cancellation machinery to a fast, finite filesystem walk
   * would be unused complexity, so the local workflows deliberately ignore it.
   */
  readonly signal?: AbortSignal;
};

/**
 * The fixed instant used by the deterministic offline pipelines.
 *
 * Single definition of the value that `LOCAL_FIXED_NOW` and
 * `LOCAL_WORKFLOW_FIXED_NOW` previously stated separately. Local workflows are
 * offline and deterministic by contract, so they run on this instant rather
 * than a real clock and repeated runs over unchanged documents stay
 * byte-identical.
 */
export const FIXED_LOCAL_INSTANT = "2026-01-01T00:00:00.000Z";

/**
 * A context pinned to the fixed local instant.
 *
 * The default for the deterministic local pipeline and for tests that assert on
 * exact output. `operationId` is caller-supplied so two concurrent invocations
 * stay distinguishable even though their timestamps match.
 */
export function fixedExecutionContext(operationId: string): ExecutionContext {
  const instant = new Date(FIXED_LOCAL_INSTANT);
  return {
    operationId,
    // A fresh Date per call: returning one shared instance would let a caller
    // mutate the context's clock through the object it received.
    now: () => new Date(instant.getTime()),
  };
}

/**
 * A context reading a real clock, for surfaces that need a true timestamp.
 *
 * The clock is passed in rather than captured here so this module stays free of
 * ambient time and the boundary validator's no-clock rule holds: the process
 * adapter supplies `Date`, tests supply a stub.
 */
export function executionContext(input: {
  operationId: string;
  now: () => Date;
  signal?: AbortSignal;
}): ExecutionContext {
  return {
    operationId: input.operationId,
    now: input.now,
    ...(input.signal !== undefined ? { signal: input.signal } : {}),
  };
}

/**
 * The ISO-8601 string for a context's current instant.
 *
 * Every `generatedAt` goes through here so the format is stated once rather
 * than at each construction site.
 */
export function generatedAt(context: ExecutionContext): string {
  return context.now().toISOString();
}

/**
 * Whether the caller has cancelled, read at the moment of the call.
 *
 * A function rather than an inline `context.signal?.aborted === true` test, for
 * a reason that is easy to lose: `AbortSignal.aborted` is typed `readonly
 * boolean`, so once a use case has tested it and continued, control-flow
 * narrowing carries `false` forward across every later read -- including one
 * after an `await`, where the value genuinely can have flipped. TypeScript then
 * reports the second check as an impossible comparison.
 *
 * Routing every read through an opaque call keeps each one honest.
 */
export function isCancelled(context: ExecutionContext | undefined): boolean {
  return context?.signal?.aborted === true;
}

/**
 * Throw the standard cancellation error when a context has been aborted.
 *
 * For call sites that propagate cancellation as an exception. A use case that
 * owns a structured result should prefer `isCancelled` and return its own
 * controlled failure, so cancellation stays inside the result contract instead
 * of unwinding through it.
 */
export function throwIfCancelled(context: ExecutionContext): void {
  if (isCancelled(context)) {
    throw new OperationCancelledError(context.operationId);
  }
}

/** Raised when a caller cancels an operation through its context signal. */
export class OperationCancelledError extends Error {
  readonly operationId: string;

  constructor(operationId: string) {
    super("operation was cancelled");
    this.name = "OperationCancelledError";
    this.operationId = operationId;
  }
}
