// Static purity check: CLI core sources must not perform I/O or reach for
// nondeterministic APIs. Reading source files here is allowed only for this
// static test.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

// The Markdown project document loader and the project configuration loader
// are the explicit Node read-only boundaries in the CLI package: they may
// import node:fs and node:path to read, but they must never write, spawn, or
// reach the network. The pure document-rule module has no Node imports.
const NODE_BOUNDARY_FILE = "node-project-documents.ts";
const NODE_BOUNDARY_FILES = new Set([
  NODE_BOUNDARY_FILE,
  "project-config.ts",
  "provider-config.ts",
]);

// The CLI process adapter is the approved GitHub boundary: only it may read the
// ambient environment (for the optional OH_MY_PM_GITHUB_TOKEN) and construct the
// production GitHub transport, and it does so only on the explicit github
// command. It is still forbidden filesystem writes and all other I/O markers.
const GITHUB_BOUNDARY_FILE = "local-process.ts";

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
      if (file === GITHUB_BOUNDARY_FILE) {
        // The process adapter may read the ambient environment for the token
        // and may reference the fixed GitHub origin indirectly through the
        // provider factory, but it must never write files, spawn processes, or
        // fetch directly. It performs no filesystem read of documents itself.
        forbiddenForFile = [
          ...WRITE_APIS,
          "child_process",
          "fetch(",
          "XMLHttpRequest",
          "Date.now",
          "new Date",
          "Math.random",
          "console.",
          "executeInstall",
          "executeRollback",
        ];
      } else if (NODE_BOUNDARY_FILES.has(file)) {
        forbiddenForFile = [...FORBIDDEN, ...WRITE_APIS];
      } else {
        forbiddenForFile = [...FS_READ_IMPORTS, ...FORBIDDEN, ...WRITE_APIS];
      }
      for (const forbidden of forbiddenForFile) {
        expect(contents, `${file} must not contain "${forbidden}"`).not.toContain(forbidden);
      }
    }
  });

  it("keeps the node boundary file read-only and network-free", () => {
    const contents = readFileSync(join(srcDir, NODE_BOUNDARY_FILE), "utf8");
    for (const forbidden of ["node:http", "node:https", "node:net", "node:child_process"]) {
      expect(contents, `boundary must not contain "${forbidden}"`).not.toContain(forbidden);
    }
    expect(contents).toContain('from "node:fs"');
  });
});
