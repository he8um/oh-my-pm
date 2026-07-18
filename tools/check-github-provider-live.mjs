#!/usr/bin/env node
// MANUAL-ONLY live smoke for the read-only GitHub provider. This is the single
// tool that may make a real request to the GitHub API, and only when the
// operator explicitly passes --confirm-network. It never runs in CI, never runs
// during build/test/validate, performs a read-only `list` only, and prints
// counts and item titles/URLs only — never bodies and never the token.
//
// Usage:
//   node tools/check-github-provider-live.mjs \
//     --repository owner/repo --limit 5 --confirm-network

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(args) {
  let repository;
  let limit = 5;
  let confirm = false;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--repository") {
      repository = args[i + 1];
      i += 1;
    } else if (arg === "--limit") {
      limit = Number(args[i + 1]);
      i += 1;
    } else if (arg === "--confirm-network") {
      confirm = true;
    } else {
      return { ok: false, message: `unexpected argument: ${arg}` };
    }
  }
  if (repository === undefined || repository === "") {
    return { ok: false, message: "--repository owner/repo is required" };
  }
  if (!confirm) {
    return { ok: false, message: "--confirm-network is required for a live request" };
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) {
    return { ok: false, message: "--limit must be an integer in 1..10" };
  }
  return { ok: true, repository, limit };
}

const parsed = parseArgs(process.argv.slice(2));
if (!parsed.ok) {
  process.stderr.write(`github live smoke error: ${parsed.message}\n`);
  process.exitCode = 2;
} else {
  // Resolve the built providers package from the repository node_modules.
  const providersEntry = pathToFileURL(
    join(repoRoot, "providers", "dist", "index.js"),
  ).href;
  const {
    createGitHubProvider,
    createNodeGitHubHttpTransport,
    parseGitHubRepository,
  } = await import(providersEntry);

  const repoResult = parseGitHubRepository(parsed.repository);
  if (!repoResult.ok) {
    process.stderr.write(`github live smoke error: invalid repository (${repoResult.reason})\n`);
    process.exitCode = 2;
  } else {
    // The optional token is read here, at this explicit manual boundary only.
    const rawToken = process.env.OH_MY_PM_GITHUB_TOKEN;
    const token = typeof rawToken === "string" && rawToken.trim() !== "" ? rawToken.trim() : undefined;
    const authenticated = token !== undefined;
    const transport = createNodeGitHubHttpTransport({ token, productVersion: "0.2.0-alpha.0-live-smoke" });
    const provider = createGitHubProvider({ transport, productVersion: "0.2.0-alpha.0-live-smoke" });

    const result = await provider.execute(
      { providerId: "github", action: "list", query: repoResult.ref.slug, limit: parsed.limit },
      { requestId: "github-live-smoke" },
    );

    if (!result.ok) {
      // Never print the raw provider message body; the code is stable.
      process.stderr.write(`github live smoke failed: ${result.code}\n`);
      process.exitCode = 1;
    } else {
      const items = result.response.items;
      process.stdout.write(`repository: ${repoResult.ref.slug}\n`);
      process.stdout.write(`authenticated: ${authenticated ? "yes" : "no"}\n`);
      process.stdout.write(`items: ${items.length}\n`);
      for (const item of items) {
        // Titles and URLs only — never bodies.
        process.stdout.write(`- ${item.title}${item.url ? ` (${item.url})` : ""}\n`);
      }
      process.stdout.write("github live smoke: OK\n");
    }
  }
}
