// Nested `memory` parser tests. Covers every subcommand in all output modes,
// the exact seven-subcommand allowlist, option validation, duplicate and
// mutation-only rejection, and legacy parser regression.

import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../src/parser.js";
import { parseMemoryCommand } from "../src/memory-parser.js";
import { MEMORY_SUBCOMMANDS } from "../src/memory-types.js";

/** Parse via the top-level entry (memory delegates to the nested parser). */
function parseTop(args: string[]) {
  return parseCliArgs(["memory", ...args]);
}

describe("memory parser — allowlist and dispatch", () => {
  it("exposes exactly the seven approved subcommands", () => {
    expect([...MEMORY_SUBCOMMANDS].sort()).toEqual(
      ["capture", "changes", "delete", "export", "history", "status", "timeline"].sort(),
    );
  });

  it("keeps the six historical subcommands in their original order", () => {
    // timeline is APPENDED; the six v0.3 subcommands keep their exact order.
    expect(MEMORY_SUBCOMMANDS.slice(0, 6)).toEqual([
      "capture",
      "changes",
      "status",
      "history",
      "export",
      "delete",
    ]);
    expect(MEMORY_SUBCOMMANDS[6]).toBe("timeline");
  });

  it("rejects a missing subcommand", () => {
    const result = parseMemoryCommand([]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("OMP-C-3002");
  });

  it("rejects an unknown subcommand", () => {
    const result = parseMemoryCommand(["init"]);
    expect(result.ok).toBe(false);
  });

  it.each(["init", "import", "repair", "migrate", "prune", "config", "sync", "watch", "serve"])(
    "rejects the forbidden subcommand %s",
    (sub) => {
      expect(parseMemoryCommand([sub]).ok).toBe(false);
    },
  );

  it("routes memory through the top-level parser", () => {
    const result = parseTop(["status"]);
    expect(result.ok).toBe(true);
    if (result.ok && result.command === "memory") {
      expect(result.memory.subcommand).toBe("status");
    }
  });

  it("rejects memory appearing after another command", () => {
    const result = parseCliArgs(["status", "memory"]);
    expect(result.ok).toBe(false);
  });
});

describe("memory parser — capture", () => {
  it("defaults root to '.', locale to en, preview mode", () => {
    const result = parseMemoryCommand(["capture"]);
    expect(result.ok).toBe(true);
    if (result.ok && result.command.subcommand === "capture") {
      expect(result.command.projectRoot).toBe(".");
      expect(result.command.locale).toBe("en");
      expect(result.command.apply).toBe(false);
      expect(result.command.outputMode).toBe("brief");
    }
  });

  it("accepts an explicit root, --apply, and --locale fa", () => {
    const result = parseMemoryCommand(["capture", "./proj", "--apply", "--locale", "fa"]);
    expect(result.ok).toBe(true);
    if (result.ok && result.command.subcommand === "capture") {
      expect(result.command.projectRoot).toBe("./proj");
      expect(result.command.apply).toBe(true);
      expect(result.command.locale).toBe("fa");
    }
  });

  it("rejects an invalid locale", () => {
    expect(parseMemoryCommand(["capture", "--locale", "de"]).ok).toBe(false);
  });

  it.each(["--json", "--markdown"])("supports %s output", (flag) => {
    const result = parseMemoryCommand(["capture", flag]);
    expect(result.ok).toBe(true);
    if (result.ok && result.command.subcommand === "capture") {
      expect(result.command.outputMode).toBe(flag === "--json" ? "json" : "markdown");
    }
  });
});

describe("memory parser — changes", () => {
  it("defaults to latest pair with the default stale-after", () => {
    const result = parseMemoryCommand(["changes"]);
    expect(result.ok).toBe(true);
    if (result.ok && result.command.subcommand === "changes") {
      expect(result.command.previousSnapshotId).toBeUndefined();
      expect(result.command.currentSnapshotId).toBeUndefined();
      expect(result.command.staleAfterSeconds).toBe(604_800);
    }
  });

  it("accepts an explicit distinct pair", () => {
    const result = parseMemoryCommand(["changes", "--previous", "a", "--current", "b"]);
    expect(result.ok).toBe(true);
    if (result.ok && result.command.subcommand === "changes") {
      expect(result.command.previousSnapshotId).toBe("a");
      expect(result.command.currentSnapshotId).toBe("b");
    }
  });

  it("rejects a half pair (previous without current)", () => {
    expect(parseMemoryCommand(["changes", "--previous", "a"]).ok).toBe(false);
  });

  it("rejects an equal pair", () => {
    expect(parseMemoryCommand(["changes", "--previous", "a", "--current", "a"]).ok).toBe(false);
  });

  it("bounds --stale-after to 0..31536000", () => {
    expect(parseMemoryCommand(["changes", "--stale-after", "0"]).ok).toBe(true);
    expect(parseMemoryCommand(["changes", "--stale-after", "31536000"]).ok).toBe(true);
    expect(parseMemoryCommand(["changes", "--stale-after", "31536001"]).ok).toBe(false);
    expect(parseMemoryCommand(["changes", "--stale-after", "-1"]).ok).toBe(false);
    expect(parseMemoryCommand(["changes", "--stale-after", "x"]).ok).toBe(false);
  });

  it("rejects --apply on the read-only changes command", () => {
    expect(parseMemoryCommand(["changes", "--apply"]).ok).toBe(false);
  });
});

describe("memory parser — history", () => {
  it("defaults limit to 20", () => {
    const result = parseMemoryCommand(["history"]);
    if (result.ok && result.command.subcommand === "history") {
      expect(result.command.limit).toBe(20);
    }
  });

  it("bounds --limit to 1..100", () => {
    expect(parseMemoryCommand(["history", "--limit", "1"]).ok).toBe(true);
    expect(parseMemoryCommand(["history", "--limit", "100"]).ok).toBe(true);
    expect(parseMemoryCommand(["history", "--limit", "0"]).ok).toBe(false);
    expect(parseMemoryCommand(["history", "--limit", "101"]).ok).toBe(false);
  });

  it("rejects --apply on history", () => {
    expect(parseMemoryCommand(["history", "--apply"]).ok).toBe(false);
  });
});

describe("memory parser — status", () => {
  it("parses with an optional root", () => {
    const result = parseMemoryCommand(["status", "./p"]);
    expect(result.ok).toBe(true);
    if (result.ok && result.command.subcommand === "status") {
      expect(result.command.projectRoot).toBe("./p");
    }
  });

  it("rejects --apply on status", () => {
    expect(parseMemoryCommand(["status", "--apply"]).ok).toBe(false);
  });
});

describe("memory parser — export", () => {
  it("requires --destination", () => {
    expect(parseMemoryCommand(["export"]).ok).toBe(false);
  });

  it("accepts --destination and --apply", () => {
    const result = parseMemoryCommand(["export", "--destination", "./out", "--apply"]);
    expect(result.ok).toBe(true);
    if (result.ok && result.command.subcommand === "export") {
      expect(result.command.destination).toBe("./out");
      expect(result.command.apply).toBe(true);
    }
  });
});

describe("memory parser — delete", () => {
  it("previews without --apply and without confirmation", () => {
    const result = parseMemoryCommand(["delete"]);
    expect(result.ok).toBe(true);
    if (result.ok && result.command.subcommand === "delete") {
      expect(result.command.apply).toBe(false);
    }
  });

  it("rejects --apply without --confirm", () => {
    expect(parseMemoryCommand(["delete", "--apply"]).ok).toBe(false);
  });

  it("accepts --apply with --confirm", () => {
    const result = parseMemoryCommand(["delete", "--apply", "--confirm", "proj"]);
    expect(result.ok).toBe(true);
    if (result.ok && result.command.subcommand === "delete") {
      expect(result.command.confirm).toBe("proj");
    }
  });

  it("rejects --confirm without --apply", () => {
    expect(parseMemoryCommand(["delete", "--confirm", "proj"]).ok).toBe(false);
  });

  it("accepts --force-corrupt-delete only with delete apply", () => {
    const ok = parseMemoryCommand([
      "delete",
      "--apply",
      "--confirm",
      "proj",
      "--force-corrupt-delete",
    ]);
    expect(ok.ok).toBe(true);
    // On a non-delete subcommand the flag is rejected.
    expect(parseMemoryCommand(["capture", "--force-corrupt-delete"]).ok).toBe(false);
    expect(parseMemoryCommand(["status", "--force-corrupt-delete"]).ok).toBe(false);
  });
});

describe("memory parser — common options and errors", () => {
  it("accepts --project-id and --data-dir on every subcommand", () => {
    for (const sub of MEMORY_SUBCOMMANDS) {
      const extra = sub === "export" ? ["--destination", "./out"] : [];
      const result = parseMemoryCommand([sub, "--project-id", "p", "--data-dir", "/d", ...extra]);
      expect(result.ok, sub).toBe(true);
      if (result.ok) {
        expect(result.command.projectId).toBe("p");
        expect(result.command.dataDir).toBe("/d");
      }
    }
  });

  it("rejects a duplicate --project-id", () => {
    expect(parseMemoryCommand(["status", "--project-id", "a", "--project-id", "b"]).ok).toBe(false);
  });

  it("rejects a missing option value", () => {
    expect(parseMemoryCommand(["status", "--project-id"]).ok).toBe(false);
    expect(parseMemoryCommand(["status", "--data-dir"]).ok).toBe(false);
  });

  it("rejects a control character in an option value", () => {
    expect(parseMemoryCommand(["status", "--project-id", "a b"]).ok).toBe(false);
  });

  it("rejects an unsupported option", () => {
    expect(parseMemoryCommand(["status", "--nope"]).ok).toBe(false);
  });

  it("rejects two positional roots", () => {
    expect(parseMemoryCommand(["status", "a", "b"]).ok).toBe(false);
  });
});

describe("legacy parser regression", () => {
  it("still parses the existing top-level commands", () => {
    for (const cmd of ["status", "doctor"]) {
      const result = parseCliArgs([cmd]);
      expect(result.ok).toBe(true);
    }
    expect(parseCliArgs(["brief", "./root"]).ok).toBe(true);
    expect(parseCliArgs(["plan", "do", "the", "thing"]).ok).toBe(true);
    expect(parseCliArgs(["github", "brief"]).ok).toBe(true);
    expect(parseCliArgs(["providers", "status"]).ok).toBe(true);
  });

  it("still rejects an unknown top-level command", () => {
    expect(parseCliArgs(["frobnicate"]).ok).toBe(false);
  });
});
