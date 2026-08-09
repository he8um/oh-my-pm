import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  chmodSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { describeSubprocessResult } from "./test-subprocess-diagnostics.mjs";
import {
  evaluatePostInstallState,
  requiresPosixShimExecutableMode,
  resolveReleaseInstallPlan,
} from "../distribution/libexec/release-install-core.mjs";
import { createInstalledCommandInvocation } from "./check-release-install.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const buildBundle = join(repoRoot, "tools", "build-release-bundle.mjs");
const wrapper = join(repoRoot, "tools", "install-release-bundle.mjs");
const installedCheck = join(repoRoot, "tools", "check-release-install.mjs");

const CANONICAL_VERSION = JSON.parse(readFileSync(join(repoRoot, "version.json"), "utf8")).version;
const BUNDLE_NAME = `oh-my-pm-v${CANONICAL_VERSION}`;
const isWindows = process.platform === "win32";

const roots = [];
function tempDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  roots.push(dir);
  return dir;
}
function run(script, args) {
  const r = spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
  return {
    status: r.status,
    stdout: r.stdout,
    stderr: r.stderr,
    diagnostics: describeSubprocessResult(script, args, r),
  };
}

/** Assert a fixture subprocess succeeded, surfacing its full diagnostics. */
function expectFixtureSuccess(result) {
  expect(result.status, result.diagnostics).toBe(0);
}
function installBundle() {
  // Build a fresh bundle outside the repository so tests exercise source
  // independence, then relocate it to a location the source repo does not own.
  // Returns the bundle directory plus the exact owned root that contains it, so
  // "source removal" tests delete that exact root — never an inferred parent.
  const out = tempDir("omp-e2e-build-");
  expectFixtureSuccess(run(buildBundle, ["--output", out, "--apply"]));
  const root = tempDir("omp-e2e-bundle-");
  const dir = join(root, BUNDLE_NAME);
  renameSync(join(out, BUNDLE_NAME), dir);
  return { dir, root };
}

let bundle;

beforeAll(() => {
  bundle = installBundle();
}, 240_000);

