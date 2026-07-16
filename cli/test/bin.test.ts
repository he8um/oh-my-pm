// Static checks on the private bin wrapper. Reading files here is test input;
// the wrapper itself is never executed by this test.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgJson = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
const binSource = readFileSync(join(pkgDir, "bin", "oh-my-pm.mjs"), "utf8");
const readme = readFileSync(join(pkgDir, "README.md"), "utf8");

describe("cli package bin metadata", () => {
  it("stays private with a local bin entry and no publish config", () => {
    expect(pkgJson.private).toBe(true);
    expect(pkgJson.bin["oh-my-pm"]).toBe("./bin/oh-my-pm.mjs");
    expect(pkgJson.publishConfig).toBeUndefined();
  });
});

describe("bin wrapper source", () => {
  it("is a node script wired to the built CLI core", () => {
    expect(binSource.startsWith("#!/usr/bin/env node")).toBe(true);
    expect(binSource).toContain('from "../dist/index.js"');
    expect(binSource).toContain("process.argv.slice(2)");
    expect(binSource).toContain("process.stdout.write");
    expect(binSource).toContain("process.stderr.write");
    expect(binSource).toContain("process.exitCode");
  });

  it("uses the real WASM Kernel binding instead of a local fake", () => {
    expect(binSource).toContain('from "@oh-my-pm/kernel"');
    expect(binSource).toContain("createNodeWasmKernelApi");
    expect(binSource).not.toContain("createLocalCliKernelApi");
  });

  it("loads markdown project documents for brief and risks through the shared loader", () => {
    expect(binSource).toContain("loadMarkdownProjectDocuments");
    expect(binSource).toContain("parseCliArgs");
    expect(binSource).toContain("usesProjectDocuments");
    expect(binSource).toContain('parsed.command === "brief" || parsed.command === "risks"');
    expect(binSource).toContain("no markdown project documents found under:");
  });

  it("avoids forbidden side effects beyond stdio and exit code", () => {
    for (const forbidden of [
      "console.",
      "process.exit(",
      "process.env",
      "fetch(",
      "Date.now",
      "new Date",
      "Math.random",
      "crypto.randomUUID",
    ]) {
      expect(binSource, `bin must not contain "${forbidden}"`).not.toContain(forbidden);
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
    expect(readme).toContain("`install-preview <root>`");
    expect(readme).toContain("dry-run only");
  });
});
