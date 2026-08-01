// Project Memory is imported only lazily, on the memory path.
//
// The Node Project Memory adapter must never be resolved at startup: legacy
// offline commands and a bundle profile without Project Memory must both keep
// working. The only permitted reference is the dynamic import inside the memory
// orchestrator. Moved here from cli/test in v0.5.1 along with the orchestrator.

import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(packageDir, "src");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("Project Memory is imported only lazily on the memory path", () => {
  const memoryProcessSource = readFileSync(join(srcDir, "memory-process.ts"), "utf8");

  it("uses a dynamic import of @oh-my-pm/project-memory", () => {
    expect(memoryProcessSource).toContain('import("@oh-my-pm/project-memory")');
  });

  it("does not statically import @oh-my-pm/project-memory anywhere", () => {
    for (const file of sourceFiles(srcDir)) {
      const contents = readFileSync(file, "utf8");
      // A static import specifier is `from "@oh-my-pm/project-memory"`. The
      // dynamic `import("@oh-my-pm/project-memory")` form is the only allowed
      // use, so a bundle without Project Memory still starts.
      expect(
        contents,
        `${relative(srcDir, file)} must not statically import project-memory`,
      ).not.toContain('from "@oh-my-pm/project-memory"');
    }
  });

  it("takes project-memory as a runtime dependency reached only via lazy import", () => {
    const pkg = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.["@oh-my-pm/project-memory"]).toBe("workspace:*");
    expect(pkg.devDependencies?.["@oh-my-pm/project-memory"]).toBeUndefined();
  });
});
