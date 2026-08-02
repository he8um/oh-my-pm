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
//   release-state.json                the release lifecycle and latest stable
//   command-surface.json              the canonical and deprecated command names
//   docs/manifest.json                which documents are current truth
//   pnpm-workspace.yaml               the real workspace packages
//   mcp-server/src/server.ts          the registered MCP tools, in order
//   application/src/memory-types.ts   the memory subcommands
//   */package.json                    private/version/type facts
//
// So this file adds no second source of truth: if the product changes, the
// derived expectation changes with it and the documentation must follow.
//
// HISTORICAL documents are excluded, and which documents those are is read from
// docs/manifest.json rather than hard-coded here. Release notes, the v0.3/v0.4
// design records, the v0.2 stabilization audit, and the CHANGELOG are
// point-in-time records; their old versions and tool counts were true when
// written and must stay that way. Only documents classified `active` describe
// the system AS IT IS NOW, and only those are checked for current-state claims.
//
// Read-only: no writes, no network, no environment reads.

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import {
  CANONICAL_CLI,
  CANONICAL_INSTALLED_COMMANDS,
  CANONICAL_INSTALLER,
  CANONICAL_MCP,
  INSTALLED_SHIM_COUNT,
  INSTALLED_SHIM_NAMES,
  ALIAS_INSTALLED_COMMANDS,
  COMPAT_CLI,
  DEPRECATED_CLI,
  REPO_ROOT,
} from "./command-surface.mjs";

// Active documentation must present the canonical family. Both alias classes are
// equally wrong as the *primary* example, even though `ohmypm*` remains fully
// supported at runtime, so the two are policed together here.
const LEGACY_CLI = [...COMPAT_CLI, ...DEPRECATED_CLI];
const LEGACY_INSTALLED_COMMANDS = ALIAS_INSTALLED_COMMANDS;
import { loadReleaseState } from "./release-state.mjs";
import {
  activeDocPaths,
  classificationOf,
  historicalDocPaths,
  isExcluded,
  loadDocsManifest,
  normativeDocPaths,
  supersededDocPaths,
} from "./docs-manifest.mjs";

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

// The release lifecycle contract. Structural and relational validation lives in
// the loader; the errors it returns are reported here so a malformed contract
// fails `pnpm validate:docs` like any other documentation defect.
const { state: RELEASE_STATE, errors: RELEASE_STATE_ERRORS } = loadReleaseState(REPO_ROOT);
for (const message of RELEASE_STATE_ERRORS) err(message);

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

// v0.5.3: the active/historical split is no longer restated here. It is DERIVED
// from docs/manifest.json, the authoritative classification contract, so this
// validator and tools/docs-inventory.mjs cannot disagree, and a newly added
// document is classified deliberately instead of defaulting to unchecked.
//
// Structural defects in the manifest are reported here for the same reason
// release-state defects are: a malformed classification contract is a
// documentation defect and must fail `pnpm validate:docs`.
const { manifest: DOCS_MANIFEST, errors: DOCS_MANIFEST_ERRORS } = loadDocsManifest(REPO_ROOT);
for (const message of DOCS_MANIFEST_ERRORS) err(message);

/**
 * Historical documents are point-in-time records. They are never checked for
 * current-state claims, and they must not be rewritten to match today.
 *
 * `_dev/` is untracked scratch space and never classified, so it stays a prefix
 * rule rather than a manifest entry.
 */
const HISTORICAL_PATHS = new Set(DOCS_MANIFEST === null ? [] : historicalDocPaths(DOCS_MANIFEST));
const isHistorical = (rel) => rel.startsWith("_dev/") || HISTORICAL_PATHS.has(rel);

