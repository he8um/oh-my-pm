// Source-level invariants for the release transaction/temp workspaces (F-08).
//
// Three release tools create a transaction directory inside a directory an
// attacker may also be able to write to. Each previously derived that path from
// `process.pid` and then recursively removed whatever was already there, so a
// co-located writer could pre-create the predictable name and have it deleted,
// or race its contents.
//
// The fix is that `mkdtempSync` both chooses the suffix and creates the
// directory, so there is no guessable name and nothing is removed to make room.
// These assertions pin that at the source level; the executable proof that a
// pre-created predictable path survives lives with each tool's own suite
// (`tools/release-install-e2e.test.mjs`, `tools/test/release-bundle-e2e.test.mjs`,
// `tools/release-archive-utils.test.mjs`).
//
// Scope note: this bans `process.pid` in the transaction paths of these three
// files only. Legitimate uses elsewhere (diagnostics, lock ownership, the CLI's
// own process metadata) are deliberately untouched.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// The exact files that build a release transaction workspace.
const TRANSACTION_SOURCES = [
  join("distribution", "libexec", "release-install-core.mjs"),
  join("tools", "release-bundle-utils.mjs"),
  join("tools", "release-archive-utils.mjs"),
];

describe("release transaction workspaces are unpredictable (F-08)", () => {
  for (const relative of TRANSACTION_SOURCES) {
    describe(relative, () => {
      const source = readFileSync(join(repoRoot, relative), "utf8");

      it("derives no path from process.pid", () => {
        expect(source).not.toContain("process.pid");
      });

      it("creates its transaction workspace with mkdtempSync", () => {
        expect(source).toContain("mkdtempSync(");
        // Imported from node:fs rather than referenced off a namespace object.
        expect(source).toMatch(/\bmkdtempSync,/);
      });

      it("never removes a transaction path before creating it", () => {
        // The old shape was: build a predictable name, rmSync it recursively,
        // then mkdirSync it. mkdtempSync makes all three steps unnecessary, so
        // no `.tmp-`/`.install-tx-` literal may be joined into a path that is
        // then removed. The only remaining uses of those prefixes are the
        // mkdtempSync prefix arguments themselves.
        for (const marker of [".install-tx-", ".tmp-", ".archive.tmp-"]) {
          for (const line of source.split("\n")) {
            if (!line.includes(marker)) continue;
            // Every surviving occurrence must be a mkdtempSync prefix.
            expect(line, `${marker} in: ${line.trim()}`).toContain("mkdtempSync(");
          }
        }
      });
    });
  }
});

describe("the release bundle builder launches no shell (F-09)", () => {
  const source = readFileSync(join(repoRoot, "tools", "release-bundle-utils.mjs"), "utf8");

  // Comments are stripped before scanning for interpreter names: the module
  // documents *why* cmd.exe is no longer used, and that explanation must not
  // read as a violation. Only executable code is asserted against.
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

  it("never spawns with a shell option", () => {
    // Matches `shell: true`, `shell: isWindows`, `shell: platform === ...`, and
    // the previous `shell: invocation.shell` indirection.
    expect(code).not.toMatch(/shell:\s*(?!undefined)\S/);
  });

  it("never names a shell interpreter in executable code", () => {
    for (const marker of ["cmd.exe", "powershell", "pwsh", "/bin/sh", "/c "]) {
      expect(code, marker).not.toContain(marker);
    }
  });

  it("launches pnpm through the current Node binary and its own .cjs CLI", () => {
    expect(source).toContain("process.execPath");
    expect(source).toContain("pnpm.cjs");
  });
});
