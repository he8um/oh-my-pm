import type { JsonValue, RuntimeResponse } from "@oh-my-pm/contracts";
import { describe, expect, it } from "vitest";
import { formatCliError, formatRuntimeResponse } from "../src/index.js";

const statusResponse: RuntimeResponse = {
  id: "cli-status",
  ok: true,
  data: { version: "2.0.0-alpha.0", kernelVersion: "kernel-test", healthy: true },
  trace: [{ step: "runtime.status", status: "ok" }],
};

const doctorResponse: RuntimeResponse = {
  id: "cli-doctor",
  ok: true,
  data: {
    checks: [
      { id: "kernel.validation", status: "ok", message: "Kernel validation is available" },
    ],
  },
};

const failedResponse: RuntimeResponse = {
  id: "cli-status",
  ok: false,
  data: { code: "OMP-R-2001", message: "request failed kernel validation" },
  error: { code: "OMP-R-2001", message: "request failed kernel validation", blocking: true },
};

describe("cli formatting", () => {
  it("formats status in brief mode", () => {
    expect(formatRuntimeResponse(statusResponse, "brief")).toBe(
      "OH MY PM status: healthy\nversion: 2.0.0-alpha.0\nkernel: kernel-test\n",
    );
  });

  it("formats status in markdown mode without trace", () => {
    const output = formatRuntimeResponse(statusResponse, "markdown");
    expect(output).toBe(
      "# OH MY PM Status\n\n- Healthy: yes\n- Version: 2.0.0-alpha.0\n- Kernel: kernel-test\n",
    );
    expect(output).not.toContain("runtime.status");
  });

  it("formats status in json mode with the full response", () => {
    const output = formatRuntimeResponse(statusResponse, "json");
    expect(JSON.parse(output)).toEqual(statusResponse);
    expect(output.endsWith("\n")).toBe(true);
  });

  it("formats doctor in brief mode", () => {
    expect(formatRuntimeResponse(doctorResponse, "brief")).toBe(
      "OH MY PM doctor: ok\nkernel.validation: ok - Kernel validation is available\n",
    );
  });

  it("formats doctor in markdown mode", () => {
    expect(formatRuntimeResponse(doctorResponse, "markdown")).toBe(
      [
        "# OH MY PM Doctor",
        "",
        "| Check | Status | Message |",
        "| --- | --- | --- |",
        "| kernel.validation | ok | Kernel validation is available |",
        "",
      ].join("\n"),
    );
  });

  it("formats a failed response in brief mode", () => {
    expect(formatRuntimeResponse(failedResponse, "brief")).toBe(
      "error OMP-R-2001: request failed kernel validation\n",
    );
  });

  it("formats a failed response in markdown mode", () => {
    expect(formatRuntimeResponse(failedResponse, "markdown")).toBe(
      "# OH MY PM Error\n\n- Code: OMP-R-2001\n- Message: request failed kernel validation\n",
    );
  });

  it("formats a cli parse error in json mode", () => {
    const output = formatCliError("OMP-C-3001", "missing command", "json");
    expect(JSON.parse(output)).toEqual({
      ok: false,
      error: { code: "OMP-C-3001", message: "missing command" },
    });
  });

  it("formats plan outputs in brief mode", () => {
    const plan = (output: JsonValue): RuntimeResponse => ({
      id: "cli-plan",
      ok: true,
      data: { output },
    });
    expect(formatRuntimeResponse(plan({ summary: "All on track." }), "brief")).toBe(
      "OH MY PM plan: ok\nAll on track.\n",
    );
    expect(
      formatRuntimeResponse(
        plan({ tasks: [{ id: "1", title: "Fix login" }, { id: "2", title: "Write docs" }] }),
        "brief",
      ),
    ).toBe("OH MY PM plan: ok\ntasks: 2\n- Fix login\n- Write docs\n");
    expect(
      formatRuntimeResponse(plan({ risks: [{ id: "r1", title: "Vendor delay" }] }), "brief"),
    ).toBe("OH MY PM plan: ok\nrisks: 1\n- Vendor delay\n");
    expect(
      formatRuntimeResponse(
        plan({ sections: [{ heading: "Summary", items: ["ok"] }] }),
        "brief",
      ),
    ).toBe("OH MY PM plan: ok\nsections: 1\n- Summary\n");
    expect(formatRuntimeResponse(plan({ other: true }), "brief")).toBe("OH MY PM plan: ok\n");
  });

  it("formats plan outputs in markdown mode", () => {
    const plan = (output: JsonValue): RuntimeResponse => ({
      id: "cli-plan",
      ok: true,
      data: { output },
    });
    expect(formatRuntimeResponse(plan({ summary: "All on track." }), "markdown")).toBe(
      "# OH MY PM Plan\n\nAll on track.\n",
    );
    expect(
      formatRuntimeResponse(plan({ tasks: [{ id: "1", title: "Fix login" }] }), "markdown"),
    ).toBe("# OH MY PM Plan\n\n## Tasks\n\n- Fix login\n");
    expect(
      formatRuntimeResponse(plan({ risks: [{ id: "r1", title: "Vendor delay" }] }), "markdown"),
    ).toBe("# OH MY PM Plan\n\n## Risks\n\n- Vendor delay\n");
    expect(
      formatRuntimeResponse(
        plan({ sections: [{ heading: "Open Tasks", items: ["Fix login", "Write docs"] }] }),
        "markdown",
      ),
    ).toBe("# OH MY PM Plan\n\n## Open Tasks\n\n- Fix login\n- Write docs\n");
    expect(formatRuntimeResponse(plan({ other: true }), "markdown")).toBe(
      "# OH MY PM Plan\n\nOK\n",
    );
  });

  it("formats a status summary with counts and highlights in brief mode", () => {
    const response: RuntimeResponse = {
      id: "cli-brief",
      ok: true,
      data: {
        output: {
          title: "Project status",
          summary: "status brief for the current project",
          counts: { total: 4, done: 1, blocked: 1, open: 2 },
          highlights: ["Riverline Field Guide", "Status"],
          generatedAt: "2026-01-01T00:00:00.000Z",
        },
      },
    };
    expect(formatRuntimeResponse(response, "brief")).toBe(
      [
        "OH MY PM plan: ok",
        "items: 4 (open 2, blocked 1, done 1)",
        "- Riverline Field Guide",
        "- Status",
        "",
      ].join("\n"),
    );
  });

  it("formats a status summary with counts and highlights in markdown mode", () => {
    const response: RuntimeResponse = {
      id: "cli-brief",
      ok: true,
      data: {
        output: {
          counts: { total: 2, done: 0, blocked: 0, open: 2 },
          highlights: ["Status"],
        },
      },
    };
    expect(formatRuntimeResponse(response, "markdown")).toBe(
      [
        "# OH MY PM Plan",
        "",
        "## Status",
        "",
        "- Total: 2",
        "- Open: 2",
        "- Blocked: 0",
        "- Done: 0",
        "",
        "## Highlights",
        "",
        "- Status",
        "",
      ].join("\n"),
    );
  });

  it("formats valid risk entries with severity and reason in brief mode", () => {
    const response: RuntimeResponse = {
      id: "cli-risks",
      ok: true,
      data: {
        output: {
          risks: [
            { id: "a", title: "Supplier stall", severity: "high", reason: "keyword:blocked" },
            { id: "b", title: "Licensing gap", severity: "medium", reason: "keyword:dependency" },
            { id: "c", title: "Notes backlog", severity: "low", reason: "explicit" },
          ],
        },
      },
    };
    expect(formatRuntimeResponse(response, "brief")).toBe(
      [
        "OH MY PM risks: 3",
        "- [high] Supplier stall — keyword:blocked",
        "- [medium] Licensing gap — keyword:dependency",
        "- [low] Notes backlog — explicit",
        "",
      ].join("\n"),
    );
  });

  it("formats zero risks in brief mode", () => {
    const response: RuntimeResponse = {
      id: "cli-risks",
      ok: true,
      data: { output: { risks: [] } },
    };
    expect(formatRuntimeResponse(response, "brief")).toBe(
      "OH MY PM risks: 0\nno risks detected\n",
    );
  });

  it("renders review state and file provenance in the canonical brief order", () => {
    const response: RuntimeResponse = {
      id: "cli-risks",
      ok: true,
      data: {
        output: {
          risks: [
            {
              id: "rv",
              title: "Changes requested by @alice",
              severity: "high",
              reason: "github_review:changes_requested",
              owner: "ow",
              author: "alice",
              reviewState: "changesRequested",
              due: "2026-05-01",
              repository: "owner/repo",
              number: 7,
              url: "https://github.com/owner/repo/pull/7",
            },
            {
              id: "rc",
              title: "null deref",
              severity: "high",
              reason: "github_review_comment:marker:blocker",
              author: "carol",
              filePath: "src/app.ts",
              line: 42,
            },
          ],
        },
      },
    };
    const out = formatRuntimeResponse(response, "brief");
    // Canonical order: owner, author, review state, file path/line, due, source, URL.
    expect(out).toContain(
      "- [high] Changes requested by @alice — github_review:changes_requested — owner: ow — author: alice — review: changesRequested — due: 2026-05-01 — source: owner/repo#7 — https://github.com/owner/repo/pull/7",
    );
    expect(out).toContain(
      "- [high] null deref — github_review_comment:marker:blocker — author: carol — file: src/app.ts:42",
    );
  });

  it("renders file provenance without a line when the line is absent (markdown)", () => {
    const response: RuntimeResponse = {
      id: "cli-next",
      ok: true,
      data: {
        output: {
          tasks: [
            {
              id: "t",
              title: "rename it",
              reason: "github_review_comment:unchecked_task",
              author: "dan",
              filePath: "src/x.ts",
            },
          ],
        },
      },
    };
    const out = formatRuntimeResponse(response, "markdown");
    expect(out).toContain("— author: `dan` — file: `src/x.ts`");
  });

  it("formats valid risk entries with counts in markdown mode", () => {
    const response: RuntimeResponse = {
      id: "cli-risks",
      ok: true,
      data: {
        output: {
          risks: [
            { id: "a", title: "Supplier stall", severity: "high", reason: "keyword:blocked" },
            { id: "b", title: "Licensing gap", severity: "medium", reason: "keyword:dependency" },
            { id: "c", title: "Notes backlog", severity: "low", reason: "explicit" },
            { id: "d", title: "Courier strike", severity: "high", reason: "keyword:urgent" },
          ],
        },
      },
    };
    expect(formatRuntimeResponse(response, "markdown")).toBe(
      [
        "# OH MY PM Project Risks",
        "",
        "## Summary",
        "",
        "- Total: 4",
        "- High: 2",
        "- Medium: 1",
        "- Low: 1",
        "",
        "## Risks",
        "",
        "- **high** — Supplier stall — `keyword:blocked`",
        "- **medium** — Licensing gap — `keyword:dependency`",
        "- **low** — Notes backlog — `explicit`",
        "- **high** — Courier strike — `keyword:urgent`",
        "",
      ].join("\n"),
    );
  });

  it("formats zero risks in markdown mode", () => {
    const response: RuntimeResponse = {
      id: "cli-risks",
      ok: true,
      data: { output: { risks: [] } },
    };
    expect(formatRuntimeResponse(response, "markdown")).toBe(
      [
        "# OH MY PM Project Risks",
        "",
        "## Summary",
        "",
        "- Total: 0",
        "- High: 0",
        "- Medium: 0",
        "- Low: 0",
        "",
        "## Risks",
        "",
        "- none",
        "",
      ].join("\n"),
    );
  });

  it("falls back to the generic risk list for malformed risk entries", () => {
    const malformed: RuntimeResponse = {
      id: "cli-risks",
      ok: true,
      data: {
        output: {
          risks: [
            { id: "a", title: "Vendor delay" },
            { id: "b", title: "Bad severity", severity: "extreme", reason: "explicit" },
          ],
        },
      },
    };
    expect(formatRuntimeResponse(malformed, "brief")).toBe(
      "OH MY PM plan: ok\nrisks: 2\n- Vendor delay\n- Bad severity\n",
    );
    expect(formatRuntimeResponse(malformed, "markdown")).toBe(
      "# OH MY PM Plan\n\n## Risks\n\n- Vendor delay\n- Bad severity\n",
    );
  });

  it("keeps json mode untouched for risk outputs", () => {
    const response: RuntimeResponse = {
      id: "cli-risks",
      ok: true,
      data: {
        output: {
          risks: [{ id: "a", title: "Supplier stall", severity: "high", reason: "keyword:blocked" }],
        },
      },
      trace: [{ step: "skill.execute", status: "ok" }],
    };
    expect(JSON.parse(formatRuntimeResponse(response, "json"))).toEqual(response);
  });

  it("formats valid next-task entries with reasons in brief mode", () => {
    const response: RuntimeResponse = {
      id: "cli-next",
      ok: true,
      data: {
        output: {
          tasks: [
            {
              id: "docs/status.md#task-1",
              title: "Confirm final paper stock with the supplier.",
              reason: "markdown_unchecked_task",
            },
            {
              id: "docs/status.md#task-2",
              title: "Export the elevation maps for print.",
              reason: "markdown_unchecked_task",
            },
            { id: "i1", title: "Owned follow-up", reason: "open_item" },
          ],
        },
      },
    };
    expect(formatRuntimeResponse(response, "brief")).toBe(
      [
        "OH MY PM next: 3",
        "- Confirm final paper stock with the supplier. — markdown_unchecked_task",
        "- Export the elevation maps for print. — markdown_unchecked_task",
        "- Owned follow-up — open_item",
        "",
      ].join("\n"),
    );
  });

  it("formats zero next tasks in brief mode", () => {
    const response: RuntimeResponse = {
      id: "cli-next",
      ok: true,
      data: { output: { tasks: [] } },
    };
    expect(formatRuntimeResponse(response, "brief")).toBe(
      "OH MY PM next: 0\nno next tasks detected\n",
    );
  });

  it("formats next tasks in markdown mode", () => {
    const response: RuntimeResponse = {
      id: "cli-next",
      ok: true,
      data: {
        output: {
          tasks: [
            { id: "a#task-1", title: "First task", reason: "markdown_unchecked_task" },
            { id: "b", title: "Second task", reason: "open_with_due" },
          ],
        },
      },
    };
    expect(formatRuntimeResponse(response, "markdown")).toBe(
      [
        "# OH MY PM Next Tasks",
        "",
        "## Summary",
        "",
        "- Total: 2",
        "",
        "## Tasks",
        "",
        "- First task — `markdown_unchecked_task`",
        "- Second task — `open_with_due`",
        "",
      ].join("\n"),
    );
  });

  it("formats zero next tasks in markdown mode", () => {
    const response: RuntimeResponse = {
      id: "cli-next",
      ok: true,
      data: { output: { tasks: [] } },
    };
    expect(formatRuntimeResponse(response, "markdown")).toBe(
      [
        "# OH MY PM Next Tasks",
        "",
        "## Summary",
        "",
        "- Total: 0",
        "",
        "## Tasks",
        "",
        "- none",
        "",
      ].join("\n"),
    );
  });

  it("falls back to the generic task list for malformed task entries", () => {
    const malformed: RuntimeResponse = {
      id: "cli-next",
      ok: true,
      data: {
        output: {
          tasks: [{ id: "1", title: "Fix login" }],
        },
      },
    };
    expect(formatRuntimeResponse(malformed, "brief")).toBe(
      "OH MY PM plan: ok\ntasks: 1\n- Fix login\n",
    );
    expect(formatRuntimeResponse(malformed, "markdown")).toBe(
      "# OH MY PM Plan\n\n## Tasks\n\n- Fix login\n",
    );
  });

  it("keeps json mode untouched for next-task outputs", () => {
    const response: RuntimeResponse = {
      id: "cli-next",
      ok: true,
      data: {
        output: {
          tasks: [{ id: "a#task-1", title: "First task", reason: "markdown_unchecked_task" }],
        },
      },
      trace: [{ step: "skill.execute", status: "ok" }],
    };
    expect(JSON.parse(formatRuntimeResponse(response, "json"))).toEqual(response);
  });

  it("keeps json mode as the full plan response", () => {
    const response: RuntimeResponse = {
      id: "cli-plan",
      ok: true,
      data: { output: { summary: "s" }, graph: { nodes: [] } },
      trace: [{ step: "planner.plan", status: "ok" }],
    };
    expect(JSON.parse(formatRuntimeResponse(response, "json"))).toEqual(response);
  });

  const handoffResponse = (output: JsonValue): RuntimeResponse => ({
    id: "cli-handoff",
    ok: true,
    data: { output },
  });

  const fixtureHandoff = {
    title: "Riverline Field Guide",
    sections: [
      {
        heading: "Summary",
        items: ["Ship the printable spring edition of the trail guide."],
      },
      {
        heading: "Open Tasks",
        items: ["Confirm final paper stock with the supplier."],
      },
      {
        heading: "Risks",
        items: ["The printing quote is blocked until the paper supplier responds (owner: Jordan)."],
      },
      {
        heading: "Decisions",
        items: ["Decision: the spring edition ships as a single printed volume, not two booklets."],
      },
    ],
    generatedAt: "2026-01-01T00:00:00.000Z",
  };

  it("formats a handoff in brief mode with section order and generated timestamp", () => {
    expect(formatRuntimeResponse(handoffResponse(fixtureHandoff), "brief")).toBe(
      [
        "OH MY PM handoff: Riverline Field Guide",
        "Summary: 1",
        "- Ship the printable spring edition of the trail guide.",
        "Open Tasks: 1",
        "- Confirm final paper stock with the supplier.",
        "Risks: 1",
        "- The printing quote is blocked until the paper supplier responds (owner: Jordan).",
        "Decisions: 1",
        "- Decision: the spring edition ships as a single printed volume, not two booklets.",
        "generated at: 2026-01-01T00:00:00.000Z",
        "",
      ].join("\n"),
    );
  });

  it("formats a handoff in markdown mode with section order and generated timestamp", () => {
    expect(formatRuntimeResponse(handoffResponse(fixtureHandoff), "markdown")).toBe(
      [
        "# OH MY PM Project Handoff",
        "",
        "- Project: Riverline Field Guide",
        "- Generated at: `2026-01-01T00:00:00.000Z`",
        "",
        "## Summary",
        "",
        "- Ship the printable spring edition of the trail guide.",
        "",
        "## Open Tasks",
        "",
        "- Confirm final paper stock with the supplier.",
        "",
        "## Risks",
        "",
        "- The printing quote is blocked until the paper supplier responds (owner: Jordan).",
        "",
        "## Decisions",
        "",
        "- Decision: the spring edition ships as a single printed volume, not two booklets.",
        "",
      ].join("\n"),
    );
  });

  it("renders an empty handoff section as - none in markdown mode", () => {
    const output = formatRuntimeResponse(
      handoffResponse({
        title: "Empty project",
        sections: [{ heading: "Risks", items: [] }],
        generatedAt: "t0",
      }),
      "markdown",
    );
    expect(output).toContain("## Risks\n\n- none");
  });

  it("falls back to generic section formatting for a malformed handoff shape", () => {
    // Missing generatedAt: not a strict handoff, so the generic section path runs.
    const malformed = handoffResponse({
      title: "No timestamp",
      sections: [{ heading: "Summary", items: ["ok"] }],
    });
    expect(formatRuntimeResponse(malformed, "brief")).toBe(
      "OH MY PM plan: ok\nsections: 1\n- Summary\n",
    );
    expect(formatRuntimeResponse(malformed, "markdown")).toBe(
      "# OH MY PM Plan\n\n## Summary\n\n- ok\n",
    );
  });

  it("falls back when a handoff section item is not a string", () => {
    const malformed = handoffResponse({
      title: "Bad items",
      sections: [{ heading: "Risks", items: [42] }],
      generatedAt: "t0",
    });
    // Not a strict handoff (non-string item), so it drops to generic formatting.
    expect(formatRuntimeResponse(malformed, "brief")).toBe(
      "OH MY PM plan: ok\nsections: 1\n- Risks\n",
    );
  });

  it("keeps json mode untouched for handoff outputs", () => {
    const response: RuntimeResponse = {
      ...handoffResponse(fixtureHandoff),
      trace: [{ step: "skill.execute", status: "ok" }],
    };
    expect(JSON.parse(formatRuntimeResponse(response, "json"))).toEqual(response);
  });

  it("ends handoff outputs with exactly one newline", () => {
    const brief = formatRuntimeResponse(handoffResponse(fixtureHandoff), "brief");
    const markdown = formatRuntimeResponse(handoffResponse(fixtureHandoff), "markdown");
    for (const output of [brief, markdown]) {
      expect(output.endsWith("\n")).toBe(true);
      expect(output.endsWith("\n\n")).toBe(false);
    }
  });

  it("ends every output with exactly one newline", () => {
    const planResponse: RuntimeResponse = {
      id: "cli-plan",
      ok: true,
      data: { output: { sections: [{ heading: "Summary", items: ["ok"] }] } },
    };
    const outputs = [
      formatRuntimeResponse(statusResponse, "brief"),
      formatRuntimeResponse(statusResponse, "markdown"),
      formatRuntimeResponse(statusResponse, "json"),
      formatRuntimeResponse(doctorResponse, "brief"),
      formatRuntimeResponse(doctorResponse, "markdown"),
      formatRuntimeResponse(failedResponse, "brief"),
      formatRuntimeResponse(planResponse, "brief"),
      formatRuntimeResponse(planResponse, "markdown"),
      formatRuntimeResponse(planResponse, "json"),
      formatCliError("OMP-C-3002", "unsupported option: --bad", "brief"),
      formatCliError("OMP-C-3002", "unsupported option: --bad", "markdown"),
      formatCliError("OMP-C-3002", "unsupported option: --bad", "json"),
    ];
    for (const output of outputs) {
      expect(output.endsWith("\n")).toBe(true);
      expect(output.endsWith("\n\n")).toBe(false);
    }
  });
});

