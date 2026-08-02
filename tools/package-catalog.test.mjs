// Mutation tests for the v0.5.4 package catalog and boundary guards.
//
// Same discipline as tools/docs-manifest.test.mjs: a guard that has never been
// observed to FAIL is not evidence of anything. Each case introduces exactly one
// violation into a disposable copy of the workspace, asserts validate-packages
// rejects it with that guard's specific message, then asserts the unmutated copy
// passes.
//
// This matters more than usual here, because every one of these guards passed on
// its first run against the real tree -- the structure was already correct. Only
// a proven-failing guard distinguishes "enforced" from "vacuously true".
//
// Fixture content is read from the git INDEX, never the working tree, so the
// suite is unaffected by any other suite's temporary edits under Vitest file
// parallelism.

import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const roots = [];

afterEach(() => {
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Committed bytes for a path, or null when untracked. */
function committed(rel) {
  const r = spawnSync("git", ["show", `:${rel}`], {
    cwd: repoRoot,
    encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024,
  });
  return r.status === 0 ? r.stdout : null;
}
const committedText = (rel) => committed(rel)?.toString("utf8") ?? null;

/** A disposable git repo with the manifests, sources, and tools under test. */
function fixtureRepo() {
  const root = mkdtempSync(join(tmpdir(), "oh-my-pm-packages-"));
  roots.push(root);

  const files = ["packages.json", "pnpm-workspace.yaml", "command-surface.json"];
  const dirs = [...committedText("pnpm-workspace.yaml").matchAll(/^\s*-\s*"([^"]+)"/gm)].map(
    (m) => m[1],
  );
  for (const dir of dirs) {
    files.push(`${dir}/package.json`, `${dir}/README.md`);
  }
  for (const tool of ["validate-packages.mjs", "package-catalog.mjs", "command-surface.mjs"]) {
    files.push(`tools/${tool}`);
  }
  // Every tracked TypeScript source, so the import and side-effect guards have
  // real code to scan.
  const tracked = execFileSync("git", ["ls-files", "*.ts"], { cwd: repoRoot, encoding: "utf8" })
    .split("\n")
    .filter((l) => l.length > 0 && dirs.some((d) => l.startsWith(`${d}/`)));
  files.push(...tracked);

  for (const rel of [...new Set(files)]) {
    const content = committed(rel);
    if (content === null) continue;
    const dest = join(root, rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, content);
  }

  execFileSync("git", ["init", "--quiet"], { cwd: root });
  execFileSync("git", ["add", "-A"], { cwd: root });
  return root;
}

function validate(root) {
  const r = spawnSync(process.execPath, [join(root, "tools", "validate-packages.mjs")], {
    cwd: root,
    encoding: "utf8",
  });
  return { status: r.status, output: `${r.stdout}${r.stderr}` };
}

const readFixture = (root, rel) => readFileSync(join(root, rel), "utf8");
const writeFixture = (root, rel, text) => {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
  execFileSync("git", ["add", "-A"], { cwd: root });
};
const patchJson = (root, rel, mutate) => {
  const value = JSON.parse(readFixture(root, rel));
  mutate(value);
  writeFixture(root, rel, `${JSON.stringify(value, null, 2)}\n`);
};

describe("validate-packages on the committed workspace", () => {
  it("passes, and reports the package and layer counts", () => {
    const result = validate(fixtureRepo());
    expect(result.output).toContain("validate-packages: OK");
    expect(result.output).toContain("no cycles");
    expect(result.status).toBe(0);
  });
});

describe("cycle detection", () => {
  it("rejects a production dependency cycle", () => {
    const root = fixtureRepo();
    expect(validate(root).status).toBe(0);

    // contracts depends on nothing; making it depend on runtime closes a loop
    // runtime -> contracts -> runtime.
    patchJson(root, "contracts/package.json", (pkg) => {
      pkg.dependencies = { ...(pkg.dependencies ?? {}), "@oh-my-pm/runtime": "workspace:*" };
    });

    const after = validate(root);
    expect(after.status).toBe(1);
    expect(after.output).toContain("production dependency cycle");
  });

  it("does not report a dev-only edge as a cycle", () => {
    // runtime devDepends on project-memory. A dev edge is not a runtime cycle,
    // and reporting it as one would force a false restructuring.
    const root = fixtureRepo();
    patchJson(root, "project-memory/package.json", (pkg) => {
      pkg.devDependencies = { ...(pkg.devDependencies ?? {}), "@oh-my-pm/runtime": "workspace:*" };
    });
    const after = validate(root);
    expect(after.output).not.toContain("production dependency cycle");
  });
});

describe("dependency allowance and layer direction", () => {
  it("rejects a dependency outside the catalogued allowance", () => {
    const root = fixtureRepo();
    expect(validate(root).status).toBe(0);

    patchJson(root, "skills/package.json", (pkg) => {
      pkg.dependencies = { ...(pkg.dependencies ?? {}), "@oh-my-pm/planner": "workspace:*" };
    });

    const after = validate(root);
    expect(after.status).toBe(1);
    expect(after.output).toMatch(/not in .* allowed set|HIGHER layer/);
  });

  it("rejects a forbidden inversion outright", () => {
    const root = fixtureRepo();
    patchJson(root, "application/package.json", (pkg) => {
      pkg.dependencies = { ...(pkg.dependencies ?? {}), "@oh-my-pm/cli": "workspace:*" };
    });

    const after = validate(root);
    expect(after.status).toBe(1);
    expect(after.output).toContain("forbidden dependency @oh-my-pm/cli");
  });

  it("rejects a dependency pointing up the layer order", () => {
    const root = fixtureRepo();
    // Let the catalog allow it, so ONLY the layer rule can catch it.
    patchJson(root, "packages.json", (catalog) => {
      const providers = catalog.packages.find((p) => p.name === "@oh-my-pm/providers");
      providers.allowed.push("@oh-my-pm/runtime");
      providers.forbidden = providers.forbidden.filter((f) => f !== "@oh-my-pm/runtime");
    });
    patchJson(root, "providers/package.json", (pkg) => {
      pkg.dependencies = { ...(pkg.dependencies ?? {}), "@oh-my-pm/runtime": "workspace:*" };
    });

    const after = validate(root);
    expect(after.status).toBe(1);
    expect(after.output).toContain("HIGHER layer");
  });
});

describe("import guards", () => {
  it("rejects reaching inside another package's src", () => {
    const root = fixtureRepo();
    expect(validate(root).status).toBe(0);

    writeFixture(
      root,
      "runtime/src/leak.ts",
      'import { thing } from "@oh-my-pm/providers/src/internal.js";\nexport const x = thing;\n',
    );

    const after = validate(root);
    expect(after.status).toBe(1);
    expect(after.output).toContain("reaching inside another package");
  });

  it("rejects a relative import that escapes into another package", () => {
    const root = fixtureRepo();
    writeFixture(
      root,
      "runtime/src/escape.ts",
      'import { thing } from "../../providers/src/index.js";\nexport const x = thing;\n',
    );

    const after = validate(root);
    expect(after.status).toBe(1);
    expect(after.output).toMatch(/relative path|reaching inside another package/);
  });

  it("rejects importing a workspace package that is not declared", () => {
    const root = fixtureRepo();
    // skills declares only contracts.
    writeFixture(
      root,
      "skills/src/undeclared.ts",
      'import { createRuntime } from "@oh-my-pm/runtime";\nexport const x = createRuntime;\n',
    );

    const after = validate(root);
    expect(after.status).toBe(1);
    expect(after.output).toContain("does not declare it");
  });

  it("does not treat a package name inside an assertion string as an import", () => {
    // A boundary test proves a package is ABSENT by naming it in an array.
    // Reporting that as an import would be exactly backwards.
    const root = fixtureRepo();
    writeFixture(
      root,
      "skills/test/boundary.test.ts",
      'const forbidden = ["@oh-my-pm/cli", "@oh-my-pm/mcp-server"];\nexport { forbidden };\n',
    );

    const after = validate(root);
    expect(after.output).not.toContain("skills/test/boundary.test.ts");
  });
});

describe("process side-effect guards", () => {
  it("rejects console output from a package below presentation", () => {
    const root = fixtureRepo();
    expect(validate(root).status).toBe(0);

    writeFixture(
      root,
      "skills/src/noisy.ts",
      'export function shout(): void {\n  console.log("hello");\n}\n',
    );

    const after = validate(root);
    expect(after.status).toBe(1);
    expect(after.output).toContain("does not declare the");
    expect(after.output).toContain("stdout");
  });

  it("rejects process.exit from the application layer", () => {
    const root = fixtureRepo();
    writeFixture(
      root,
      "application/src/bail.ts",
      "export function bail(): void {\n  process.exit(1);\n}\n",
    );

    const after = validate(root);
    expect(after.status).toBe(1);
    expect(after.output).toContain("process.exit");
  });

  it("allows the CLI to write to stdout, because it declares the effect", () => {
    const root = fixtureRepo();
    writeFixture(
      root,
      "cli/src/print.ts",
      'export function print(): void {\n  console.log("output");\n}\n',
    );

    expect(validate(root).status).toBe(0);
  });
});

describe("catalog and workspace agreement", () => {
  it("rejects a workspace package missing from the catalog", () => {
    const root = fixtureRepo();
    patchJson(root, "packages.json", (catalog) => {
      catalog.packages = catalog.packages.filter((p) => p.name !== "@oh-my-pm/skills");
    });

    const after = validate(root);
    expect(after.status).toBe(1);
    expect(after.output).toContain("is a workspace package but is not catalogued");
  });

  it("rejects a catalogued package that does not exist", () => {
    const root = fixtureRepo();
    patchJson(root, "packages.json", (catalog) => {
      catalog.packages.push({
        name: "@oh-my-pm/ghost",
        path: "ghost",
        role: "capability",
        responsibilities: [],
        nonResponsibilities: [],
        entryPoints: ["."],
        allowed: [],
        forbidden: [],
        sideEffects: [],
        dataOwnership: "none",
        inBundle: false,
        compatibility: "none",
        testOwnership: "ghost/test",
      });
    });

    const after = validate(root);
    expect(after.status).toBe(1);
    expect(after.output).toMatch(/ghost\/package\.json does not exist|not a workspace package/);
  });

  it("rejects an entry-point set that disagrees with the manifest", () => {
    const root = fixtureRepo();
    patchJson(root, "packages.json", (catalog) => {
      catalog.packages.find((p) => p.name === "@oh-my-pm/application").entryPoints = ["."];
    });

    const after = validate(root);
    expect(after.status).toBe(1);
    expect(after.output).toContain("but the catalog declares");
  });

  it("rejects an inBundle claim that contradicts the release closure", () => {
    const root = fixtureRepo();
    patchJson(root, "packages.json", (catalog) => {
      catalog.packages.find((p) => p.name === "@oh-my-pm/examples").inBundle = true;
    });

    const after = validate(root);
    expect(after.status).toBe(1);
    expect(after.output).toContain("production closure says");
  });

  it("rejects a missing package README", () => {
    const root = fixtureRepo();
    rmSync(join(root, "skills/README.md"));
    execFileSync("git", ["add", "-A"], { cwd: root });

    const after = validate(root);
    expect(after.status).toBe(1);
    expect(after.output).toContain("README.md is missing");
  });

  it("rejects an unknown role or side effect", () => {
    const root = fixtureRepo();
    patchJson(root, "packages.json", (catalog) => {
      catalog.packages.find((p) => p.name === "@oh-my-pm/skills").role = "wizardry";
    });

    const after = validate(root);
    expect(after.status).toBe(1);
    expect(after.output).toContain("role must be one of");
  });

  it("rejects a package both allowed and forbidden", () => {
    const root = fixtureRepo();
    patchJson(root, "packages.json", (catalog) => {
      catalog.packages
        .find((p) => p.name === "@oh-my-pm/planner")
        .forbidden.push("@oh-my-pm/contracts");
    });

    const after = validate(root);
    expect(after.status).toBe(1);
    expect(after.output).toContain("both allowed and forbidden");
  });
});
