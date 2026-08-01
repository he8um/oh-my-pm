// Static purity check: CLI core sources must not perform I/O or reach for
// nondeterministic APIs. Reading source files here is allowed only for this
// static test.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

// v0.5.1: the Markdown document loader, the project configuration loader, and
// the provider configuration loader moved to @oh-my-pm/application/node, which
// enforces its own boundary. The only Node read boundary left in the CLI is the
// mcp-config existence probe: one read-only lstat, no content read.
const NODE_BOUNDARY_FILES = new Set(["mcp-config-resolve.ts"]);

// v0.5.2: the CLI no longer has a GitHub boundary file. The token read, the
// production transport construction, and the Runtime composition all moved
// behind @oh-my-pm/application and its Node boundary, so github-process.ts and
// local-process.ts are both held to the strictest rules — including no
// process.env, no real clock, and no transport construction.

// v0.5.1: the memory process boundary moved to @oh-my-pm/application, which
// enforces its own boundary. The CLI now only parses the memory grammar and
// renders the typed outcome.

const FS_READ_IMPORTS = [
  'from "fs"',
  'from "node:fs"',
  'require("fs")',
  "fs.",
  "node:fs",
];

const WRITE_APIS = [
  "writeFile",
  "appendFile",
  "createWriteStream",
  "mkdir",
  "rmSync",
  "rmdir",
  "unlink",
  "rename",
  "copyFile",
  "chmod",
  "chown",
];

// Node filesystem usage is matched precisely because the installer preview
// legitimately uses adapter names containing the word "filesystem".
const FORBIDDEN = [
  "process.env",
  "process.exit",
  "child_process",
  "fetch(",
  "XMLHttpRequest",
  "Date.now",
  "new Date",
  "Math.random",
  "crypto.randomUUID",
  "console.",
  "createWriteStream",
  "archiver",
  "zlib",
  "AdmZip",
  "JSZip",
  "node:crypto",
  "subtle",
  "generateKey",
  "sign(",
  "verify(",
  "privateKey",
  "publicKey",
  "BEGIN PRIVATE KEY",
  "BEGIN PUBLIC KEY",
  "BEGIN CERTIFICATE",
  "http://",
  "https://",
  "publish",
  "upload",
  "download",
  "cdn",
  "bucket",
  "registry",
  "executeInstall",
  "executeRollback",
];

describe("cli purity", () => {
  it("source files contain no I/O or nondeterministic APIs", () => {
    const files = readdirSync(srcDir).filter((f) => f.endsWith(".ts"));
    expect(files.length).toBeGreaterThanOrEqual(8);
    for (const file of files) {
      const contents = readFileSync(join(srcDir, file), "utf8");
      let forbiddenForFile: string[];
      if (NODE_BOUNDARY_FILES.has(file)) {
        forbiddenForFile = [...FORBIDDEN, ...WRITE_APIS];
      } else {
        forbiddenForFile = [...FS_READ_IMPORTS, ...FORBIDDEN, ...WRITE_APIS];
      }
      for (const forbidden of forbiddenForFile) {
        expect(contents, `${file} must not contain "${forbidden}"`).not.toContain(forbidden);
      }
    }
  });

  it("keeps the remaining node boundary read-only and network-free", () => {
    for (const file of NODE_BOUNDARY_FILES) {
      const contents = readFileSync(join(srcDir, file), "utf8");
      for (const forbidden of ["node:http", "node:https", "node:net", "node:child_process"]) {
        expect(contents, `${file} must not contain "${forbidden}"`).not.toContain(forbidden);
      }
      expect(contents, `${file} should be the read-only fs boundary`).toContain('from "node:fs"');
    }
  });

  it("no longer owns shared project loading or memory orchestration", () => {
    // v0.5.1: these responsibilities live in @oh-my-pm/application. If a file
    // with one of these names reappears under cli/src, application logic is
    // being reintroduced into the presentation adapter.
    const files = new Set(readdirSync(srcDir));
    for (const moved of [
      "node-project-documents.ts",
      "project-config.ts",
      "provider-config.ts",
      "project-document-rules.ts",
      "provider-diagnostics.ts",
      "memory-process.ts",
      "memory-project.ts",
      "memory-preview.ts",
      "memory-types.ts",
      "request.ts",
      "github-token.ts",
    ]) {
      expect(files.has(moved), `${moved} belongs to @oh-my-pm/application`).toBe(false);
    }
  });
});
