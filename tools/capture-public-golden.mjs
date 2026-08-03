// Capture the observable CLI and MCP output of the shared project workflows.
//
// Why this exists
// ---------------
// v0.6.1 moves the shared local and GitHub workflows onto `ApplicationResult<T>`
// and converges the CLI's duplicated local composition onto
// `runLocalProjectWorkflow`. Both are internal changes that must produce NO
// observable public difference.
//
// A test that asserts a shape can still pass while the bytes drift. This script
// records the ACTUAL bytes -- stdout, stderr, exit code, and the MCP structured
// payload -- from a known-good tree, and `tests/e2e/public-golden.test.ts`
// replays the same invocations and compares against the recording. The baseline
// is captured BEFORE any refactor, so it describes v0.6.0 behaviour and cannot
// be rationalised after the fact.
//
// Regenerating is deliberately a manual, reviewable act: if a diff appears in a
// pull request, that is a public contract change and must be justified in review,
// never waved through.
//
// Offline and deterministic: local Markdown fixtures, a fake GitHub transport,
// and a fixed clock. No network, no real tokens.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const { runLocalCliProcess } = await import("@oh-my-pm/cli");
const { executeMcpGitHubTool, executeMcpProjectTool } = await import("@oh-my-pm/mcp-server");
const { defaultProviderConfig } = await import("@oh-my-pm/providers");

const NOW = "2026-03-01T00:00:00.000Z";
const SLUG = "octo/demo";
const OFFLINE_CONFIG = defaultProviderConfig();

/** The four workflows both surfaces genuinely share. */
export const SHARED_OPERATIONS = ["brief", "risks", "next", "handoff"];

/**
 * Fixture roots, referenced by a repository-relative name.
 *
 * The recording stores the RELATIVE name only. An absolute path would embed
 * this machine's layout in a committed file and make the golden unreproducible
 * on CI and on another contributor's checkout.
 */
export const FIXTURES = Object.freeze({
  signals: join("examples", "fixtures", "project-signals"),
  markdown: join("examples", "fixtures", "markdown-project"),
  missing: join("examples", "fixtures", "does-not-exist-anywhere"),
});

/** A minimal fake GitHub transport: one repository record and two issues. */
export function githubTransport() {
  return {
    async request(request) {
      const url = new URL(request.url);
      if (url.pathname === `/repos/${SLUG}`) {
        return {
          status: 200,
          headers: {},
          body: {
            full_name: SLUG,
            html_url: `https://github.com/${SLUG}`,
            description: "demo",
            open_issues_count: 2,
          },
        };
      }
      return {
        status: 200,
        headers: {},
        body: [
          {
            number: 1,
            title: "Blocked on design review",
            body: "blocked",
            state: "open",
            html_url: `https://github.com/${SLUG}/issues/1`,
            user: { login: "a" },
            assignees: [],
            labels: [{ name: "blocked" }],
          },
          {
            number: 2,
            title: "Ship the handoff",
            body: "ready",
            state: "open",
            html_url: `https://github.com/${SLUG}/issues/2`,
            user: { login: "b" },
            assignees: [],
            labels: [],
          },
        ],
      };
    },
  };
}

/**
 * Replace any occurrence of the absolute repository root with a stable token.
 *
 * Output is asserted elsewhere never to contain a resolved root; this is a
 * belt-and-braces guard so that IF a leak is ever introduced, the golden file
 * still diffs (showing the token where the leak is) instead of silently
 * recording one machine's paths and failing everywhere else.
 */
function stripRoot(text) {
  return text.split(repoRoot).join("<REPO_ROOT>");
}

/**
 * Run one CLI invocation and record its full observable surface.
 *
 * `args` is sanitized too, not just the streams: the recorded invocation is
 * itself part of the committed file, and an absolute fixture path there would
 * make the golden machine-specific even when the product leaked nothing.
 */
async function captureCli(name, args, options = {}) {
  const result = await runLocalCliProcess(args, options);
  return {
    name,
    surface: "cli",
    args: args.map(stripRoot),
    exitCode: result.exitCode,
    stdout: stripRoot(result.stdout),
    stderr: stripRoot(result.stderr),
  };
}

