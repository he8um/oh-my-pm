#!/usr/bin/env node
// Reference-regression check for the v0.5 command migration.
//
// The migration is only durable if a deprecated command name cannot quietly
// reappear as the primary one. This scans every tracked text file for legacy
// command *invocations* and fails unless the file is in an explicitly approved
// category.
//
// The hard part is precision. The string "oh-my-pm" legitimately appears all over
// this repository as product identity, and none of those uses are commands:
//
//   - the package scope           @oh-my-pm/cli
//   - the environment prefix      OH_MY_PM_* variables
//   - the Rust/module identifier  oh_my_pm_kernel
//   - the install directory       lib/oh-my-pm/versions/<version>/
//   - the project config file     oh-my-pm.config.json
//   - the release archive         oh-my-pm-v0.5.0.tar.gz
//   - the MCP server key          "oh-my-pm": { ... }
//   - the repository slug         he8um/oh-my-pm
//   - config/data directories     ~/.config/oh-my-pm/providers.json
//
// So this check does not look for the bare product name. It looks for the shapes
// that only a *command invocation* takes: the legacy name followed by a known
// subcommand or flag, a shell/`node` invocation of a legacy entry script, or a
// legacy name used as an installed bin path. That keeps the check strict about
// commands while leaving product identity untouched.
//
// No writes, no network, no environment reads, no clock, no randomness.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { LEGACY_CLI, LEGACY_INSTALLER, LEGACY_MCP, REPO_ROOT } from "./command-surface.mjs";

const errors = [];

// Every tracked or about-to-be-tracked text file, so an unstaged regression is
// caught before it is committed.
const trackedFiles = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard"],
  { cwd: REPO_ROOT, encoding: "utf8" },
)
  .split("\n")
  .filter(Boolean);

const TEXT_EXTENSIONS = /\.(mjs|cjs|js|ts|tsx|json|md|yml|yaml|sh|ps1|cmd|bat|rs|toml)$/;

// ---------------------------------------------------------------------------
// Approved locations.
// ---------------------------------------------------------------------------

/**
 * Files allowed to contain legacy command invocations, each for a stated reason.
 * Anything not listed here must use the canonical commands.
 */
const APPROVED_FILES = new Set([
  // The manifest that defines the aliases in the first place.
  "command-surface.json",

  // Compatibility implementation: the wrappers themselves.
  "cli/bin/oh-my-pm.mjs",
  "mcp-server/bin/oh-my-pm-mcp.mjs",
  "distribution/bin/oh-my-pm.mjs",
  "distribution/bin/oh-my-pm-mcp.mjs",
  "distribution/bin/oh-my-pm-install.mjs",

  // The command-surface machinery and the checks that enforce it. These must
  // name the legacy commands in order to validate and forbid them.
  "tools/command-surface.mjs",
  "tools/validate-command-surface.mjs",
  "tools/validate-command-references.mjs",
  "tools/validate-structure.mjs",
  "tools/validate-boundaries.mjs",

  // Installer, distribution, and release surfaces that intentionally create,
  // verify, or declare the compatibility aliases.
  "cli/src/command-surface.ts",
  "cli/src/mcp-config.ts",
  "tools/local-install-utils.mjs",
  "tools/check-local-install.mjs",
  "tools/check-release-install.mjs",
  "tools/release-bundle-utils.mjs",
  "tools/check-release-bundle.mjs",
  "tools/release-archive-utils.mjs",
  "distribution/libexec/release-install-core.mjs",

  // Migration documentation and v0.5 release material, which must show users
  // what the old commands were.
  //
  // getting-started is active documentation whose *instructions* all use the
  // canonical commands; it names the aliases only where it must be concrete about
  // installed state -- the shim inventory the installer creates and the file list
  // to remove on uninstall. A reader following it is never told to run a
  // deprecated command.
  "docs/getting-started.md",
  "docs/v0.5/README.md",
  "docs/releases/v0.5.0.md",
  "docs/releases/publishing-v0.5.0.md",
  "CHANGELOG.md",

  // The active CI and release workflows test the aliases explicitly.
  ".github/workflows/ci.yml",
  ".github/workflows/release-v0.5.yml",

  // The distribution package is the one manifest that intentionally maps both
  // command families to their entrypoints. validate-command-surface.mjs asserts
  // the exact shape, including that canonical entries come first.
  "distribution/package.json",

  // Installer *fixture payload* data. These strings are example archive members
  // in dry-run planning inputs -- arbitrary file names in sample data, not
  // command invocations. Renaming them would change fixture content without
  // changing any command.
  "cli/src/install-preview.ts",
  "installer/src/fixtures.ts",
  "examples/src/installer.ts",
]);