describe("cli formatting — signal metadata", () => {
  it("appends risk metadata in the canonical brief order", () => {
    const response: RuntimeResponse = {
      id: "cli-risks",
      ok: true,
      data: {
        output: {
          risks: [
            {
              id: "github:issue:o/r#7",
              title: "#7 Flaky pipeline",
              severity: "high",
              reason: "github_label:blocker",
              source: "github-issue",
              url: "https://github.com/o/r/issues/7",
              owner: "alice",
              due: "2026-04-01",
              repository: "o/r",
              number: 7,
            },
          ],
        },
      },
    };
    expect(formatRuntimeResponse(response, "brief")).toBe(
      [
        "OH MY PM risks: 1",
        "- [high] #7 Flaky pipeline — github_label:blocker — owner: alice — due: 2026-04-01 — source: o/r#7 — https://github.com/o/r/issues/7",
        "",
      ].join("\n"),
    );
  });

  it("renders a risk as a safe Markdown link with owner and due", () => {
    const response: RuntimeResponse = {
      id: "cli-risks",
      ok: true,
      data: {
        output: {
          risks: [
            {
              id: "github:issue:o/r#7",
              title: "#7 Flaky pipeline",
              severity: "high",
              reason: "github_label:blocker",
              source: "github-issue",
              url: "https://github.com/o/r/issues/7",
              owner: "alice",
              due: "2026-04-01",
            },
          ],
        },
      },
    };
    const md = formatRuntimeResponse(response, "markdown");
    expect(md).toContain(
      "- **high** — [#7 Flaky pipeline](https://github.com/o/r/issues/7) — `github_label:blocker` — owner: `alice` — due: `2026-04-01`",
    );
    expect(md.endsWith("\n")).toBe(true);
    expect(md.endsWith("\n\n")).toBe(false);
  });

  it("includes a next-task priority and repository source in brief mode", () => {
    const response: RuntimeResponse = {
      id: "cli-next",
      ok: true,
      data: {
        output: {
          tasks: [
            {
              id: "github:issue:o/r#8",
              title: "#8 Add docs",
              reason: "github_issue:open",
              priority: "high",
              source: "github-issue",
              repository: "o/r",
              number: 8,
              url: "https://github.com/o/r/issues/8",
            },
            { id: "d1#task-1", title: "Local task", reason: "markdown_unchecked_task", source: "markdown" },
          ],
        },
      },
    };
    const brief = formatRuntimeResponse(response, "brief");
    expect(brief).toContain(
      "- [high] #8 Add docs — github_issue:open — source: o/r#8 — https://github.com/o/r/issues/8",
    );
    // A task with no priority keeps the plain "- Title — reason" shape.
    expect(brief).toContain("- Local task — markdown_unchecked_task");
  });

  it("never emits body, token, or trace fields in output", () => {
    const response: RuntimeResponse = {
      id: "cli-risks",
      ok: true,
      data: {
        output: {
          risks: [{ id: "a", title: "T", severity: "low", reason: "explicit", source: "structured" }],
        },
      },
    };
    const json = formatRuntimeResponse(response, "json");
    expect(json).not.toContain("Bearer");
    expect(json).not.toContain("Authorization");
    const md = formatRuntimeResponse(response, "markdown");
    expect(md).not.toContain("body");
  });
});