/** Active documents whose current-state claims are checked. */
const ACTIVE_DOCS = DOCS_MANIFEST === null ? [] : activeDocPaths(DOCS_MANIFEST);

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
      // A block that shows the alias notice is DOCUMENTING the alias behavior,
      // not recommending the alias.
      if (/is a compatibility alias|is deprecated|deprecated compatibility alias/i.test(block[1])) {
        continue;
      }
      // A migration guide's before/after pair must show the old command to be
      // useful at all. The `before` marker is what distinguishes "here is what
      // you used to type" from "here is what to type", and it is only honored in
      // a block that also shows the canonical replacement.
      if (/^#\s*before\b/im.test(block[1]) && block[1].includes(CANONICAL_CLI)) continue;
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

// ---------------------------------------------------------------------------
// 11. The release-state contract agrees with the source, and active
//     documentation agrees with the release-state contract.
// ---------------------------------------------------------------------------

if (RELEASE_STATE !== null) {
  const { sourceVersion, sourceState, latestStableVersion, latestStableTag, publicationTarget } =
    RELEASE_STATE;

  // The contract must not disagree with the one fact that already had a source.
  if (sourceVersion !== VERSION) {
    err(`release-state.json sourceVersion ${sourceVersion} != version.json ${VERSION}`);
  }

  const published = sourceState === "published";

  // A version that IS published must never be described as awaiting
  // publication, and one that is NOT published must never be described as
  // released. Both directions drifted in practice, so both are checked.
  const unpublishedWording = (version) => {
    const v = version.replace(/\./g, "\\.");
    return [
      new RegExp(`v?\`?${v}\`?[^.\\n]{0,60}?\\bnot (?:yet )?published`, "i"),
      new RegExp(
        `v?\`?${v}\`?[^.\\n]{0,60}?\\bprepared,? (?:but )?(?:not yet published|unpublished)`,
        "i",
      ),
      new RegExp(`\\bprepared[^.\\n]{0,40}?\\bnot (?:yet )?published[^.\\n]{0,40}?v?\`?${v}`, "i"),
    ];
  };
  // These must bind the version to the claim. A single line often mentions
  // several releases -- "the source is 0.5.2 ... v0.5.1 is the current
  // published stable" is correct -- so a bare line-level match would
  // misattribute the claim to whichever version happened to appear.
  const publishedWording = (version) => {
    const v = version.replace(/\./g, "\\.");
    return [
      new RegExp(
        `v?\`?${v}\`?[^.\\n]{0,40}?\\bis\\b[^.\\n]{0,40}?(?:latest|current)[^.\\n]{0,20}?stable`,
        "i",
      ),
      new RegExp(`v?\`?${v}\`?[^.\\n]{0,40}?\\bpublished as (?:the )?latest stable`, "i"),
    ];
  };

  for (const rel of ACTIVE_DOCS) {
    const text = read(rel);
    if (text === null || isHistorical(rel) || QUOTES_STALE_CLAIMS.has(rel)) continue;

    // Claims are only checked when they are about the SOURCE version, so a
    // sentence about a genuinely older or genuinely newer release is untouched.
    for (const line of text.split("\n")) {
      const mentionsSource = line.includes(sourceVersion);
      if (!mentionsSource) continue;

      if (published && unpublishedWording(sourceVersion).some((p) => p.test(line))) {
        err(
          `${rel}: describes v${sourceVersion} as unpublished, but release-state.json ` +
            `says it is published — "${line.trim().slice(0, 110)}"`,
        );
      }
      if (!published && publishedWording(sourceVersion).some((p) => p.test(line))) {
        err(
          `${rel}: describes v${sourceVersion} as a published stable release, but ` +
            `release-state.json says it is ${sourceState} — "${line.trim().slice(0, 110)}"`,
        );
      }
    }

    // The latest stable must not be understated: naming an OLDER release as the
    // current latest stable is the v0.4.0-after-v0.5.1 drift Issue #30 recorded.
    //
    // Only PRESENT-TENSE claims are checked. A dated changelog entry recording
    // that some version "is now the latest stable" was true when written and is
    // a historical record, not a current-state claim -- rewriting those would
    // destroy the release history. The distinction is the verb: "is the latest
    // stable" / "remains the latest stable" asserts now; "was", "is now" in a
    // phase log, or "published as the latest stable release" records an event.
    const PRESENT_TENSE_LATEST_STABLE = [
      // "`v0.4.0` is published and remains the latest stable release"
      /v?(\d+\.\d+\.\d+)`?[^.\n]{0,80}?\bremains the (?:latest|current)\s+\*{0,2}stable/gi,
      // "the latest stable release is v0.5.1"
      /\bthe (?:latest|current)\s+\*{0,2}(?:published\s+)?stable\*{0,2}[^.\n]{0,40}?\bis\b[^.\n]{0,40}?v(\d+\.\d+\.\d+)/gi,
    ];
    for (const pattern of PRESENT_TENSE_LATEST_STABLE) {
      for (const match of text.matchAll(pattern)) {
        if (match[1] !== latestStableVersion) {
          err(
            `${rel}: names v${match[1]} as the current latest stable, but ` +
              `release-state.json says ${latestStableTag}`,
          );
        }
      }
    }
  }

  // While a publication is pending, the target must be the source version; the
  // relationship itself is enforced in the loader. Here we require the release
  // notes for that target to exist, because the release workflow will demand
  // them at publish time and a missing file should fail earlier than that.
  if (publicationTarget !== null) {
    const notes = `docs/releases/${publicationTarget}.md`;
    if (read(notes) === null) {
      err(`publicationTarget is ${publicationTarget} but ${notes} is missing`);
    }
  }
}

// ---------------------------------------------------------------------------
// 12. The installed shim inventory is described accurately.
// ---------------------------------------------------------------------------

{
  // Derived from the command manifest, never restated: see
  // INSTALLED_SHIM_NAMES in tools/command-surface.mjs.
  const expected = INSTALLED_SHIM_COUNT;
  const word = NUMBER_WORDS[expected] ?? String(expected);

  // Any numeric or spelled claim about how many shims an install writes.
  const SHIM_COUNT_CLAIM =
    /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+)\b\s+(?:command\s+)?shims\b/gi;

  const SHIM_DOCS = [...ACTIVE_DOCS, ".github/workflows/ci.yml"];
  for (const rel of SHIM_DOCS) {
    const text = read(rel);
    if (text === null || isHistorical(rel)) continue;
    for (const match of text.matchAll(SHIM_COUNT_CLAIM)) {
      const claimed = match[1].toLowerCase();
      const claimedNumber = /^\d+$/.test(claimed) ? Number(claimed) : NUMBER_WORDS.indexOf(claimed);
      if (claimedNumber !== expected) {
        err(
          `${rel}: claims "${match[0].trim()}", but an install writes ${word} (${expected}) ` +
            `shims: ${INSTALLED_SHIM_NAMES.join(", ")}`,
        );
      }
    }
  }

  // The getting-started guide enumerates the canonical/deprecated split. The
  // halves must match the real command counts, not merely add up: "four
  // canonical and four deprecated" also totals eight while describing four
  // canonical commands that do not exist -- there are two of each, with two
  // launchers apiece.
  const gettingStarted = read("docs/getting-started.md");
  if (gettingStarted !== null) {
    for (const match of gettingStarted.matchAll(
      /\b(one|two|three|four|five|six|seven|eight)\b\s+canonical(?:\s+commands?)?\s+and\s+\b(one|two|three|four|five|six|seven|eight)\b\s+deprecated/gi,
    )) {
      const canonical = NUMBER_WORDS.indexOf(match[1].toLowerCase());
      const legacy = NUMBER_WORDS.indexOf(match[2].toLowerCase());
      const realCanonical = CANONICAL_INSTALLED_COMMANDS.length;
      const realLegacy = LEGACY_INSTALLED_COMMANDS.length;
      if (canonical !== realCanonical || legacy !== realLegacy) {
        err(
          `docs/getting-started.md: "${match[0]}" describes ${canonical} canonical and ` +
            `${legacy} deprecated, but an install writes ${realCanonical} canonical ` +
            `commands and ${realLegacy} deprecated aliases ` +
            `(${expected} shims, each command having a POSIX and a .cmd launcher)`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 13. The security policy names a real supported release and a real route.
// ---------------------------------------------------------------------------

{
  const security = read("SECURITY.md");
  if (security === null) {
    err("SECURITY.md is missing");
  } else if (RELEASE_STATE !== null) {
    const { latestStableTag, latestStableVersion } = RELEASE_STATE;

    // The claim that nothing is supported was true before the first stable and
    // false from v0.1.0 onward. It is the exact wording Issue #30 recorded.
    for (const pattern of [
      /no stable release is supported/i,
      /\bin early development\b/i,
      /\bno supported (?:stable )?version\b/i,
    ]) {
      const match = security.match(pattern);
      if (match !== null) {
        err(`SECURITY.md: "${match[0]}" — ${latestStableTag} is a published stable release`);
      }
    }

    // The supported version must be the real latest stable.
    if (!security.includes(latestStableVersion)) {
      err(`SECURITY.md must name the supported stable release ${latestStableTag}`);
    }

    // A reporting route must exist, and it must not be an invented address.
    const hasPrivateReporting = /private vulnerability reporting|security\/advisories\/new/i.test(
      security,
    );
    if (!hasPrivateReporting) {
      err("SECURITY.md must describe how to report a vulnerability privately");
    }
    for (const match of security.matchAll(/[\w.+-]+@[\w-]+\.[\w.]+/g)) {
      err(
        `SECURITY.md names an email address (${match[0]}); the repository has no ` +
          `security mailbox, so the route must be GitHub private vulnerability reporting`,
      );
    }

    // Public disclosure must be discouraged before review.
    if (!/do not open a public issue/i.test(security)) {
      err("SECURITY.md must discourage public disclosure before maintainer review");
    }
  }
}

// ---------------------------------------------------------------------------
// 14. The support policy describes the shipped project and real channels.
// ---------------------------------------------------------------------------

{
  const support = read("SUPPORT.md");
  if (support === null) {
    err("SUPPORT.md is missing");
  } else {
    for (const pattern of [
      /\bis early-stage\b/i,
      /\bearly development\b/i,
      /will expand after the repository scaffold/i,
      /\bscaffold\b/i,
    ]) {
      const match = support.match(pattern);
      if (match !== null) {
        err(`SUPPORT.md: scaffold-era claim "${match[0]}" — the system is shipped and published`);
      }
    }

    // A channel may only be named if it actually exists. GitHub Discussions is
    // disabled for this repository, so pointing users at it would send them to
    // a 404. If Discussions is ever enabled, this check is what must be updated.
    if (
      /\bGitHub Discussions\b/i.test(support) &&
      !/Discussions (?:is|are) not enabled/i.test(support)
    ) {
      err(
        "SUPPORT.md points at GitHub Discussions, which is not enabled for this " +
          "repository; name only channels that exist",
      );
    }

    // Security reports must be routed away from public issues.
    if (!/SECURITY\.md|security (?:report|vulnerabilit)/i.test(support)) {
      err("SUPPORT.md must route security reports away from public issues");
    }
  }
}

// ---------------------------------------------------------------------------
// 15. Every tracked document is classified.
// ---------------------------------------------------------------------------
//
// An unclassified document is an unchecked document: none of the current-state
// guards above apply to it, so it can claim anything indefinitely. Requiring
// classification makes "is this current truth?" an answered question for every
// file rather than an accident of which array someone remembered to edit.

if (DOCS_MANIFEST !== null) {
  const tracked = execFileSync("git", ["ls-files", "*.md"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  })
    .split("\n")
    .filter((line) => line.length > 0);

  for (const rel of tracked) {
    if (isExcluded(DOCS_MANIFEST, rel)) continue;
    if (classificationOf(DOCS_MANIFEST, rel) === null) {
      err(
        `${rel} is not classified in docs/manifest.json; add it with a status and ` +
          `authority, or exclude it explicitly`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 16. Active documentation names only packages that exist, and the
//     authoritative package map omits none that do.
// ---------------------------------------------------------------------------
//
// Two symmetrical drifts, both of which mislead a reader who is trying to find
// the code behind a claim:
//
//   a package named as implemented that does not exist -- the reader looks for
//   @oh-my-pm/<thing>, finds nothing, and cannot tell whether the docs or the
//   tree is wrong;
//
//   a real workspace package missing from the architecture package map -- the
//   reader concludes the package is not part of the system.
//
// Both expectations derive from pnpm-workspace.yaml, so adding or removing a
// package moves them automatically.

{
  /** Real workspace package names, from the workspace manifest. */
  const workspacePackages = (() => {
    const yaml = read("pnpm-workspace.yaml");
    if (yaml === null) return [];
    const dirs = [...yaml.matchAll(/^\s*-\s*"([^"]+)"/gm)].map((m) => m[1]);
    const names = [];
    for (const dir of dirs) {
      const pkg = read(`${dir}/package.json`);
      if (pkg === null) {
        err(`pnpm-workspace.yaml lists "${dir}" but ${dir}/package.json is missing`);
        continue;
      }
      names.push(JSON.parse(pkg).name);
    }
    return names;
  })();

  if (workspacePackages.length === 0) {
    err("could not derive the workspace package list from pnpm-workspace.yaml");
  }
  const realPackages = new Set(workspacePackages);

  // 16a. No active document may present a nonexistent @oh-my-pm/* package as
  //      part of the implemented system.
  for (const rel of ACTIVE_DOCS) {
    const text = read(rel);
    if (text === null || QUOTES_STALE_CLAIMS.has(rel)) continue;
    const named = new Set([...text.matchAll(/@oh-my-pm\/([a-z][a-z0-9-]*)/g)].map((m) => m[0]));
    for (const pkg of [...named].sort()) {
      if (!realPackages.has(pkg)) {
        err(
          `${rel}: names the package "${pkg}", which is not a workspace package ` +
            `(real packages: ${[...realPackages].sort().join(", ")})`,
        );
      }
    }
  }

  // 16b. The authoritative package map must account for every real package.
  //      docs/architecture.md is that map: it is the active+normative document
  //      for the "architecture" concern.
  const architecture = read("docs/architecture.md");
  if (architecture !== null) {
    for (const pkg of [...realPackages].sort()) {
      if (!architecture.includes(pkg)) {
        err(
          `docs/architecture.md is the authoritative package map but omits the real ` +
            `workspace package "${pkg}"`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 17. A superseded document is not linked as though it were current.
// ---------------------------------------------------------------------------
//
// Marking a document superseded records that it should no longer be followed.
// That is only meaningful if the active, normative documents stop pointing at
// it -- otherwise a reader arrives via a current index and reads stale guidance
// with no indication it was replaced. The replacement path exists precisely so
// the link can be redirected.

if (DOCS_MANIFEST !== null) {
  const superseded = supersededDocPaths(DOCS_MANIFEST);
  if (superseded.length > 0) {
    for (const rel of normativeDocPaths(DOCS_MANIFEST)) {
      const text = read(rel);
      if (text === null) continue;
      // Markdown inline links only: a bare path mentioned in prose (for example
      // when explaining that a document WAS superseded) is not a live link.
      const linked = [...text.matchAll(/\]\(([^)\s#]+)/g)].map((m) => m[1]);
      for (const target of linked) {
        const resolved = target.startsWith("/")
          ? target.slice(1)
          : normalize(join(dirname(rel), target));
        const hit = superseded.find((s) => s === resolved);
        if (hit !== undefined) {
          const replacement = classificationOf(DOCS_MANIFEST, hit)?.replacement;
          err(
            `${rel} is active+normative but links to the superseded document ${hit}; ` +
              `link ${replacement ?? "its replacement"} instead`,
          );
        }
      }
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
