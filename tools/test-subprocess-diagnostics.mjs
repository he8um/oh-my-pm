// Shared assertion message builder for subprocess-driven test fixtures.
//
// Several beforeAll hooks asserted only on `.status`, discarding stderr, so a CI
// failure surfaced as "expected 1 to be +0" with the real reason thrown away.
// This renders a bounded, path-safe diagnostic instead.
//
// It formats a message only -- it never swallows a failure and never alters the
// underlying exit status.

/** Maximum characters kept from each captured stream. */
const STREAM_LIMIT = 4000;

/** Trim a stream to a bounded tail, noting how much was dropped. */
function boundStream(value) {
  if (typeof value !== "string" || value === "") return "(empty)";
  if (value.length <= STREAM_LIMIT) return value;
  const dropped = value.length - STREAM_LIMIT;
  return `... [${dropped} earlier characters omitted]\n${value.slice(-STREAM_LIMIT)}`;
}

/**
 * Build a diagnostic message for a spawnSync-style result.
 *
 * Includes the command, arguments, exit status, signal, spawn error code, and
 * bounded stdout/stderr. Environment values are never included, and stream
 * output is bounded so a runaway process cannot flood the log.
 */
export function describeSubprocessResult(command, args, result) {
  const argv = Array.isArray(args) ? args.join(" ") : "";
  return [
    `command: ${command}${argv === "" ? "" : ` ${argv}`}`,
    `status: ${result?.status ?? "none"}`,
    `signal: ${result?.signal ?? "none"}`,
    `spawn error: ${result?.error?.code ?? result?.error?.message ?? "none"}`,
    `stdout:\n${boundStream(result?.stdout)}`,
    `stderr:\n${boundStream(result?.stderr)}`,
  ].join("\n");
}