afterAll(() => {
  for (const dir of roots.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("release install e2e", () => {
  it("preview creates no prefix", () => {
    const prefix = join(tempDir("omp-e2e-prev-"), "prefix");
    const preview = run(wrapper, ["--bundle", bundle.dir, "--prefix", prefix]);
    expect(preview.status, preview.stderr).toBe(0);
    expect(preview.stdout).toContain("action: create");
    expect(existsSync(prefix)).toBe(false);
  }, 60_000);

  it("apply creates the canonical layout and installs from a source that can be removed", () => {
    const parent = tempDir("omp-e2e-apply-");
    const prefix = join(parent, "prefix");

    const apply = run(wrapper, ["--bundle", bundle.dir, "--prefix", prefix, "--apply"]);
    expect(apply.status, apply.stderr).toBe(0);

    // Canonical layout.
    const versionDir = join(prefix, "lib", "oh-my-pm", "versions", CANONICAL_VERSION);
    expect(existsSync(versionDir)).toBe(true);
    for (const shim of ["oh-my-pm", "oh-my-pm.cmd", "oh-my-pm-mcp", "oh-my-pm-mcp.cmd"]) {
      expect(existsSync(join(prefix, "bin", shim)), shim).toBe(true);
    }
    const manifest = JSON.parse(
      readFileSync(join(prefix, "lib", "oh-my-pm", "install.json"), "utf8"),
    );
    expect(manifest.version).toBe(CANONICAL_VERSION);
    expect(manifest.activeVersion).toBe(CANONICAL_VERSION);

    // POSIX shims executable.
    if (!isWindows) {
      for (const shim of ["oh-my-pm", "oh-my-pm-mcp"]) {
        expect((lstatSync(join(prefix, "bin", shim)).mode & 0o111) !== 0, shim).toBe(true);
      }
    }

    // Installed-state verifier passes.
    const check = run(installedCheck, ["--prefix", prefix]);
    expect(check.stderr, check.stderr).toBe("");
    expect(check.status).toBe(0);
    expect(check.stdout).toBe(`OH MY PM release installation check: OK (${CANONICAL_VERSION})\n`);

    // Manifest embeds no absolute path.
    const manifestText = readFileSync(join(prefix, "lib", "oh-my-pm", "install.json"), "utf8");
    expect(manifestText).not.toMatch(/\/Users\/|\/home\/|[A-Z]:\\/);
  }, 120_000);

  it("keeps the source bundle unchanged after apply", () => {
    const prefix = join(tempDir("omp-e2e-srcstable-"), "prefix");
    // The shared bundle is only read here, never removed.
    const before = readFileSync(join(bundle.dir, "SHA256SUMS"), "utf8");
    expect(run(wrapper, ["--bundle", bundle.dir, "--prefix", prefix, "--apply"]).status).toBe(0);
    const after = readFileSync(join(bundle.dir, "SHA256SUMS"), "utf8");
    expect(after).toBe(before);
  }, 120_000);

  it("installed commands survive source removal and full prefix relocation", () => {
    const localBundle = installBundle();
    const parent = tempDir("omp-e2e-reloc-");
    const prefix = join(parent, "prefix");
    expect(run(wrapper, ["--bundle", localBundle.dir, "--prefix", prefix, "--apply"]).status).toBe(
      0,
    );

    // Remove the source bundle entirely by deleting its exact owned root
    // (never an inferred parent of the bundle directory).
    rmSync(localBundle.root, { recursive: true, force: true });

    const cliCmd = join(prefix, "bin", isWindows ? "oh-my-pm.cmd" : "oh-my-pm");
    const status = spawnSync(cliCmd, ["status"], { encoding: "utf8" });
    expect(status.stdout).toContain(`version: ${CANONICAL_VERSION}`);
    expect(status.stdout).toContain(`kernel: ${CANONICAL_VERSION}`);

    // Relocate the entire prefix and re-run through the relative shims.
    const movedParent = tempDir("omp-e2e-reloc-moved-");
    const movedPrefix = join(movedParent, "prefix");
    renameSync(prefix, movedPrefix);
    const movedCli = join(movedPrefix, "bin", isWindows ? "oh-my-pm.cmd" : "oh-my-pm");
    const movedStatus = spawnSync(movedCli, ["status"], { encoding: "utf8" });
    expect(movedStatus.stdout).toContain(`version: ${CANONICAL_VERSION}`);

    // Installed-state verifier passes from the moved prefix.
    expect(run(installedCheck, ["--prefix", movedPrefix]).status).toBe(0);
  }, 180_000);

  it("is idempotent: a second apply from the same bundle is already-installed and writes nothing new", () => {
    const parent = tempDir("omp-e2e-idem-");
    const prefix = join(parent, "prefix");
    expect(run(wrapper, ["--bundle", bundle.dir, "--prefix", prefix, "--apply"]).status).toBe(0);
    const manifestBefore = readFileSync(join(prefix, "lib", "oh-my-pm", "install.json"), "utf8");

    const second = run(wrapper, ["--bundle", bundle.dir, "--prefix", prefix, "--apply"]);
    expect(second.status, second.stderr).toBe(0);
    expect(second.stdout).toContain("already installed");
    const manifestAfter = readFileSync(join(prefix, "lib", "oh-my-pm", "install.json"), "utf8");
    expect(manifestAfter).toBe(manifestBefore);
  }, 120_000);

  it("blocks drift without --force and preserves unrelated prefix files under --force", () => {
    const parent = tempDir("omp-e2e-force-");
    const prefix = join(parent, "prefix");
    const localBundle = bundle.dir;
    expect(run(wrapper, ["--bundle", localBundle, "--prefix", prefix, "--apply"]).status).toBe(0);

    // Unrelated files that force must preserve.
    writeFileSync(join(prefix, "bin", "unrelated-tool"), "keepme\n");
    mkdirSync(join(prefix, "lib", "other"), { recursive: true });
    writeFileSync(join(prefix, "lib", "other", "note.txt"), "unrelated\n");

    // Introduce drift in a managed shim.
    writeFileSync(join(prefix, "bin", "oh-my-pm"), "corrupted\n");

    // Blocked without force. A plan that fails to resolve is rendered to stdout
    // (action: blocked) and exits 2; the stderr "blocked" line is reserved for a
    // block detected inside apply-time revalidation.
    const blocked = run(wrapper, ["--bundle", localBundle, "--prefix", prefix, "--apply"]);
    expect(blocked.status).toBe(2);
    expect(`${blocked.stdout}${blocked.stderr}`).toContain("blocked");

    // Force replaces exact managed targets only.
    const forced = run(wrapper, [
      "--bundle",
      localBundle,
      "--prefix",
      prefix,
      "--apply",
      "--force",
    ]);
    expect(forced.status, forced.stderr).toBe(0);

    // Unrelated files preserved.
    expect(readFileSync(join(prefix, "bin", "unrelated-tool"), "utf8")).toBe("keepme\n");
    expect(readFileSync(join(prefix, "lib", "other", "note.txt"), "utf8")).toBe("unrelated\n");

    // Managed shim repaired and install verifies.
    expect(readFileSync(join(prefix, "bin", "oh-my-pm"), "utf8").startsWith("#!/bin/sh")).toBe(
      true,
    );
    expect(run(installedCheck, ["--prefix", prefix]).status).toBe(0);
  }, 240_000);

  it("does not create shell profiles, MCP client config, or project files", () => {
    const parent = tempDir("omp-e2e-noextra-");
    const prefix = join(parent, "prefix");
    expect(run(wrapper, ["--bundle", bundle.dir, "--prefix", prefix, "--apply"]).status).toBe(0);
    // Only bin/ and lib/ appear directly under the prefix.
    const top = readdirSync(prefix).sort();
    expect(top).toEqual(["bin", "lib"]);
  }, 120_000);
});

// The Windows-only post_install_verification_failed regression: the installer
// intentionally does not chmod POSIX shims on Windows, so exact-state detection
// and post-install verification must not require the POSIX executable bit there,
// while still enforcing it on Linux/macOS. This test runs on every platform by
// injecting the target platform, so it protects the fix regardless of the host.
describe("platform-aware installed-state (post_install regression)", () => {
  const posixShims = ["oh-my-pm", "oh-my-pm-mcp"];

  it("exposes the platform executable-mode policy", () => {
    expect(requiresPosixShimExecutableMode("win32")).toBe(false);
    expect(requiresPosixShimExecutableMode("linux")).toBe(true);
    expect(requiresPosixShimExecutableMode("darwin")).toBe(true);
  });

  it("classifies a valid install as already-installed on Windows without POSIX exec bits", () => {
    const prefix = join(tempDir("omp-e2e-plat-"), "prefix");
    expect(run(wrapper, ["--bundle", bundle.dir, "--prefix", prefix, "--apply"]).status).toBe(0);

    const winPlan = resolveReleaseInstallPlan({
      bundleRoot: bundle.dir,
      prefix,
      apply: false,
      force: false,
      platform: "win32",
    });
    expect(winPlan.ok, JSON.stringify(winPlan.reasons)).toBe(true);
    expect(winPlan.action).toBe("already-installed");
    // Platform must never leak into public plan output.
    expect(Object.keys(winPlan)).not.toContain("platform");
  });

  it("blocks on Linux when POSIX shims lack executable bits, then passes once restored", () => {
    const prefix = join(tempDir("omp-e2e-plat2-"), "prefix");
    expect(run(wrapper, ["--bundle", bundle.dir, "--prefix", prefix, "--apply"]).status).toBe(0);

    // Baseline: a freshly applied prefix (exec bits set by apply on this POSIX
    // host) is already-installed under every platform.
    for (const platform of ["win32", "linux", "darwin"]) {
      const plan = resolveReleaseInstallPlan({
        bundleRoot: bundle.dir,
        prefix,
        apply: false,
        force: false,
        platform,
      });
      expect(plan.action, platform).toBe("already-installed");
    }

    // Strip the POSIX executable bits (simulating a Windows-applied prefix).
    for (const shim of posixShims) chmodSync(join(prefix, "bin", shim), 0o644);

    // Windows: still already-installed (mode not required).
    const winPlan = resolveReleaseInstallPlan({
      bundleRoot: bundle.dir,
      prefix,
      apply: false,
      force: false,
      platform: "win32",
    });
    expect(winPlan.action).toBe("already-installed");

    // Linux: blocked, with the precise mode reason (not a content mismatch).
    const linuxPlan = resolveReleaseInstallPlan({
      bundleRoot: bundle.dir,
      prefix,
      apply: false,
      force: false,
      platform: "linux",
    });
    expect(linuxPlan.ok).toBe(false);
    expect(linuxPlan.action).toBe("blocked");
    expect(linuxPlan.reasons).toContain("posix_shim_not_executable");
    expect(linuxPlan.reasons).not.toContain("shim_content_mismatch");

    // Restore exec bits: Linux is already-installed again.
    for (const shim of posixShims) chmodSync(join(prefix, "bin", shim), 0o755);
    const restored = resolveReleaseInstallPlan({
      bundleRoot: bundle.dir,
      prefix,
      apply: false,
      force: false,
      platform: "linux",
    });
    expect(restored.action).toBe("already-installed");
  });

  it("evaluatePostInstallState passes on Windows for a valid prefix and reports safe reasons on drift", () => {
    const prefix = join(tempDir("omp-e2e-plat3-"), "prefix");
    expect(run(wrapper, ["--bundle", bundle.dir, "--prefix", prefix, "--apply"]).status).toBe(0);
    const versionDirectory = join(prefix, "lib", "oh-my-pm", "versions", CANONICAL_VERSION);

    // Valid prefix passes on every platform.
    for (const platform of ["win32", "linux", "darwin"]) {
      const post = evaluatePostInstallState({
        bundleRoot: bundle.dir,
        prefix,
        versionDirectory,
        platform,
      });
      expect(post.ok, `${platform}:${JSON.stringify(post.reasons)}`).toBe(true);
      expect(post.bundleVerifier.ok).toBe(true);
      expect(post.installedState.action).toBe("already-installed");
    }

    // Strip exec bits: Windows still ok; Linux fails with the bounded mode reason.
    for (const shim of posixShims) chmodSync(join(prefix, "bin", shim), 0o644);
    const winPost = evaluatePostInstallState({
      bundleRoot: bundle.dir,
      prefix,
      versionDirectory,
      platform: "win32",
    });
    expect(winPost.ok).toBe(true);
    const linuxPost = evaluatePostInstallState({
      bundleRoot: bundle.dir,
      prefix,
      versionDirectory,
      platform: "linux",
    });
    expect(linuxPost.ok).toBe(false);
    expect(linuxPost.reasons).toContain("post_installed_state_not_exact");
    expect(linuxPost.reasons).toContain("post_posix_shim_mode_mismatch");
    // No path, file content, or subprocess output leaks in the reasons.
    const serialized = JSON.stringify(linuxPost.reasons);
    expect(serialized).not.toContain(prefix);
    expect(serialized).not.toMatch(/\/Users\/|\/home\/|[A-Za-z]:\\/);
  });

  it("post-check reports a shim content mismatch distinctly from a mode mismatch", () => {
    const prefix = join(tempDir("omp-e2e-plat4-"), "prefix");
    expect(run(wrapper, ["--bundle", bundle.dir, "--prefix", prefix, "--apply"]).status).toBe(0);
    const versionDirectory = join(prefix, "lib", "oh-my-pm", "versions", CANONICAL_VERSION);
    // Corrupt a shim's content.
    writeFileSync(join(prefix, "bin", "oh-my-pm"), "corrupted\n");
    const post = evaluatePostInstallState({
      bundleRoot: bundle.dir,
      prefix,
      versionDirectory,
      platform: "win32",
    });
    expect(post.ok).toBe(false);
    expect(post.reasons).toContain("post_shim_content_mismatch");
    expect(post.reasons).not.toContain("post_posix_shim_mode_mismatch");
  });
});

// Prove the installed-runtime launch policy against a real installed prefix on
// every host: Windows-mode launches must use the Node executable plus the
// installed .mjs entrypoints (never the .cmd shim, never a shell), POSIX-mode
// launches must use the installed shims, and the four exact shims plus the two
// .mjs entrypoints must all be present regular files.
describe("installed-runtime launch policy (Windows-safe invocation)", () => {
  it("Windows-mode uses Node + installed .mjs; POSIX-mode uses installed shims", () => {
    const prefix = join(tempDir("omp-e2e-launch-"), "prefix");
    expect(run(wrapper, ["--bundle", bundle.dir, "--prefix", prefix, "--apply"]).status).toBe(0);
    const binDir = join(prefix, "bin");
    const versionDir = join(prefix, "lib", "oh-my-pm", "versions", CANONICAL_VERSION);
    const cliEntry = join(versionDir, "bin", "oh-my-pm.mjs");
    const mcpEntry = join(versionDir, "bin", "oh-my-pm-mcp.mjs");

    // Mandatory exact four-shim presence plus the two installed .mjs targets.
    for (const shim of ["oh-my-pm", "oh-my-pm.cmd", "oh-my-pm-mcp", "oh-my-pm-mcp.cmd"]) {
      expect(lstatSync(join(binDir, shim)).isFile(), shim).toBe(true);
    }
    expect(lstatSync(cliEntry).isFile()).toBe(true);
    expect(lstatSync(mcpEntry).isFile()).toBe(true);

    const node = process.execPath;
    // Windows CLI: node <installed cli .mjs> <args...>
    const winCli = createInstalledCommandInvocation({
      platform: "win32",
      nodeExecutable: node,
      shimPath: join(binDir, "oh-my-pm.cmd"),
      entrypoint: cliEntry,
      args: ["status"],
    });
    expect(winCli.command).toBe(node);
    expect(winCli.args).toEqual([cliEntry, "status"]);
    expect(existsSync(winCli.args[0])).toBe(true);
    expect(winCli.command.endsWith(".cmd")).toBe(false);

    // Windows MCP: node <installed mcp .mjs>
    const winMcp = createInstalledCommandInvocation({
      platform: "win32",
      nodeExecutable: node,
      shimPath: join(binDir, "oh-my-pm-mcp.cmd"),
      entrypoint: mcpEntry,
      args: [],
    });
    expect(winMcp.command).toBe(node);
    expect(winMcp.args).toEqual([mcpEntry]);
    expect(existsSync(winMcp.args[0])).toBe(true);

    // POSIX CLI/MCP: the installed shim itself, no Node prefix.
    for (const [shimName, entry] of [
      ["oh-my-pm", cliEntry],
      ["oh-my-pm-mcp", mcpEntry],
    ]) {
      const posix = createInstalledCommandInvocation({
        platform: "linux",
        nodeExecutable: node,
        shimPath: join(binDir, shimName),
        entrypoint: entry,
        args: ["status"],
      });
      expect(posix.command).toBe(join(binDir, shimName));
      expect(posix.args).toEqual(["status"]);
    }

    // Every launched entrypoint lives under the installed version directory,
    // never the source repository and never node_modules/.bin.
    expect(cliEntry.startsWith(versionDir)).toBe(true);
    expect(mcpEntry.startsWith(versionDir)).toBe(true);
    expect(cliEntry).not.toContain("node_modules");
  });
});

// -----------------------------------------------------------------------------
// Bundle-level SHA256SUMS tampering (F-05).
//
// The installer's checksum pass is the layer that makes a bundle's manifest
// binding: a bundle whose contents disagree with its own SHA256SUMS must never
// install, no matter how it disagrees. Four distinct tamper shapes each map to
// their own reason code, so a rejection says *how* the bundle was wrong rather
// than only that it was.
//
// Every case is proved against a real built bundle (not a hand-written fixture)
// copied into its own temp directory, so the tampering is confined and the
// shared bundle the rest of this file depends on is never mutated.
//
// Note on the fourth code: the installer emits `sha256sums_lists_missing_file`
// for a manifest entry with no corresponding file. The v0.6.3 planning docs
// refer to it as `sha256sums_lists_missing`; the production string is the
// authority and is asserted verbatim here.
describe("bundle checksum tampering is rejected (F-05)", () => {
  const SUMS_LINE = /^([0-9a-f]{64}) {2}(.+)$/;

  /**
   * Copy the shared bundle into a fresh temp root so a tamper case can mutate
   * it freely. Returns the disposable bundle directory plus the owned root, so
   * confinement can be asserted against the exact root the case owns.
   */
  function disposableBundle(prefixLabel) {
    const root = tempDir(`omp-e2e-tamper-${prefixLabel}-`);
    const dir = join(root, BUNDLE_NAME);
    cpSync(bundle.dir, dir, { recursive: true, dereference: false, verbatimSymlinks: true });
    return { dir, root };
  }

  function readSums(bundleDir) {
    return readFileSync(join(bundleDir, "SHA256SUMS"), "utf8");
  }
  function writeSums(bundleDir, text) {
    writeFileSync(join(bundleDir, "SHA256SUMS"), text);
  }

  /** The manifest's listed relative paths, in file order. */
  function listedPaths(bundleDir) {
    return readSums(bundleDir)
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => SUMS_LINE.exec(line))
      .filter((m) => m !== null)
      .map((m) => m[2]);
  }

  /**
   * Drive the real installer wrapper against a tampered bundle and assert the
   * full security contract for that tamper case:
   *
   *   - the exact expected reason code is emitted (prefixed `source:`, which is
   *     how resolveReleaseInstallPlan namespaces source-bundle failures),
   *   - the failure is detected before any write -- the prefix is not created,
   *   - `--force` does not bypass it,
   *   - no absolute host path appears in the reported reasons,
   *   - the tampering stayed inside the case's own temp root.
   *
   * The plan is resolved through the shipped core *and* through the installer
   * CLI, so neither path can regress independently.
   */
  function expectTamperRejected({ bundleDir, ownedRoot, reason }) {
    const parent = tempDir("omp-e2e-tamper-prefix-");
    const prefix = join(parent, "prefix");

    // 1. The core's own plan resolution blocks with the exact reason.
    const plan = resolveReleaseInstallPlan({
      bundleRoot: bundleDir,
      prefix,
      apply: false,
      force: false,
    });
    expect(plan.ok, JSON.stringify(plan.reasons)).toBe(false);
    expect(plan.action).toBe("blocked");
    expect(plan.reasons).toContain(`source:${reason}`);

    // 2. Reasons stay path-free: no absolute host path, and specifically
    //    neither the bundle nor the destination prefix.
    const serializedReasons = JSON.stringify(plan.reasons);
    expect(serializedReasons).not.toMatch(/\/Users\/|\/home\/|[A-Za-z]:\\/);
    expect(serializedReasons).not.toContain(bundleDir);
    expect(serializedReasons).not.toContain(prefix);
    expect(serializedReasons).not.toContain(tmpdir());

    // 3. Preview wrote nothing.
    expect(existsSync(prefix)).toBe(false);

    // 4. --apply is refused, still before any write.
    const applied = run(wrapper, ["--bundle", bundleDir, "--prefix", prefix, "--apply"]);
    expect(applied.status, applied.diagnostics).toBe(2);
    expect(`${applied.stdout}${applied.stderr}`).toContain(`source:${reason}`);
    expect(existsSync(prefix)).toBe(false);

    // 5. --force does NOT bypass an integrity failure. Force only authorizes
    //    replacing exact managed targets; it can never authorize installing a
    //    bundle that fails its own checksum manifest.
    const forced = run(wrapper, ["--bundle", bundleDir, "--prefix", prefix, "--apply", "--force"]);
    expect(forced.status, forced.diagnostics).toBe(2);
    expect(`${forced.stdout}${forced.stderr}`).toContain(`source:${reason}`);

    // 6. Destination is untouched by every attempt above: no prefix, and so no
    //    bin/, lib/, version directory, or install manifest.
    expect(existsSync(prefix)).toBe(false);
    expect(existsSync(join(prefix, "bin"))).toBe(false);
    expect(existsSync(join(prefix, "lib"))).toBe(false);
    expect(existsSync(join(prefix, "lib", "oh-my-pm", "install.json"))).toBe(false);

    // 7. The fixture stayed confined to its own temp root, and the shared
    //    bundle every other test depends on was never touched.
    expect(bundleDir.startsWith(ownedRoot)).toBe(true);
    expect(bundleDir.startsWith(bundle.dir)).toBe(false);
    expect(existsSync(join(bundle.dir, "SHA256SUMS"))).toBe(true);
  }

  // A. A regular file listed in SHA256SUMS no longer hashes to its listed
  //    digest. This is the classic post-signing content swap.
  it("A. rejects a modified listed file with sha256sums_checksum_mismatch", () => {
    const { dir, root } = disposableBundle("mismatch");
    const target = join(dir, "RELEASE.json");
    expect(listedPaths(dir)).toContain("RELEASE.json");

    // Flip one byte of a listed regular file, preserving its length so only the
    // digest changes. RELEASE.json stays syntactically valid JSON with an
    // unchanged version, so the only reason this bundle can fail is the digest.
    const original = readFileSync(target);
    const flipped = Buffer.from(original);
    // Mutate inside the "OH MY PM" name value, not a structural character, so
    // the file stays valid JSON and only its digest changes.
    const valueAt = flipped.indexOf(Buffer.from("OH MY PM"));
    expect(valueAt).toBeGreaterThanOrEqual(0);
    flipped[valueAt] = flipped[valueAt] ^ 0x20;
    expect(Buffer.compare(flipped, original)).not.toBe(0);
    expect(flipped.length).toBe(original.length);
    writeFileSync(target, flipped);

    expectTamperRejected({
      bundleDir: dir,
      ownedRoot: root,
      reason: "sha256sums_checksum_mismatch",
    });
  }, 120_000);

  // B. An extra regular file is smuggled into the bundle. It is not listed, so
  //    no listed digest is wrong -- completeness is what catches it.
  it("B. rejects an unlisted added regular file with sha256sums_unlisted_file", () => {
    const { dir, root } = disposableBundle("unlisted");
    const smuggled = join(dir, "libexec", "smuggled-payload.mjs");
    expect(existsSync(smuggled)).toBe(false);
    writeFileSync(smuggled, "// not listed in SHA256SUMS\n");
    expect(listedPaths(dir)).not.toContain("libexec/smuggled-payload.mjs");

    expectTamperRejected({
      bundleDir: dir,
      ownedRoot: root,
      reason: "sha256sums_unlisted_file",
    });
  }, 120_000);

  // C. The manifest itself is not parseable as the accepted syntax. A manifest
  //    that cannot be read must fail closed rather than be partially trusted.
  it("C. rejects a malformed SHA256SUMS line with sha256sums_malformed", () => {
    const { dir, root } = disposableBundle("malformed");
    const lines = readSums(dir).split("\n");
    const firstIndex = lines.findIndex((line) => SUMS_LINE.test(line));
    expect(firstIndex).toBeGreaterThanOrEqual(0);

    // Corrupt the digest field so the line no longer matches the accepted
    // `<64 lowercase hex><2 spaces><path>` syntax, while still looking
    // superficially like a manifest line.
    const [, digest, rel] = SUMS_LINE.exec(lines[firstIndex]);
    expect(digest).toHaveLength(64);
    lines[firstIndex] = `not-a-sha256-digest  ${rel}`;
    expect(SUMS_LINE.test(lines[firstIndex])).toBe(false);
    writeSums(dir, lines.join("\n"));

    expectTamperRejected({
      bundleDir: dir,
      ownedRoot: root,
      reason: "sha256sums_malformed",
    });
  }, 120_000);

  // D. A manifest entry names a file that is not present. The remaining files
  //    all match, so only the dangling entry can explain the rejection.
  it("D. rejects a manifest entry for an absent file with sha256sums_lists_missing_file", () => {
    const { dir, root } = disposableBundle("listsmissing");

    // Pick a listed, non-required file so its removal cannot also trigger a
    // required_file_missing reason -- the dangling manifest entry must be the
    // distinguishing signal.
    const required = new Set([
      "RELEASE.json",
      "bin/omp.mjs",
      "bin/omp-mcp.mjs",
      "bin/omp-install.mjs",
      "bin/ohmypm.mjs",
      "bin/ohmypm-mcp.mjs",
      "bin/ohmypm-install.mjs",
      "bin/oh-my-pm.mjs",
      "bin/oh-my-pm-mcp.mjs",
      "bin/oh-my-pm-install.mjs",
      "libexec/release-install-core.mjs",
      "libexec/check-release-bundle.mjs",
      "node_modules/@oh-my-pm/kernel/generated-node/oh_my_pm_kernel.js",
      "node_modules/@oh-my-pm/kernel/generated-node/oh_my_pm_kernel_bg.wasm",
      "node_modules/@oh-my-pm/kernel/generated-node/package.json",
    ]);
    const victim = listedPaths(dir).find((rel) => !required.has(rel));
    expect(victim, "bundle must list at least one non-required file").toBeTruthy();

    // Delete the file but leave its manifest entry in place: the manifest now
    // lists a file the bundle does not contain.
    rmSync(join(dir, ...victim.split("/")));
    expect(existsSync(join(dir, ...victim.split("/")))).toBe(false);
    expect(listedPaths(dir)).toContain(victim);

    expectTamperRejected({
      bundleDir: dir,
      ownedRoot: root,
      reason: "sha256sums_lists_missing_file",
    });
  }, 120_000);

  // The untampered control: the same bundle, copied the same way, installs
  // cleanly. Without this, every assertion above could pass for the wrong
  // reason (e.g. if copying alone broke the bundle).
  it("control: an untampered copy of the same bundle still installs", () => {
    const { dir } = disposableBundle("control");
    const prefix = join(tempDir("omp-e2e-tamper-control-"), "prefix");
    const plan = resolveReleaseInstallPlan({
      bundleRoot: dir,
      prefix,
      apply: false,
      force: false,
    });
    expect(plan.ok, JSON.stringify(plan.reasons)).toBe(true);
    expect(plan.action).toBe("create");
    expect(plan.reasons).toEqual([]);

    const applied = run(wrapper, ["--bundle", dir, "--prefix", prefix, "--apply"]);
    expect(applied.status, applied.diagnostics).toBe(0);
    expect(run(installedCheck, ["--prefix", prefix]).status).toBe(0);
  }, 180_000);
});