/** Record an MCP result, which is a structured value rather than a stream. */
function captureMcp(name, operation, result) {
  return {
    name,
    surface: "mcp",
    operation,
    result: JSON.parse(stripRoot(JSON.stringify(result))),
  };
}

/**
 * Build the full recording.
 *
 * Covers, for both surfaces: the four shared local workflows, the four shared
 * GitHub workflows, JSON and human output modes, and the failure paths whose
 * codes and exit codes are part of the public contract.
 */
export async function captureGolden() {
  // Repository-relative roots, resolved against a cwd pinned to the repository
  // root. Driving the CLI with the relative form is deliberate: it is the shape
  // a real caller types, and it exercises the guarantee that the root is echoed
  // back exactly as supplied rather than resolved. Passing an absolute root
  // would record this machine's layout and prove nothing about resolution.
  const signals = FIXTURES.signals;
  const markdown = FIXTURES.markdown;
  const missing = FIXTURES.missing;
  const entries = [];

  for (const operation of SHARED_OPERATIONS) {
    entries.push(await captureCli(`local.${operation}.json`, [operation, signals, "--json"]));
    entries.push(await captureCli(`local.${operation}.human`, [operation, signals]));
    entries.push(
      captureMcp(
        `local.${operation}.mcp`,
        operation,
        await executeMcpProjectTool(operation, signals),
      ),
    );
  }

  // A second fixture with a different document set, so the golden is not
  // over-fitted to one corpus.
  entries.push(await captureCli("local.risks.markdown.json", ["risks", markdown, "--json"]));
  entries.push(
    captureMcp("local.risks.markdown.mcp", "risks", await executeMcpProjectTool("risks", markdown)),
  );

  // Failure paths. The relative form proves the root is echoed unresolved.
  entries.push(await captureCli("local.brief.missing.json", ["brief", missing, "--json"]));
  entries.push(
    await captureCli("local.brief.missing.relative", ["brief", "./does-not-exist-anywhere"]),
  );
  entries.push(
    captureMcp(
      "local.brief.missing.mcp",
      "brief",
      await executeMcpProjectTool("brief", "./does-not-exist-anywhere"),
    ),
  );

  for (const operation of SHARED_OPERATIONS) {
    const cliOptions = {
      githubTransport: githubTransport(),
      now: NOW,
      providerConfig: OFFLINE_CONFIG,
    };
    entries.push(
      await captureCli(
        `github.${operation}.json`,
        ["github", operation, SLUG, "--json", "--limit", "5"],
        cliOptions,
      ),
    );
    entries.push(
      await captureCli(
        `github.${operation}.human`,
        ["github", operation, SLUG, "--limit", "5"],
        cliOptions,
      ),
    );
    entries.push(
      captureMcp(
        `github.${operation}.mcp`,
        operation,
        await executeMcpGitHubTool(
          operation,
          { repository: SLUG, limit: 5 },
          { transport: githubTransport(), providerConfig: OFFLINE_CONFIG, now: NOW },
        ),
      ),
    );
  }

  return { schemaVersion: 1, capturedFor: "0.6.0", now: NOW, entries };
}

export const GOLDEN_PATH = join(repoRoot, "tests", "fixtures", "public-golden.json");

if (import.meta.url === `file://${process.argv[1]}`) {
  // Both surfaces resolve a relative root against the process cwd. Pin it so
  // the recording does not depend on where the script was invoked from.
  process.chdir(repoRoot);
  const golden = await captureGolden();
  mkdirSync(dirname(GOLDEN_PATH), { recursive: true });

  // Emit Prettier-formatted JSON rather than raw `JSON.stringify` output. The
  // repository runs `format:check` in CI, so a plainly stringified recording
  // would fail the moment anyone regenerated it -- turning a routine
  // regeneration into a broken build for a reason unrelated to the contract.
  const prettier = await import("prettier");
  const options = (await prettier.resolveConfig(GOLDEN_PATH)) ?? {};
  const formatted = await prettier.format(JSON.stringify(golden), {
    ...options,
    filepath: GOLDEN_PATH,
  });
  writeFileSync(GOLDEN_PATH, formatted, "utf8");
  console.log(`capture-public-golden: wrote ${golden.entries.length} entries`);
}
