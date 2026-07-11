// Static purity check: CLI core sources must not perform I/O or reach for
// nondeterministic APIs. Reading source files here is allowed only for this
// static test.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

// Node filesystem usage is matched precisely because the installer preview
// legitimately uses adapter names containing the word "filesystem".
const FORBIDDEN = [
  'from "fs"',
  'from "node:fs"',
  'require("fs")',
  "fs.",
  "node:fs",
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
];

describe("cli purity", () => {
  it("source files contain no I/O or nondeterministic APIs", () => {
    const files = readdirSync(srcDir).filter((f) => f.endsWith(".ts"));
    expect(files.length).toBeGreaterThanOrEqual(7);
    for (const file of files) {
      const contents = readFileSync(join(srcDir, file), "utf8");
      for (const forbidden of FORBIDDEN) {
        expect(contents, `${file} must not contain "${forbidden}"`).not.toContain(forbidden);
      }
    }
  });
});
