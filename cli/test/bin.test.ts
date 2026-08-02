// Static checks on the private bin wrapper. Reading files here is test input;
// the wrapper itself is never executed by this test.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgJson = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
const binSource = readFileSync(join(pkgDir, "bin", "omp.mjs"), "utf8");
const legacyBinSource = readFileSync(join(pkgDir, "bin", "oh-my-pm.mjs"), "utf8");
const localProcessSource = readFileSync(join(pkgDir, "src", "local-process.ts"), "utf8");
const readme = readFileSync(join(pkgDir, "README.md"), "utf8");

describe("cli package bin metadata", () => {
  it("stays private with a canonical bin entry and no publish config", () => {
    expect(pkgJson.private).toBe(true);
    expect(pkgJson.bin["omp"]).toBe("./bin/omp.mjs");
    expect(pkgJson.publishConfig).toBeUndefined();
  });

  it("exposes only the canonical command, not the compatibility alias", () => {
    // The deprecated names are a *distribution* concern: a workspace consumer of
    // @oh-my-pm/cli must not silently gain a deprecated executable.
    expect(Object.keys(pkgJson.bin)).toEqual(["omp"]);
  });
});

describe("legacy cli wrapper source", () => {
  it("is a compatibility alias over the same runner, not a second implementation", () => {
    expect(legacyBinSource.startsWith("#!/usr/bin/env node")).toBe(true);
    expect(legacyBinSource).toContain('from "../dist/index.js"');
    expect(legacyBinSource).toContain("runLocalCliProcess");
    expect(legacyBinSource).toContain("process.argv.slice(2)");
  });

  it("emits the deprecation warning to stderr and never to stdout", () => {
    // The order matters: the warning is written before any runner output, and
    // only ever through process.stderr. A `--json` command's stdout must stay
    // parseable, so a warning on stdout would corrupt a machine-readable
    // contract.
    expect(legacyBinSource).toContain("process.stderr.write(`${commandAliasWarning(");
    const stdoutWrites = legacyBinSource.match(/process\.stdout\.write\(([^)]*)\)/g) ?? [];
    expect(stdoutWrites).toEqual(["process.stdout.write(result.stdout)"]);
    expect(legacyBinSource).not.toContain("process.stdout.write(`");
  });

  it("derives the warning from the shared helper rather than restating the text", () => {
    expect(legacyBinSource).toContain("commandAliasWarning");
    expect(legacyBinSource).not.toContain("is a deprecated compatibility alias.");
  });

  it("forwards the exit code and does not spawn a child process", () => {
    // Running in-process is what preserves stdin, the environment, the working
    // directory, and signal handling exactly.
    expect(legacyBinSource).toContain("process.exitCode = result.exitCode");
    for (const forbidden of ["child_process", "spawn", "execFile", "process.exit("]) {
      expect(legacyBinSource, `legacy wrapper must not contain "${forbidden}"`).not.toContain(
        forbidden,
      );
    }
  });

  it("does not invoke the canonical wrapper, so the two can never recurse", () => {
    // Both wrappers import the shared runner directly. Neither imports or
    // executes the other, so there is no path for an alias to re-enter itself.
    const importSpecifiers = [...legacyBinSource.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    expect(importSpecifiers).toEqual(["../dist/index.js"]);
    expect(legacyBinSource).not.toContain('import("');
  });
});

describe("bin wrapper source", () => {
  it("is a thin process adapter wired to the built CLI core", () => {
    expect(binSource.startsWith("#!/usr/bin/env node")).toBe(true);
    expect(binSource).toContain('from "../dist/index.js"');
    expect(binSource).toContain("runLocalCliProcess");
    expect(binSource).toContain("process.argv.slice(2)");
    expect(binSource).toContain("process.stdout.write");
    expect(binSource).toContain("process.stderr.write");
    expect(binSource).toContain("process.exitCode");
  });

  it("avoids forbidden side effects beyond stdio, exit code, and the boundary clock", () => {
    // The bin wrapper is the approved CLI process boundary for the real clock:
    // it may read `new Date().toISOString()` and inject it as the `clock`
    // accessor consumed only by the live github command. Every other
    // nondeterministic/side-effecting API remains forbidden.
    for (const forbidden of [
      "console.",
      "process.exit(",
      "process.env",
      "fetch(",
      "Date.now",
      "Math.random",
      "crypto.randomUUID",
    ]) {
      expect(binSource, `bin must not contain "${forbidden}"`).not.toContain(forbidden);
    }
  });

  it("injects the boundary clock into the runner", () => {
    expect(binSource).toContain("new Date().toISOString()");
    expect(binSource).toContain("clock:");
  });
});

describe("local CLI process runner source", () => {
  it("uses the real WASM Kernel binding instead of a local fake", () => {
    expect(localProcessSource).toContain('from "@oh-my-pm/kernel"');
    expect(localProcessSource).toContain("createNodeWasmKernelApi");
    expect(localProcessSource).not.toContain("createLocalCliKernelApi");
  });

  it("loads markdown project documents for brief, risks, next, and handoff through the shared loader", () => {
    expect(localProcessSource).toContain("loadConfiguredMarkdownProjectDocuments");
    expect(localProcessSource).toContain("parseCliArgs");
    for (const command of ["brief", "risks", "next", "handoff"]) {
      expect(localProcessSource).toContain(`"${command}"`);
    }
    // v0.5.1: the document load and its failure classification (including the
    // exact "no markdown project documents matched under:" and "invalid project
    // config:" messages) belong to @oh-my-pm/application. The CLI calls the
    // shared classifier and renders its message rather than restating it.
    expect(localProcessSource).toContain("loadLocalProjectDocuments");
    expect(localProcessSource).toContain('from "@oh-my-pm/application"');
    expect(localProcessSource).not.toContain("no markdown project documents matched under:");
  });

  it("does not write to process streams or read the environment or clock", () => {
    for (const forbidden of [
      "process.stdout",
      "process.stderr",
      "process.env",
      "Date.now",
      "new Date",
      "Math.random",
    ]) {
      expect(localProcessSource, `runner must not contain "${forbidden}"`).not.toContain(forbidden);
    }
  });
});

describe("cli readme", () => {
  it("documents the private local wrapper", () => {
    expect(readme).toContain("private");
    expect(readme).toContain("not published");
    expect(readme).toContain("real WASM Kernel binding");
    expect(readme).toContain("`status`");
    expect(readme).toContain("`doctor`");
    expect(readme).toContain("`plan <request>`");
    expect(readme).toContain("`brief [root]`");
    expect(readme).toContain("`risks [root]`");
    expect(readme).toContain("`next [root]`");
    expect(readme).toContain("`handoff [root]`");
    expect(readme).toContain("`install-preview <root>`");
    expect(readme).toContain("dry-run only");
  });
});
