#!/usr/bin/env node
// Read-only application-boundary ownership check.
//
// Two claims about the boundary must stay true together, and they pull in
// opposite directions:
//
//   1. The four SHARED project workflows (brief/risks/next/handoff) reach the
//      application boundary from BOTH presentation surfaces. If the CLI or the
//      MCP server composes its own Runtime for them, the surfaces can drift and
//      the shared use case stops being shared -- the duplicated-composition gap
//      v0.6.1 closes.
//
//   2. `status`, `doctor`, and `plan` are deliberately NOT application-owned.
//      They are runtime-identity and free-form planning commands with exactly
//      one presentation consumer, and forcing them through the boundary would
//      buy diagrammatic symmetry and no reuse. That asymmetry is declared in
//      packages.json and must not be quietly "fixed" by a later contributor.
//
// Enforcing only the first claim would invite over-migration; enforcing only
// the second would let the shared four drift back into the CLI. This validator
// asserts both, so neither can be violated without a failing check.
//
// It also verifies that the packages.json $asymmetryComment still DESCRIBES the
// code. That prose asserted the shared four already went through the boundary
// on both surfaces while cli/src/local-process.ts still composed its own
// Runtime for them -- documentation drift that a reader would reasonably have
// trusted. Prose that makes a checkable claim is checked here.
//
// No writes, no network, no environment reads, no clock, no randomness.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./command-surface.mjs";

const errors = [];
const err = (message) => errors.push(message);

const read = (relativePath) => readFileSync(join(REPO_ROOT, relativePath), "utf8");

/** The workflows both surfaces genuinely share. */
const SHARED_WORKFLOWS = Object.freeze(["brief", "risks", "next", "handoff"]);

/** The commands that are intentionally outside the application boundary. */
const CLI_ONLY_COMMANDS = Object.freeze(["status", "doctor", "plan"]);

// ---------------------------------------------------------------------------
// 1. Both presentation surfaces route the shared workflows through application.
// ---------------------------------------------------------------------------

const cliLocal = read("cli/src/local-process.ts");
const cliGitHub = read("cli/src/github-process.ts");
const mcpProject = read("mcp-server/src/project-tool-runner.ts");
const mcpGitHub = read("mcp-server/src/github-tool-runner.ts");

const SURFACES = [
  { label: "cli/src/local-process.ts", source: cliLocal, useCase: "runLocalProjectWorkflow" },
  { label: "cli/src/github-process.ts", source: cliGitHub, useCase: "runGitHubProjectWorkflow" },
  {
    label: "mcp-server/src/project-tool-runner.ts",
    source: mcpProject,
    useCase: "runLocalProjectWorkflow",
  },
  {
    label: "mcp-server/src/github-tool-runner.ts",
    source: mcpGitHub,
    useCase: "runGitHubProjectWorkflow",
  },
];

for (const surface of SURFACES) {
  if (!surface.source.includes(surface.useCase)) {
    err(
      `${surface.label} does not call ${surface.useCase}: the shared project ` +
        `workflows must reach the application boundary from every surface, not be ` +
        `re-composed per surface`,
    );
  }
}

// ---------------------------------------------------------------------------
// 2. The CLI composes a Runtime only for the intentionally CLI-only commands.
// ---------------------------------------------------------------------------

// The CLI legitimately builds a local Runtime for status/doctor/plan. What it
// must NOT do is route the shared four into that composition. The command set
// that reaches the local Runtime is named in the source; if a shared workflow
// appears in it, the duplication has returned.
const runtimeCommandSet = /const\s+PROJECT_COMMANDS[^=]*=\s*new Set\(\[([^\]]*)\]\)/u.exec(
  cliLocal,
);