/** Directory prefixes whose contents are approved wholesale, with reasons. */
const APPROVED_PREFIXES = [
  // Compatibility and migration tests must exercise the legacy names.
  { prefix: "cli/test/", reason: "compatibility tests" },
  { prefix: "mcp-server/test/", reason: "compatibility tests" },
  { prefix: "tools/test/", reason: "compatibility tests" },
  // Tool tests also live beside their tool as tools/<name>.test.mjs; these
  // exercise both command families against real bundles and prefixes.
  { prefix: "tools/check-release-install.test.mjs", reason: "compatibility tests" },
  { prefix: "tools/check-release-archives.test.mjs", reason: "compatibility tests" },
  { prefix: "tools/check-release-archive-reproducibility.test.mjs", reason: "compatibility tests" },
  { prefix: "tools/build-release-archives.test.mjs", reason: "compatibility tests" },
  { prefix: "tools/install-release-bundle.test.mjs", reason: "compatibility tests" },
  { prefix: "tools/release-archive-utils.test.mjs", reason: "compatibility tests" },
  { prefix: "tools/release-install-e2e.test.mjs", reason: "compatibility tests" },
  { prefix: "distribution/libexec/release-install-core.test.mjs", reason: "compatibility tests" },
  { prefix: "installer/test/", reason: "installer fixtures and tests" },
  { prefix: "examples/test/", reason: "example tests" },
  { prefix: "project-memory/test/", reason: "persistence tests" },
  { prefix: "providers/test/", reason: "provider tests" },

  // Historical release material stays historically accurate: a v0.1-v0.4 release
  // note describing the commands that release actually shipped is correct as
  // written and is never modernized.
  { prefix: "docs/releases/v0.1", reason: "historical release content" },
  { prefix: "docs/releases/v0.2", reason: "historical release content" },
  { prefix: "docs/releases/v0.3", reason: "historical release content" },
  { prefix: "docs/releases/v0.4", reason: "historical release content" },
  { prefix: "docs/releases/publishing-v0.1", reason: "historical release content" },
  { prefix: "docs/releases/publishing-v0.2", reason: "historical release content" },
  { prefix: "docs/releases/publishing-v0.3", reason: "historical release content" },
  { prefix: "docs/releases/publishing-v0.4", reason: "historical release content" },
  { prefix: "docs/v0.3/", reason: "historical version documentation" },
  { prefix: "docs/v0.4/", reason: "historical version documentation" },
  { prefix: "docs/architecture/", reason: "historical architecture audits" },

  // Published release workflows are never rewritten.
  { prefix: ".github/workflows/release-v0.1", reason: "published release workflow" },
  { prefix: ".github/workflows/release-v0.2", reason: "published release workflow" },
  { prefix: ".github/workflows/release-v0.3", reason: "published release workflow" },
  { prefix: ".github/workflows/release-v0.4", reason: "published release workflow" },
  { prefix: ".github/workflows/v0.4-", reason: "published qualification workflow" },

  // Fixture project content is sample user data, not an instruction.
  { prefix: "examples/fixtures/", reason: "sample project fixture" },
];

function isApproved(file) {
  if (APPROVED_FILES.has(file)) return true;
  return APPROVED_PREFIXES.some((entry) => file.startsWith(entry.prefix));
}

// ---------------------------------------------------------------------------
// Invocation patterns.
// ---------------------------------------------------------------------------

