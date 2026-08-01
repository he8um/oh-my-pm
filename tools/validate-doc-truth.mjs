#!/usr/bin/env node
// Active-document truth validator.
//
// Documentation drifts silently: nothing breaks when a README keeps claiming an
// old version or a tool count that shipped three releases ago. This validator
// makes a materially false CURRENT-STATE claim fail the build.
//
// Every expectation is DERIVED from a canonical source, never restated here:
//
//   version.json                      the source version
//   command-surface.json              the canonical and deprecated command names
//   mcp-server/src/server.ts          the registered MCP tools, in order
//   application/src/memory-types.ts   the memory subcommands
//   */package.json                    private/version/type facts
//
// So this file adds no second source of truth: if the product changes, the
// derived expectation changes with it and the documentation must follow.
//
// HISTORICAL documents are excluded. docs/releases/**, docs/v0.3/**, the v0.2
// stabilization audit, and superseded CHANGELOG entries are point-in-time
// records; their old versions and tool counts were true when written and must
// stay that way. Only documents that describe the system AS IT IS NOW are
// checked.
//
// Read-only: no writes, no network, no environment reads.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  CANONICAL_CLI,
  CANONICAL_INSTALLER,
  CANONICAL_MCP,
  LEGACY_CLI,
  REPO_ROOT,
} from "./command-surface.mjs";

let fail = false;
const err = (msg) => {
  console.error(`FAIL: ${msg}`);
  fail = true;
};

const read = (rel) => {
  const path = join(REPO_ROOT, rel);
  return existsSync(path) ? readFileSync(path, "utf8") : null;
};

// ---------------------------------------------------------------------------
// Derived facts.
// ---------------------------------------------------------------------------

const VERSION = JSON.parse(read("version.json")).version;

// CANONICAL_CLI / CANONICAL_MCP / CANONICAL_INSTALLER / LEGACY_CLI come from
// tools/command-surface.mjs, the existing loader over command-surface.json.

/**
 * The MCP tools actually registered, in registration order.
 *
 * Derived from the server source rather than a restated list. Two shapes are
 * registered: a direct `registerTool("name", ...)` call, and a loop over a
 * descriptor array whose entries carry `name: "github_project_*"`. Both are
 * matched in source order, which is registration order.
 */
