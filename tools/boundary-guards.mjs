// Pure boundary guards, extracted so they can be tested against throwaway
// fixtures (audit finding F-09).
//
// tools/validate-boundaries.mjs is a top-level CLI validator: importing it runs
// every check and exits the process, so its rules cannot be exercised directly
// from a test. These two guards are the ones whose failure paths need executable
// evidence, so they live here as pure functions over supplied inputs -- no
// filesystem walk, no git, no process state. The validator imports them and
// keeps its own reporting and exit status.

/**
 * Detect a direct `console` API use in source text.
 *
 * The MCP boundary rule is "production MCP source owns no direct console API".
 * An enumerated method list (console.log, console.error, ...) expresses that
 * intent only for the methods someone remembered: console.trace, console.table,
 * console.dir, console.group, and any method a future runtime adds all write to
 * the same streams, and a write to stdout is exactly what corrupts the JSON-RPC
 * protocol stream. So the match is generic -- `console` followed by a property
 * access or a call -- rather than a list to keep in sync.
 *
 * Matches `console.anything`, `console["anything"]`, and a bare `console` call
 * or reference passed elsewhere. Returns the matched forms in source order.
 */
export function findConsoleUses(source) {
  const found = [];
  // `console` as an identifier -- not a property name (`foo.console`), not a
  // longer identifier (`myconsoleSink`), and not an object-literal key
  // (`{ console: false }`, which declares a property rather than reaching the
  // global). String and comment contents are stripped first, so prose
  // mentioning the word is not a violation.
  const code = stripStringsAndComments(source);
  // Bracket access is matched against the ORIGINAL source: the method name lives
  // inside a string literal, which the stripped copy has blanked out.
  for (const match of source.matchAll(/(?<![\w$.])console\s*\[\s*["'`]([^"'`]+)["'`]\s*\]/g)) {
    found.push({ index: match.index, name: `console.${match[1]}` });
  }
  for (const match of code.matchAll(/(?<![\w$.])console\s*(?:\.\s*([\w$]+))?/g)) {
    if (match[1] !== undefined) {
      found.push({ index: match.index, name: `console.${match[1]}` });
      continue;
    }
    // Bare `console`: a reference handed elsewhere. An object-literal key
    // (`console:`) is a declaration, not a use of the global.
    const after = code.slice(match.index + match[0].length);
    if (/^\s*:/.test(after)) continue;
    // A bracket access was already recorded above with its resolved method.
    if (/^\s*\[/.test(after)) continue;
    found.push({ index: match.index, name: "console" });
  }
  return found.sort((a, b) => a.index - b.index).map((entry) => entry.name);
}

/**
 * Blank out string/template literals and comments, preserving offsets so match
 * positions still line up with the original source. Prose and quoted text are
 * not code, so a mention of `console` inside them is not a console use.
 */
function stripStringsAndComments(source) {
  const out = source.split("");
  const blank = (start, end) => {
    for (let i = start; i < end && i < out.length; i += 1) {
      if (out[i] !== "\n") out[i] = " ";
    }
  };
  let i = 0;
  while (i < source.length) {
    const two = source.slice(i, i + 2);
    if (two === "//") {
      const end = source.indexOf("\n", i);
      blank(i, end === -1 ? source.length : end);
      i = end === -1 ? source.length : end;
      continue;
    }
    if (two === "/*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? source.length : end + 2;
      blank(i, stop);
      i = stop;
      continue;
    }
    const ch = source[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1;
      while (j < source.length) {
        if (source[j] === "\\") {
          j += 2;
          continue;
        }
        if (source[j] === ch) break;
        j += 1;
      }
      blank(i, Math.min(j + 1, source.length));
      i = j + 1;
      continue;
    }
    i += 1;
  }
  return out.join("");
}

/**
 * A direct stdout writer. `process.stdout` covers the write/`.write()` forms;
 * both this and the console ban exist for the same reason, so they are reported
 * by one guard.
 */
export function findStdoutUses(source) {
  return source.includes("process.stdout") ? ["process.stdout"] : [];
}

/**
 * The MCP source invariant: production MCP source owns no direct console API
 * and no direct stdout writer. Returns a message per violation, empty when
 * clean. `file` is used only to label the message.
 */
export function checkMcpStdoutDiscipline(file, source) {
  const failures = [];
  for (const use of findConsoleUses(source)) {
    failures.push(
      `${file} contains a forbidden direct console API "${use}"; ` +
        `production MCP source must not write to the protocol stream`,
    );
  }
  for (const use of findStdoutUses(source)) {
    failures.push(
      `${file} contains a forbidden direct stdout writer "${use}"; ` +
        `the SDK stdio transport owns protocol stdout`,
    );
  }
  return failures;
}

/**
 * The non-stale allowlist invariant.
 *
 * A security allowlist names paths that are exempt from a guard. When a named
 * path stops existing, the entry silently narrows enforcement -- and a file
 * later created at that path starts life pre-allowlisted, having never been
 * reviewed for the exemption it inherits. So an entry that no longer resolves
 * to a tracked repository path is a failure, not a harmless leftover.
 *
 * `entries` are repository-relative POSIX paths; `trackedPaths` is the tracked
 * repository surface. Messages name the guard and the repository-relative path
 * only -- never an absolute host path.
 */
export function checkAllowlistFreshness(guardName, entries, trackedPaths) {
  const tracked = trackedPaths instanceof Set ? trackedPaths : new Set(trackedPaths);
  const failures = [];
  for (const entry of entries) {
    if (!tracked.has(entry)) {
      failures.push(
        `${guardName} allowlists a path that no longer exists in the repository: ${entry}; ` +
          `remove the stale entry or point it at the current path`,
      );
    }
  }
  return failures;
}