if (runtimeCommandSet === null) {
  // Absence is the expected end state once the shared four no longer route
  // through the CLI's own Runtime, so this is informational rather than a
  // failure. The positive check above already proves the use case is called.
} else {
  const listed = [...runtimeCommandSet[1].matchAll(/"([^"]+)"/gu)].map((match) => match[1]);
  for (const workflow of SHARED_WORKFLOWS) {
    if (listed.includes(workflow)) {
      err(
        `cli/src/local-process.ts routes the shared workflow "${workflow}" into its own ` +
          `Runtime composition (PROJECT_COMMANDS). Shared workflows must go through ` +
          `runLocalProjectWorkflow so the CLI and MCP cannot drift`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 3. The intentionally CLI-only commands stay CLI-only.
// ---------------------------------------------------------------------------

// Anchored to the MCP operation type declarations rather than to raw source
// text. Scanning the runners for a quoted command name false-positives on
// ordinary payload access such as `data["status"]`, which reads a GitHub field
// and registers nothing. The operation unions in types.ts are the actual
// surface: a CLI-only command becomes MCP-visible only by appearing there.
const mcpTypes = read("mcp-server/src/types.ts");
const OPERATION_UNIONS = [
  { name: "McpProjectOperation", pattern: /export type McpProjectOperation\s*=([^;]+);/u },
  { name: "McpGitHubOperation", pattern: /export type McpGitHubOperation\s*=([^;]+);/u },
];

for (const union of OPERATION_UNIONS) {
  const match = union.pattern.exec(mcpTypes);
  if (match === null) {
    err(`mcp-server/src/types.ts no longer declares ${union.name}; the boundary check cannot run`);
    continue;
  }
  const members = [...match[1].matchAll(/"([^"]+)"/gu)].map((entry) => entry[1]);

  for (const command of CLI_ONLY_COMMANDS) {
    if (members.includes(command)) {
      err(
        `${union.name} includes "${command}", but status/doctor/plan are intentionally ` +
          `CLI-only. Exposing one through MCP makes it a shared workflow, and it must ` +
          `then go through the application boundary`,
      );
    }
  }

  // The union must also still cover the shared four: silently dropping one
  // would remove a tool from the public MCP surface.
  for (const workflow of SHARED_WORKFLOWS) {
    if (!members.includes(workflow)) {
      err(`${union.name} no longer includes the shared workflow "${workflow}"`);
    }
  }
}

// ---------------------------------------------------------------------------
// 4. The declared asymmetry rationale still matches the code.
// ---------------------------------------------------------------------------

const packagesManifest = JSON.parse(read("packages.json"));
const cliPackage = packagesManifest.packages.find((entry) => entry.name === "@oh-my-pm/cli");

if (cliPackage === undefined) {
  err("packages.json has no @oh-my-pm/cli entry");
} else if (!Array.isArray(cliPackage.$asymmetryComment)) {
  err(
    "packages.json @oh-my-pm/cli must keep a $asymmetryComment explaining why " +
      "status/doctor/plan are outside the application boundary",
  );
} else {
  const prose = cliPackage.$asymmetryComment.join(" ");
  for (const command of CLI_ONLY_COMMANDS) {
    if (!prose.includes(command)) {
      err(
        `packages.json @oh-my-pm/cli $asymmetryComment no longer names "${command}"; ` +
          `the documented asymmetry must list every intentionally CLI-only command`,
      );
    }
  }
  // The prose claims the shared four go through the boundary on both surfaces.
  // Check 1 above is what makes that claim true; this keeps the two in step.
  if (!/SHARED/u.test(prose)) {
    err(
      "packages.json @oh-my-pm/cli $asymmetryComment must distinguish the SHARED " +
        "project workflows from the CLI-only commands",
    );
  }
}

// ---------------------------------------------------------------------------
// 5. No surface may claim every CLI workflow is application-owned.
// ---------------------------------------------------------------------------

// Guards the specific documentation failure this validator exists to prevent:
// a blanket statement that all CLI commands are application-owned, which would
// be false while status/doctor/plan remain deliberately outside.
const OVERCLAIM_PATTERNS = [
  /all CLI (?:commands|workflows) (?:are|go) (?:through )?application/iu,
  /every CLI (?:command|workflow) (?:is|goes) (?:through )?(?:the )?application/iu,
];
const DOC_FILES = ["packages.json", "cli/src/local-process.ts", "application/src/index.ts"];
for (const file of DOC_FILES) {
  const contents = read(file);
  for (const pattern of OVERCLAIM_PATTERNS) {
    if (pattern.test(contents)) {
      err(
        `${file} claims every CLI workflow is application-owned, but status/doctor/plan ` +
          `are intentionally outside the boundary`,
      );
    }
  }
}

// ---------------------------------------------------------------------------

if (errors.length > 0) {
  for (const message of errors) console.error(`FAIL: ${message}`);
  console.error(`validate-application-boundary: ${errors.length} problem(s)`);
  process.exit(1);
}

console.log(
  `validate-application-boundary: OK (${SHARED_WORKFLOWS.length} shared workflows on ` +
    `${SURFACES.length} surface bindings, ${CLI_ONLY_COMMANDS.length} intentionally CLI-only)`,
);