// The CLI subcommands and flags that make a preceding token unambiguously a
// command invocation rather than a product name.
const CLI_SUBCOMMANDS = [
  "status",
  "doctor",
  "plan",
  "brief",
  "risks",
  "next",
  "handoff",
  "github",
  "providers",
  "memory",
  "mcp-config",
  "install-preview",
  // A usage line such as `oh-my-pm <command> [options]` is an invocation too.
  "<command>",
  "<namespace>",
  // Any long or short flag. The installer takes --prefix/--apply/--force, which
  // no product-identity usage is ever followed by, so a generic flag shape is
  // both safe and necessary here.
  "--[a-z][a-z-]*",
  "-h\\b",
];

/** Escape a string for literal use inside a RegExp. */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The invocation patterns for one legacy command name. Each is a shape that only
 * a command invocation produces, never a package scope, path segment,
 * environment variable, config filename, archive name, or server key.
 */
function invocationPatterns(name) {
  const n = escapeRegExp(name);
  // A legacy name must not be preceded by a character that would make it part of
  // a scope (@), a path (/ or \), an identifier (word char), or a longer name
  // (- or .). This is what keeps `@oh-my-pm/cli`, `lib/oh-my-pm/`, and
  // `oh-my-pm.config.json` out of the results.
  const boundary = `(?<![\\w@./\\\\-])`;
  const patterns = [];

  // 1. `<legacy> <subcommand-or-flag>` — a direct invocation. Entries already
  //    containing regex syntax (the generic flag shapes) are used verbatim;
  //    plain words are escaped.
  const subcommands = CLI_SUBCOMMANDS.map((entry) =>
    /[\[\]\\]/.test(entry) ? entry : escapeRegExp(entry),
  ).join("|");
  patterns.push({
    re: new RegExp(`${boundary}${n}\\s+(?:${subcommands})(?![\\w-])`, "g"),
    kind: "invocation",
  });

  // 2. `node .../<legacy>.mjs` or a bare `<legacy>.mjs` entry-script reference.
  patterns.push({
    re: new RegExp(`${escapeRegExp(name)}\\.mjs`, "g"),
    kind: "entry script",
  });

  // 3. An installed bin path: `<prefix>/bin/<legacy>` or `bin\\<legacy>`, and the
  //    Windows `.cmd` shim.
  patterns.push({
    re: new RegExp(`bin[/\\\\]${n}(?:\\.cmd)?(?![\\w./\\\\-])`, "g"),
    kind: "installed bin path",
  });

  // 4. A bare command on its own line inside a fenced shell block, e.g. a
  //    documentation snippet that is just `oh-my-pm-mcp`.
  patterns.push({
    re: new RegExp(`^\\s*${n}\\s*$`, "gm"),
    kind: "bare command line",
  });

  return patterns;
}

const LEGACY_NAMES = [...LEGACY_CLI, ...LEGACY_MCP, ...LEGACY_INSTALLER];

// ---------------------------------------------------------------------------
// Scan.
// ---------------------------------------------------------------------------

for (const file of trackedFiles) {
  if (!TEXT_EXTENSIONS.test(file)) continue;
  if (isApproved(file)) continue;

  let contents;
  try {
    contents = readFileSync(join(REPO_ROOT, file), "utf8");
  } catch {
    continue;
  }
  if (!LEGACY_NAMES.some((name) => contents.includes(name))) continue;

  for (const name of LEGACY_NAMES) {
    for (const { re, kind } of invocationPatterns(name)) {
      const match = re.exec(contents);
      if (match === null) continue;
      // Report the line number so a regression is easy to locate.
      const line = contents.slice(0, match.index).split("\n").length;
      errors.push(
        `${file}:${line}: legacy command ${kind} "${match[0].trim()}" — use the canonical command`,
      );
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Report.
// ---------------------------------------------------------------------------

if (errors.length > 0) {
  for (const message of errors) {
    process.stderr.write(`validate-command-references: ${message}\n`);
  }
  process.stderr.write(
    "validate-command-references: FAILED\n" +
      "A deprecated command name may appear only in a compatibility wrapper, a\n" +
      "compatibility test, migration documentation, v0.5 release notes, historical\n" +
      "release content, or the command-surface manifest.\n",
  );
  process.exitCode = 1;
} else {
  process.stdout.write(
    `validate-command-references: OK (${trackedFiles.length} tracked files scanned)\n`,
  );
}