function registeredMcpTools() {
  const server = read("mcp-server/src/server.ts");
  if (server === null) return [];
  const names = [];
  const pattern =
    /server\.registerTool\(\s*"([a-z_]+)"|server\.registerTool\(\s*tool\.name|^\s*name:\s*"(github_project_[a-z]+)"/gm;
  const loopNames = [];
  for (const match of server.matchAll(pattern)) {
    if (match[1] !== undefined) {
      names.push({ index: match.index, name: match[1] });
    } else if (match[2] !== undefined) {
      loopNames.push(match[2]);
    } else {
      // The loop registration site: expands to the descriptor names in order.
      names.push({ index: match.index, loop: true });
    }
  }
  const out = [];
  for (const entry of names) {
    if (entry.loop) out.push(...loopNames);
    else out.push(entry.name);
  }
  return out;
}
const MCP_TOOLS = registeredMcpTools();

/** The memory subcommands, from the closed allowlist constant. */
function memorySubcommands() {
  const source = read("application/src/memory-types.ts");
  if (source === null) return [];
  const block = source.match(
    /MEMORY_SUBCOMMANDS:\s*readonly MemorySubcommand\[\]\s*=\s*\[([\s\S]*?)\]/,
  );
  if (block === null) return [];
  return [...block[1].matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
}
const MEMORY_SUBCOMMANDS = memorySubcommands();

// Number words used in prose, so "twelve read-only tools" can be checked.
const NUMBER_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
];
const toolWord = NUMBER_WORDS[MCP_TOOLS.length] ?? String(MCP_TOOLS.length);
const memoryWord = NUMBER_WORDS[MEMORY_SUBCOMMANDS.length] ?? String(MEMORY_SUBCOMMANDS.length);

// ---------------------------------------------------------------------------
// Document classification.
// ---------------------------------------------------------------------------

/**
 * Historical documents are point-in-time records. They are never checked for
 * current-state claims, and they must not be rewritten to match today.
 */
const HISTORICAL_PREFIXES = [
  "docs/releases/",
  "docs/v0.3/",
  "docs/v0.4/",
  "docs/architecture/",
  "_dev/",
];
const isHistorical = (rel) => HISTORICAL_PREFIXES.some((p) => rel.startsWith(p));

/** Active documents whose current-state claims are checked. */
const ACTIVE_DOCS = [
  "README.md",
  "ROADMAP.md",
  "CONTRIBUTING.md",
  "docs/architecture.md",
  "docs/roadmap.md",
  "docs/getting-started.md",
  "docs/security-model.md",
  "docs/v0.5/README.md",
  "docs/v0.5/v0.5.1-scope.md",
  "docs/v0.5/application-boundary.md",
  "application/README.md",
  "cli/README.md",
  "mcp-server/README.md",
  "runtime/README.md",
  "project-memory/README.md",
  "installer/README.md",
  "distribution/README.md",
];

/**
 * Active documents that deliberately QUOTE stale claims in order to record what
 * was corrected. They are exempt from the unbuilt-claim scan (they are about
 * those claims) but remain subject to every other check.
 */
const QUOTES_STALE_CLAIMS = new Set(["docs/v0.5/v0.5.1-scope.md", "docs/releases/v0.5.1.md"]);

/** Active documentation that describes the MCP tool surface. */
const MCP_SURFACE_DOCS = [
  "README.md",
  "docs/getting-started.md",
  "mcp-server/README.md",
  "cli/README.md",
];

// ---------------------------------------------------------------------------
// 1. The source version is stated correctly wherever it is stated.
// ---------------------------------------------------------------------------

{
  const readme = read("README.md");
  if (readme === null) {
    err("README.md is missing");
  } else if (!readme.includes(VERSION)) {
    err(`README.md must state the current source version ${VERSION} (from version.json)`);
  }

  // An active document must never present a SUPERSEDED version as the current
  // source line. Historical mentions are fine when explicitly labelled.
  const supersededClaims = [
    /current source(?: version)? is\s+`?(\d+\.\d+\.\d+)`?/gi,
    /repository build of the\s+`?(\d+\.\d+\.\d+)`?\s+source line/gi,
    /the source version is\s+`?(\d+\.\d+\.\d+)`?/gi,
  ];
  for (const rel of ACTIVE_DOCS) {
    const text = read(rel);
    if (text === null || QUOTES_STALE_CLAIMS.has(rel)) continue;
    for (const pattern of supersededClaims) {
      for (const match of text.matchAll(pattern)) {
        if (match[1] !== VERSION) {
          err(`${rel}: claims source version ${match[1]}, but version.json says ${VERSION}`);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Canonical command examples use the canonical CLI command.
// ---------------------------------------------------------------------------

{
  const readme = read("README.md");
  if (readme !== null && !readme.includes(CANONICAL_CLI)) {
    err(`README.md must document the canonical command "${CANONICAL_CLI}"`);
  }
  for (const command of [CANONICAL_CLI, CANONICAL_MCP, CANONICAL_INSTALLER]) {
    if (readme !== null && !readme.includes(command)) {
      err(`README.md must name the canonical command "${command}"`);
    }
  }
  // A deprecated alias must never be presented as the command to type in an
  // active shell example. It may still be named as a compatibility alias.
  const aliasExample = new RegExp(`^\\s*\\$?\\s*(${LEGACY_CLI.join("|")})\\s`, "m");
  for (const rel of ACTIVE_DOCS) {
    const text = read(rel);
    if (text === null) continue;
    for (const block of text.matchAll(/^```(?:bash|sh|console)\n([\s\S]*?)^```/gm)) {
      // A block that shows the deprecation warning is DOCUMENTING the alias
      // behavior, not recommending the alias. That is the one legitimate reason
      // to type a deprecated name in an example.
      if (/deprecated compatibility alias/i.test(block[1])) continue;
      if (aliasExample.test(block[1])) {
        err(
          `${rel}: a shell example invokes a deprecated alias; use "${CANONICAL_CLI}" ` +
            `(aliases may be named as compatibility, never demonstrated)`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 3. The MCP surface is described with the real tool count and tool names.
// ---------------------------------------------------------------------------

{
  if (MCP_TOOLS.length === 0) {
    err("could not derive the MCP tool list from mcp-server/src/server.ts");
  }

  // A stale count in an active document is the most common MCP drift.
  const staleCounts = NUMBER_WORDS.slice(1)
    .filter((w) => w !== toolWord)
    .map((w) => ({
      word: w,
      // "the first ten tools" / "the exact ten" describe the conditional
      // registration fallback, which is real. Only an unqualified count claim
      // about the surface is drift.
      pattern: new RegExp(`(?<!first )(?<!exact )\\b${w}\\b[- ](?:read-only )?tools?\\b`, "i"),
    }));

  for (const rel of MCP_SURFACE_DOCS) {
    const text = read(rel);
    if (text === null) continue;
    for (const { word, pattern } of staleCounts) {
      const match = text.match(pattern);
      if (match !== null) {
        err(
          `${rel}: claims "${match[0]}", but ${MCP_TOOLS.length} tools are registered ` +
            `(say "${toolWord}"); found the stale word "${word}"`,
        );
      }
    }
    const numeric = text.match(/\b(\d+)[- ](?:read-only )?tools?\b/i);
    if (numeric !== null && Number(numeric[1]) !== MCP_TOOLS.length) {
      err(`${rel}: claims "${numeric[0]}", but ${MCP_TOOLS.length} tools are registered`);
    }
  }

  // The per-package MCP reference must list every registered tool by name.
  const mcpReadme = read("mcp-server/README.md");
  if (mcpReadme === null) {
    err("mcp-server/README.md is missing");
  } else {
    for (const tool of MCP_TOOLS) {
      if (!mcpReadme.includes(tool)) {
        err(`mcp-server/README.md must document the registered tool "${tool}"`);
      }
    }
    if (!/\b0\b|\bzero\b/i.test(mcpReadme) || !/write tool/i.test(mcpReadme)) {
      err("mcp-server/README.md must state that there are zero write tools");
    }
  }

  // project_timeline is the tool most often missing from documentation.
  for (const rel of MCP_SURFACE_DOCS) {
    const text = read(rel);
    if (text === null) continue;
    if (text.includes("project_changes") && !text.includes("project_timeline")) {
      err(`${rel}: lists project_changes but omits project_timeline`);
    }
  }
}

// ---------------------------------------------------------------------------
// 4. The memory subcommand surface is described completely.
// ---------------------------------------------------------------------------

{
  if (MEMORY_SUBCOMMANDS.length === 0) {
    err("could not derive the memory subcommands from application/src/memory-types.ts");
  }
  const cliReadme = read("cli/README.md");
  if (cliReadme !== null) {
    for (const sub of MEMORY_SUBCOMMANDS) {
      if (!new RegExp(`\\b${sub}\\b`).test(cliReadme)) {
        err(`cli/README.md must document the memory subcommand "${sub}"`);
      }
    }
  }
  const readme = read("README.md");
  if (readme !== null && /\bmemory subcommands?\b/i.test(readme)) {
    const claim = readme.match(/\b(\w+)[- ]memory subcommands?\b/i);
    if (claim !== null) {
      const word = claim[1].toLowerCase();
      const asNumber = NUMBER_WORDS.indexOf(word) >= 0 ? NUMBER_WORDS.indexOf(word) : Number(word);
      if (Number.isFinite(asNumber) && asNumber !== MEMORY_SUBCOMMANDS.length) {
        err(
          `README.md: claims "${claim[0]}", but ${MEMORY_SUBCOMMANDS.length} ` +
            `subcommands exist (say "${memoryWord}")`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 5. Active documentation does not describe the shipped system as unbuilt.
// ---------------------------------------------------------------------------

{
  // Phrases that assert the product does not exist yet. Each is a claim the
  // repository disproved several releases ago.
  const UNBUILT_CLAIMS = [
    { pattern: /\bis only a scaffold\b/i, why: "the system is implemented" },
    {
      pattern: /\brepository scaffold and shared contracts foundation\b/i,
      why: "shipped in v0.1.0",
    },
    {
      pattern: /\bThe (?:planned|intended) architecture\b/i,
      why: "the architecture is implemented",
    },
    { pattern: /\bNothing invokes it yet\b/i, why: "it backs shipped CLI and MCP surfaces" },
    { pattern: /\bno CLI or MCP surface\s+invokes\b/i, why: "both surfaces invoke it" },
    { pattern: /\bdoes not write files, read files\b/i, why: "the installer performs real writes" },
    { pattern: /\bwill be added\b.*\bin a later phase\b/i, why: "it shipped" },
    { pattern: /\bonce the scaffold is in place\b/i, why: "the scaffold shipped in v0.1.0" },
  ];
  for (const rel of ACTIVE_DOCS) {
    const text = read(rel);
    if (text === null || isHistorical(rel) || QUOTES_STALE_CLAIMS.has(rel)) continue;
    for (const { pattern, why } of UNBUILT_CLAIMS) {
      const match = text.match(pattern);
      if (match !== null) {
        err(`${rel}: stale claim "${match[0].trim()}" — ${why}`);
      }
    }
  }

  // The same claims must not reappear in active source comments.
  const ACTIVE_COMMENT_SOURCES = [
    "runtime/src/index.ts",
    "application/src/memory-process.ts",
    "project-memory/src/index.ts",
    "mcp-server/src/server.ts",
  ];
  for (const rel of ACTIVE_COMMENT_SOURCES) {
    const text = read(rel);
    if (text === null) continue;
    if (/no CLI or MCP surface\s+invokes/i.test(text)) {
      err(`${rel}: comment claims no CLI or MCP surface invokes the Project Brain Runtime`);
    }
    if (/Nothing invokes it yet/i.test(text)) {
      err(`${rel}: comment claims the package is not invoked`);
    }
  }
}

// ---------------------------------------------------------------------------
// 6. The architecture document describes the implemented system, including the
//    application layer introduced in v0.5.1.
// ---------------------------------------------------------------------------

{
  const architecture = read("docs/architecture.md");
  if (architecture === null) {
    err("docs/architecture.md is missing");
  } else {
    for (const layer of [
      "Contracts",
      "Kernel",
      "Application",
      "Runtime",
      "Planner",
      "Providers",
      "Skills",
      "Project Memory",
      "CLI",
      "MCP",
      "Installer",
      "Distribution",
    ]) {
      if (!architecture.includes(layer)) {
        err(`docs/architecture.md must describe the "${layer}" layer`);
      }
    }
    if (!architecture.includes("@oh-my-pm/application")) {
      err("docs/architecture.md must name the @oh-my-pm/application package");
    }
  }
}

// ---------------------------------------------------------------------------
// 7. The roadmap distinguishes states and identifies the active scope.
// ---------------------------------------------------------------------------

{
  const roadmap = read("docs/roadmap.md");
  if (roadmap === null) {
    err("docs/roadmap.md is missing");
  } else {
    for (const state of ["Shipped", "Active maintenance", "Planned"]) {
      if (!roadmap.includes(state)) {
        err(`docs/roadmap.md must label work with the "${state}" state`);
      }
    }
    if (!roadmap.includes(VERSION)) {
      err(`docs/roadmap.md must identify v${VERSION} as the active maintenance scope`);
    }
  }
  const rootRoadmap = read("ROADMAP.md");
  if (rootRoadmap !== null && !rootRoadmap.includes(VERSION)) {
    err(`ROADMAP.md must identify v${VERSION}`);
  }
}

// ---------------------------------------------------------------------------
// 8. The application boundary is documented and no Dashboard is claimed.
// ---------------------------------------------------------------------------

{
  for (const rel of ["application/README.md", "docs/v0.5/application-boundary.md"]) {
    const text = read(rel);
    if (text === null) {
      err(`${rel} is missing`);
      continue;
    }
    if (!/no Dashboard|implements no Dashboard|not the v0\.6 Dashboard/i.test(text)) {
      err(`${rel} must state that v0.5.1 implements no Dashboard`);
    }
  }
  // No active document may present the Dashboard as shipped.
  for (const rel of ACTIVE_DOCS) {
    const text = read(rel);
    if (text === null) continue;
    if (/\bthe Dashboard (?:is|ships) (?:available|included|implemented)\b/i.test(text)) {
      err(`${rel}: presents the Dashboard as implemented; v0.5.1 includes none`);
    }
  }
}

// ---------------------------------------------------------------------------
// 9. Package manifests match what the documentation promises: private,
//    versioned from version.json, never published to npm.
// ---------------------------------------------------------------------------

{
  const readme = read("README.md");
  if (readme !== null) {
    if (!/private/i.test(readme)) {
      err("README.md must state that the workspace packages are private");
    }
    if (!/npm/i.test(readme)) {
      err("README.md must state that nothing is published to the npm registry");
    }
  }
  const appPkgText = read("application/package.json");
  if (appPkgText === null) {
    err("application/package.json is missing");
  } else {
    const appPkg = JSON.parse(appPkgText);
    if (appPkg.private !== true) err("application/package.json must be private");
    if (appPkg.version !== VERSION) {
      err(`application/package.json version ${appPkg.version} != ${VERSION}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 10. Historical documents are not silently rewritten to today's numbers.
// ---------------------------------------------------------------------------

{
  // A historical release note that suddenly claims the CURRENT version has been
  // wrongly "corrected". Each release note should name its own release.
  const releaseNote = (v) => `docs/releases/v${v}.md`;
  for (const past of ["0.1.0", "0.2.0", "0.3.0", "0.4.0"]) {
    const text = read(releaseNote(past));
    if (text === null) continue;
    if (!text.includes(past)) {
      err(`${releaseNote(past)} must keep naming its own release ${past}`);
    }
  }
}

if (fail) {
  console.error("validate-doc-truth: FAILED");
  process.exit(1);
}
console.log(
  `validate-doc-truth: OK (v${VERSION}, ${MCP_TOOLS.length} MCP tools, ` +
    `${MEMORY_SUBCOMMANDS.length} memory subcommands)`,
);
