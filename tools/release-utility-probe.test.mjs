// Deterministic classification tests for the archive utility probes.
//
// The spawn implementation is injected, so every case below is decided by the
// probe logic rather than by whatever tools happen to exist on the host. One
// integration check against the real host tools is kept at the end, because
// release qualification already depends on those tools being present.
import { describe, expect, it } from "vitest";
import { probeGnuTar, probeUtility, resolveReleaseArchivePlan } from "./release-archive-utils.mjs";

/** Build a fake spawnSync returning queued results per command. */
function fakeSpawn(scripted) {
  const calls = [];
  const queues = new Map(Object.entries(scripted).map(([k, v]) => [k, [...v]]));
  const spawn = (command, args) => {
    calls.push({ command, args });
    const queue = queues.get(command);
    if (queue === undefined || queue.length === 0) {
      return { error: Object.assign(new Error("ENOENT"), { code: "ENOENT" }) };
    }
    // Repeat the final scripted result once the queue is down to one entry.
    return queue.length === 1 ? queue[0] : queue.shift();
  };
  spawn.calls = calls;
  return spawn;
}

const spawnError = (code) => ({ error: Object.assign(new Error(code), { code }) });
const exited = (status, stdout = "") => ({ status, stdout, signal: null });

describe("probeUtility classification", () => {
  it("reports an available utility", () => {
    const probe = probeUtility("gzip", { spawn: fakeSpawn({ gzip: [exited(0)] }) });
    expect(probe).toEqual({ kind: "available", command: "gzip" });
  });

  it("reports a genuinely missing utility as missing with ENOENT", () => {
    const probe = probeUtility("zip", { spawn: fakeSpawn({ zip: [spawnError("ENOENT")] }) });
    expect(probe).toEqual({ kind: "missing", command: "zip", code: "ENOENT" });
  });

  it("never retries ENOENT", () => {
    const spawn = fakeSpawn({ zip: [spawnError("ENOENT")] });
    probeUtility("zip", { spawn });
    expect(spawn.calls).toHaveLength(1);
  });

  it("treats a non-zero exit as failed, not available", () => {
    const probe = probeUtility("unzip", { spawn: fakeSpawn({ unzip: [exited(9)] }) });
    expect(probe.kind).toBe("failed");
    expect(probe.status).toBe(9);
  });

  it("does not retry an ordinary non-zero exit", () => {
    const spawn = fakeSpawn({ unzip: [exited(9)] });
    probeUtility("unzip", { spawn });
    expect(spawn.calls).toHaveLength(1);
  });

  it("retries a transient EAGAIN and succeeds", () => {
    const spawn = fakeSpawn({ gzip: [spawnError("EAGAIN"), exited(0)] });
    const probe = probeUtility("gzip", { spawn });
    expect(probe).toEqual({ kind: "available", command: "gzip" });
    expect(spawn.calls).toHaveLength(2);
  });

  it("exhausts bounded retries and preserves the transient classification", () => {
    const spawn = fakeSpawn({ gzip: [spawnError("EAGAIN")] });
    const probe = probeUtility("gzip", { spawn, maxAttempts: 3 });
    expect(probe).toEqual({ kind: "failed", command: "gzip", code: "EAGAIN" });
    expect(spawn.calls).toHaveLength(3);
  });

  it("classifies every transient code without reporting it missing", () => {
    for (const code of ["EAGAIN", "EMFILE", "ENFILE", "ENOMEM"]) {
      const probe = probeUtility("gzip", { spawn: fakeSpawn({ gzip: [spawnError(code)] }), maxAttempts: 2 });
      expect(probe.kind).toBe("failed");
      expect(probe.code).toBe(code);
    }
  });

  it("does not retry a non-transient spawn failure", () => {
    const spawn = fakeSpawn({ gzip: [spawnError("EACCES")] });
    const probe = probeUtility("gzip", { spawn });
    expect(probe).toEqual({ kind: "failed", command: "gzip", code: "EACCES" });
    expect(spawn.calls).toHaveLength(1);
  });
});

