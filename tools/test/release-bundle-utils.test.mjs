import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  KERNEL_GENERATED_NODE_ASSETS,
  RELEASE_BUNDLE_NAME,
  RELEASE_BUNDLE_VERSION,
  createPnpmDeployInvocation,
  formatReleaseBundlePlan,
  parseReleaseBundleArgs,
  resolveReleaseBundlePlan,
  stageKernelGeneratedNodeAssets,
} from "../release-bundle-utils.mjs";
import { withSafeTempWorkspace } from "./safe-temp-workspace.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
// The expected version is derived from version.json, never hard-coded, so this
// suite stays correct across version bumps.
const CANONICAL_VERSION = JSON.parse(readFileSync(join(repoRoot, "version.json"), "utf8")).version;
const CANONICAL_BUNDLE_NAME = `oh-my-pm-v${CANONICAL_VERSION}`;
const outputs = [];

function makeOutput() {
  const dir = mkdtempSync(join(tmpdir(), "oh-my-pm-bundle-utils-"));
  outputs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of outputs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("constants", () => {
  it("derives the version and bundle name from version.json", () => {
    expect(RELEASE_BUNDLE_VERSION).toBe(CANONICAL_VERSION);
    expect(RELEASE_BUNDLE_NAME).toBe(CANONICAL_BUNDLE_NAME);
  });
});

describe("parseReleaseBundleArgs", () => {
  it("requires --output", () => {
    expect(parseReleaseBundleArgs([])).toMatchObject({ ok: false });
    expect(parseReleaseBundleArgs(["--apply"])).toMatchObject({ ok: false });
  });

  it("rejects a missing or duplicate output value", () => {
    expect(parseReleaseBundleArgs(["--output"])).toMatchObject({ ok: false });
    expect(parseReleaseBundleArgs(["--output", "a", "--output", "b"])).toMatchObject({ ok: false });
  });

  it("rejects unknown options, positionals, and force without apply", () => {
    expect(parseReleaseBundleArgs(["--output", "a", "--bad"])).toMatchObject({ ok: false });
    expect(parseReleaseBundleArgs(["--output", "a", "x"])).toMatchObject({ ok: false });
    expect(parseReleaseBundleArgs(["--output", "a", "--force"])).toMatchObject({ ok: false });
  });

  it("accepts apply, force, and json", () => {
    expect(parseReleaseBundleArgs(["--output", "a", "--apply", "--force", "--json"])).toEqual({
      ok: true,
      output: "a",
      apply: true,
      force: true,
      outputMode: "json",
    });
  });
});

describe("resolveReleaseBundlePlan", () => {
  it("reports a create action for a fresh output and lists prerequisites", () => {
    const plan = resolveReleaseBundlePlan({ output: makeOutput() });
    expect(plan.version).toBe(CANONICAL_VERSION);
    expect(plan.bundleName).toBe(CANONICAL_BUNDLE_NAME);
    expect(plan.prerequisites.length).toBeGreaterThan(10);
    // The workspace is built during the suite, so prerequisites should exist.
    expect(plan.ok).toBe(true);
    expect(plan.action).toBe("create");
  });

  it("blocks when the target bundle already exists without force", () => {
    const output = makeOutput();
    mkdirSync(join(output, RELEASE_BUNDLE_NAME), { recursive: true });
    const plan = resolveReleaseBundlePlan({ output });
    expect(plan.ok).toBe(false);
    expect(plan.action).toBe("blocked");
    expect(plan.reasons).toContain("release_bundle_exists");
  });

  it("replaces when the target exists with force", () => {
    const output = makeOutput();
    mkdirSync(join(output, RELEASE_BUNDLE_NAME), { recursive: true });
    const plan = resolveReleaseBundlePlan({ output, apply: true, force: true });
    expect(plan.ok).toBe(true);
    expect(plan.action).toBe("replace");
  });

  it("resolves prerequisite targets from the repository root and writes nothing", () => {
    const output = makeOutput();
    const plan = resolveReleaseBundlePlan({ output });
    for (const prerequisite of plan.prerequisites) {
      expect(prerequisite.path.startsWith(repoRoot)).toBe(true);
    }
    expect(existsSync(join(output, RELEASE_BUNDLE_NAME))).toBe(false);
  });
});

describe("formatReleaseBundlePlan", () => {
  it("renders a preview and valid JSON", () => {
    const plan = resolveReleaseBundlePlan({ output: makeOutput() });
    const preview = formatReleaseBundlePlan(plan, "brief");
    expect(preview).toContain("OH MY PM release bundle: preview");
    expect(preview).toContain("apply required: yes");
    const json = formatReleaseBundlePlan(plan, "json");
    expect(() => JSON.parse(json)).not.toThrow();
    expect(json.endsWith("\n")).toBe(true);
  });
});

describe("createPnpmDeployInvocation", () => {
  const expectedArgs = (out) => [
    "--filter",
    "@oh-my-pm/distribution",
    "--prod",
    "--config.node-linker=hoisted",
    "deploy",
    out,
  ];
  it("uses a shell on Windows and no shell on POSIX, with static hoisted args", () => {
    const win = createPnpmDeployInvocation("win32", "C:/tmp/out");
    expect(win.command).toBe("pnpm");
    expect(win.shell).toBe(true);
    expect(win.args).toEqual(expectedArgs("C:/tmp/out"));
    for (const platform of ["linux", "darwin"]) {
      const posix = createPnpmDeployInvocation(platform, "/tmp/out");
      expect(posix.command).toBe("pnpm");
      expect(posix.shell).toBe(false);
      expect(posix.args).toEqual(expectedArgs("/tmp/out"));
    }
  });

  it("forces a flat, symlink-free deployed tree via the hoisted node-linker", () => {
    const inv = createPnpmDeployInvocation("linux", "/tmp/out");
    expect(inv.args).toContain("--config.node-linker=hoisted");
  });
});

// A minimal, valid generated-node source directory and a deployed kernel
// package inside the bundle root. `deployed` lets a test omit or corrupt files
// to reproduce the platform-specific deploy gaps.
function scaffold(ws, deployed = {}) {
  const source = join(ws.root, "source-generated-node");
  mkdirSync(source, { recursive: true });
  const glue = 'const wasm = require("./oh_my_pm_kernel_bg.wasm");\nmodule.exports = wasm;\n';
  writeFileSync(join(source, "oh_my_pm_kernel.js"), glue, "utf8");
  writeFileSync(join(source, "oh_my_pm_kernel_bg.wasm"), Buffer.from([0, 97, 115, 109]));
  writeFileSync(
    join(source, "package.json"),
    `${JSON.stringify({ type: "commonjs", private: true }, null, 2)}\n`,
    "utf8",
  );

  const bundleRoot = join(ws.root, "bundle");
  const kernelPkg = join(bundleRoot, "node_modules", "@oh-my-pm", "kernel");
  mkdirSync(kernelPkg, { recursive: true });
  if (deployed.manifest !== false) {
    writeFileSync(
      join(kernelPkg, "package.json"),
      `${JSON.stringify(
        {
          name: deployed.name ?? "@oh-my-pm/kernel",
          version: deployed.version ?? RELEASE_BUNDLE_VERSION,
          type: "module",
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  }
  // Optionally pre-seed a partial/stale generated-node to mimic a real deploy.
  if (deployed.generated) {
    const gen = join(kernelPkg, "generated-node");
    mkdirSync(gen, { recursive: true });
    for (const [name, content] of Object.entries(deployed.generated)) {
      writeFileSync(join(gen, name), content, "utf8");
    }
  }
  return { source, bundleRoot, kernelPkg };
}

function stage(ws, deployed) {
  const { source, bundleRoot, kernelPkg } = scaffold(ws, deployed);
  return {
    result: stageKernelGeneratedNodeAssets({
      sourceGeneratedNodeDirectory: source,
      deployedKernelPackageDirectory: kernelPkg,
      bundleRoot,
    }),
    source,
    bundleRoot,
    kernelPkg,
  };
}

describe("stageKernelGeneratedNodeAssets", () => {
  it("copies the exact three assets into an initially empty destination", async () => {
    await withSafeTempWorkspace(async (ws) => {
      const { result, kernelPkg } = stage(ws, {});
      expect(result.ok, JSON.stringify(result)).toBe(true);
      const gen = join(kernelPkg, "generated-node");
      expect(readdirSync(gen).sort()).toEqual([...KERNEL_GENERATED_NODE_ASSETS].sort());
      expect(result.assets.map((a) => a.name).sort()).toEqual([...KERNEL_GENERATED_NODE_ASSETS].sort());
    });
  });

  it("repairs a WASM-only deployment (the observed Windows result)", async () => {
    await withSafeTempWorkspace(async (ws) => {
      const { result, kernelPkg } = stage(ws, {
        generated: { "oh_my_pm_kernel_bg.wasm": "OLD" },
      });
      expect(result.ok).toBe(true);
      const gen = join(kernelPkg, "generated-node");
      expect(readdirSync(gen).sort()).toEqual([...KERNEL_GENERATED_NODE_ASSETS].sort());
      expect(existsSync(join(gen, "oh_my_pm_kernel.js"))).toBe(true);
      expect(existsSync(join(gen, "package.json"))).toBe(true);
    });
  });

  it("repairs a JS-only deployment", async () => {
    await withSafeTempWorkspace(async (ws) => {
      const { result, kernelPkg } = stage(ws, { generated: { "oh_my_pm_kernel.js": "OLD" } });
      expect(result.ok).toBe(true);
      expect(existsSync(join(kernelPkg, "generated-node", "oh_my_pm_kernel_bg.wasm"))).toBe(true);
    });
  });

  it("replaces a stale generated manifest and removes unexpected files", async () => {
    await withSafeTempWorkspace(async (ws) => {
      const { result, kernelPkg } = stage(ws, {
        generated: { "package.json": '{"type":"module"}', "extra.txt": "stray" },
      });
      expect(result.ok).toBe(true);
      const gen = join(kernelPkg, "generated-node");
      expect(readdirSync(gen).sort()).toEqual([...KERNEL_GENERATED_NODE_ASSETS].sort());
      expect(existsSync(join(gen, "extra.txt"))).toBe(false);
      const manifest = JSON.parse(readFileSync(join(gen, "package.json"), "utf8"));
      expect(manifest).toEqual({ type: "commonjs", private: true });
    });
  });

  it("is idempotent and matches source hashes without mutating source", async () => {
    await withSafeTempWorkspace(async (ws) => {
      const { source, bundleRoot, kernelPkg } = scaffold(ws, {});
      const opts = {
        sourceGeneratedNodeDirectory: source,
        deployedKernelPackageDirectory: kernelPkg,
        bundleRoot,
      };
      const first = stageKernelGeneratedNodeAssets(opts);
      const sourceBefore = readdirSync(source).sort();
      const second = stageKernelGeneratedNodeAssets(opts);
      expect(first.ok && second.ok).toBe(true);
      expect(first.assets).toEqual(second.assets);
      expect(readdirSync(source).sort()).toEqual(sourceBefore);
    });
  });

  it("works when the bundle path contains spaces", async () => {
    await withSafeTempWorkspace(async (ws) => {
      const source = join(ws.root, "src gen");
      mkdirSync(source, { recursive: true });
      writeFileSync(join(source, "oh_my_pm_kernel.js"), 'require("./oh_my_pm_kernel_bg.wasm");\n', "utf8");
      writeFileSync(join(source, "oh_my_pm_kernel_bg.wasm"), Buffer.from([0, 97, 115, 109]));
      writeFileSync(join(source, "package.json"), '{"type":"commonjs","private":true}\n', "utf8");
      const bundleRoot = join(ws.root, "bundle root");
      const kernelPkg = join(bundleRoot, "node_modules", "@oh-my-pm", "kernel");
      mkdirSync(kernelPkg, { recursive: true });
      writeFileSync(
        join(kernelPkg, "package.json"),
        JSON.stringify({ name: "@oh-my-pm/kernel", version: RELEASE_BUNDLE_VERSION }),
        "utf8",
      );
      const result = stageKernelGeneratedNodeAssets({
        sourceGeneratedNodeDirectory: source,
        deployedKernelPackageDirectory: kernelPkg,
        bundleRoot,
      });
      expect(result.ok, JSON.stringify(result)).toBe(true);
    });
  });

  it("fails when a source asset is missing", async () => {
    for (const missing of KERNEL_GENERATED_NODE_ASSETS) {
      await withSafeTempWorkspace(async (ws) => {
        const { source, bundleRoot, kernelPkg } = scaffold(ws, {});
        rmSync(join(source, missing), { force: true });
        const result = stageKernelGeneratedNodeAssets({
          sourceGeneratedNodeDirectory: source,
          deployedKernelPackageDirectory: kernelPkg,
          bundleRoot,
        });
        expect(result.ok, missing).toBe(false);
        expect(result.code).toBe("kernel_binding_source_missing");
      });
    }
  });

  it("rejects a symlinked source asset", async () => {
    await withSafeTempWorkspace(async (ws) => {
      const { source, bundleRoot, kernelPkg } = scaffold(ws, {});
      const realTarget = join(ws.root, "elsewhere.js");
      writeFileSync(realTarget, "x", "utf8");
      rmSync(join(source, "oh_my_pm_kernel.js"), { force: true });
      symlinkSync(realTarget, join(source, "oh_my_pm_kernel.js"));
      const result = stageKernelGeneratedNodeAssets({
        sourceGeneratedNodeDirectory: source,
        deployedKernelPackageDirectory: kernelPkg,
        bundleRoot,
      });
      expect(result.ok).toBe(false);
      expect(result.code).toBe("kernel_binding_source_unsafe");
    });
  });

  it("fails when the deployed kernel package is missing", async () => {
    await withSafeTempWorkspace(async (ws) => {
      const { result } = stage(ws, { manifest: false });
      expect(result.ok).toBe(false);
      expect(result.code).toBe("kernel_binding_package_missing");
    });
  });

  it("fails on wrong deployed package name or version", async () => {
    await withSafeTempWorkspace(async (ws) => {
      const bad = stage(ws, { name: "@oh-my-pm/other" });
      expect(bad.result.ok).toBe(false);
      expect(bad.result.code).toBe("kernel_binding_package_invalid");
    });
    await withSafeTempWorkspace(async (ws) => {
      const bad = stage(ws, { version: "9.9.9" });
      expect(bad.result.ok).toBe(false);
      expect(bad.result.code).toBe("kernel_binding_package_invalid");
    });
  });

  it("rejects a destination generated-node that is an external symlink", async () => {
    await withSafeTempWorkspace(async (ws) => {
      const { source, bundleRoot, kernelPkg } = scaffold(ws, {});
      const outside = join(ws.root, "outside-generated");
      mkdirSync(outside, { recursive: true });
      symlinkSync(outside, join(kernelPkg, "generated-node"));
      const result = stageKernelGeneratedNodeAssets({
        sourceGeneratedNodeDirectory: source,
        deployedKernelPackageDirectory: kernelPkg,
        bundleRoot,
      });
      expect(result.ok).toBe(false);
      expect(result.code).toBe("kernel_binding_destination_unsafe");
    });
  });

  it("rejects a deployed package that escapes the bundle root via symlink", async () => {
    await withSafeTempWorkspace(async (ws) => {
      const { source } = scaffold(ws, {});
      // A kernel package dir that is a symlink pointing outside the bundle root.
      const outsidePkg = join(ws.root, "outside-kernel");
      mkdirSync(outsidePkg, { recursive: true });
      writeFileSync(
        join(outsidePkg, "package.json"),
        JSON.stringify({ name: "@oh-my-pm/kernel", version: RELEASE_BUNDLE_VERSION }),
        "utf8",
      );
      const bundleRoot = join(ws.root, "escape-bundle");
      const linkPkgParent = join(bundleRoot, "node_modules", "@oh-my-pm");
      mkdirSync(linkPkgParent, { recursive: true });
      symlinkSync(outsidePkg, join(linkPkgParent, "kernel"));
      const result = stageKernelGeneratedNodeAssets({
        sourceGeneratedNodeDirectory: source,
        deployedKernelPackageDirectory: join(linkPkgParent, "kernel"),
        bundleRoot,
      });
      expect(result.ok).toBe(false);
      expect(result.code).toBe("kernel_binding_destination_unsafe");
    });
  });

  it("rejects glue that does not reference the sibling WASM", async () => {
    await withSafeTempWorkspace(async (ws) => {
      const { source, bundleRoot, kernelPkg } = scaffold(ws, {});
      writeFileSync(join(source, "oh_my_pm_kernel.js"), "module.exports = {};\n", "utf8");
      const result = stageKernelGeneratedNodeAssets({
        sourceGeneratedNodeDirectory: source,
        deployedKernelPackageDirectory: kernelPkg,
        bundleRoot,
      });
      expect(result.ok).toBe(false);
      expect(result.code).toBe("kernel_binding_glue_invalid");
    });
  });

  it("rejects a malformed generated package manifest in the source", async () => {
    await withSafeTempWorkspace(async (ws) => {
      const { source, bundleRoot, kernelPkg } = scaffold(ws, {});
      writeFileSync(join(source, "package.json"), '{"type":"module","private":true}\n', "utf8");
      const result = stageKernelGeneratedNodeAssets({
        sourceGeneratedNodeDirectory: source,
        deployedKernelPackageDirectory: kernelPkg,
        bundleRoot,
      });
      expect(result.ok).toBe(false);
      expect(result.code).toBe("kernel_binding_manifest_invalid");
    });
  });

  it("never leaks absolute source paths or file contents in error output", async () => {
    await withSafeTempWorkspace(async (ws) => {
      const { source, bundleRoot, kernelPkg } = scaffold(ws, {});
      rmSync(join(source, "oh_my_pm_kernel.js"), { force: true });
      const result = stageKernelGeneratedNodeAssets({
        sourceGeneratedNodeDirectory: source,
        deployedKernelPackageDirectory: kernelPkg,
        bundleRoot,
      });
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain(source);
      expect(serialized).not.toContain(ws.root);
    });
  });
});