describe("probeGnuTar discovery", () => {
  it("finds GNU tar as tar", () => {
    const spawn = fakeSpawn({ tar: [exited(0, "tar (GNU tar) 1.35")] });
    expect(probeGnuTar({ spawn })).toEqual({ kind: "available", command: "tar" });
  });

  it("falls through BSD tar and finds gtar", () => {
    const spawn = fakeSpawn({
      tar: [exited(0, "bsdtar 3.5.3")],
      gtar: [exited(0, "tar (GNU tar) 1.35")],
    });
    expect(probeGnuTar({ spawn })).toEqual({ kind: "available", command: "gtar" });
  });

  it("reports missing when both candidates are genuinely absent", () => {
    const spawn = fakeSpawn({ tar: [spawnError("ENOENT")], gtar: [spawnError("ENOENT")] });
    expect(probeGnuTar({ spawn })).toEqual({ kind: "missing", command: "tar", code: "ENOENT" });
  });

  it("reports a transient tar probe failure as failed, never as missing", () => {
    const spawn = fakeSpawn({ tar: [spawnError("EAGAIN")], gtar: [spawnError("ENOENT")] });
    const probe = probeGnuTar({ spawn, maxAttempts: 2 });
    expect(probe.kind).toBe("failed");
    expect(probe.code).toBe("EAGAIN");
  });
});

describe("archive plan prerequisite reasons", () => {
  const planWith = (spawnUtility) =>
    resolveReleaseArchivePlan({ bundle: "/nonexistent-bundle", output: "/nonexistent-output", spawnUtility });

  it("uses the missing reason for a genuinely absent utility", () => {
    const plan = planWith(
      fakeSpawn({
        tar: [exited(0, "tar (GNU tar) 1.35")],
        gzip: [spawnError("ENOENT")],
        zip: [exited(0)],
        unzip: [exited(0)],
      }),
    );
    expect(plan.reasons).toContain("release_archive_prerequisite_missing:gzip");
    expect(plan.reasons).not.toContain("release_archive_prerequisite_probe_failed:gzip");
    expect(plan.ok).toBe(false);
  });

  it("uses a distinct probe-failed reason for a transient failure", () => {
    const plan = planWith(
      fakeSpawn({
        tar: [exited(0, "tar (GNU tar) 1.35")],
        gzip: [spawnError("EAGAIN")],
        zip: [exited(0)],
        unzip: [exited(0)],
      }),
    );
    expect(plan.reasons).toContain("release_archive_prerequisite_probe_failed:gzip");
    expect(plan.reasons).not.toContain("release_archive_prerequisite_missing:gzip");
    expect(plan.ok).toBe(false);
  });

  it("emits no utility reason when every tool is available", () => {
    const plan = planWith(
      fakeSpawn({
        tar: [exited(0, "tar (GNU tar) 1.35")],
        gzip: [exited(0)],
        zip: [exited(0)],
        unzip: [exited(0)],
      }),
    );
    for (const id of ["gnu_tar", "gzip", "zip", "unzip"]) {
      expect(plan.reasons).not.toContain(`release_archive_prerequisite_missing:${id}`);
      expect(plan.reasons).not.toContain(`release_archive_prerequisite_probe_failed:${id}`);
    }
  });

  it("keeps reasons free of paths, environment values, and stack traces", () => {
    const plan = planWith(fakeSpawn({ tar: [spawnError("EAGAIN")], gzip: [exited(0)], zip: [exited(0)], unzip: [exited(0)] }));
    for (const reason of plan.reasons) {
      expect(reason).not.toContain("/");
      expect(reason).not.toContain("\\");
      expect(reason).not.toContain("Error");
    }
  });
});

describe("host integration", () => {
  it("discovers a real GNU tar and the real archive utilities", () => {
    expect(probeGnuTar().kind).toBe("available");
    for (const [command, args] of [
      ["gzip", ["--version"]],
      ["zip", ["-v"]],
      ["unzip", ["-v"]],
    ]) {
      expect(probeUtility(command, { args }).kind).toBe("available");
    }
  });
});
