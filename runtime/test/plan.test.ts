import type {
  JsonValue,
  RuntimeRequest,
  ValidationReport,
  ValidationTarget,
} from "@oh-my-pm/contracts";
import type { KernelApi } from "@oh-my-pm/kernel";
import { createLocalProvider, createProviderRegistry } from "@oh-my-pm/providers";
import type { Provider } from "@oh-my-pm/providers";
import type { SkillRegistry } from "@oh-my-pm/skills";
import { describe, expect, it } from "vitest";
import { createRuntime } from "../src/index.js";
import type { RuntimeDeps } from "../src/index.js";

function passingReport(target: ValidationTarget): ValidationReport {
  return { target, passed: true, errors: [], warnings: [] };
}

function fakeKernel(overrides: Partial<KernelApi> = {}): KernelApi {
  return {
    version: () => "kernel-test",
    validateJson: (target) => passingReport(target),
    checkUpdatePlan: (plan) => ({
      status: "blocked",
      planId: plan.id,
      planHash: `test:${plan.id}`,
      reasons: ["unused"],
    }),
    decideTransition: (input) => ({
      from: input.from,
      to: input.to,
      allowed: false,
      reason: "unused",
    }),
    ...overrides,
  };
}

function planRequest(payload: JsonValue): RuntimeRequest {
  return { id: "req-plan", kind: "plan", locale: "en", payload };
}

function runtimeWith(overrides: Partial<RuntimeDeps> = {}) {
  return createRuntime({
    kernel: fakeKernel(),
    version: "2.0.0-alpha.0",
    now: "test-now",
    ...overrides,
  });
}

const localRegistry = () =>
  createProviderRegistry([
    createLocalProvider({
      items: [
        { id: "task-1", title: "Fix login flow", data: { status: "open" } },
        { id: "task-2", title: "Write onboarding doc", data: { status: "open" } },
      ],
    }),
  ]);

const steps = (response: { trace?: { step: string }[] }) =>
  (response.trace ?? []).map((entry) => entry.step);

describe("runtime plan execution", () => {
  it("plans and executes without provider requests", async () => {
    const response = await runtimeWith().handle(planRequest({ request: "what is next" }));
    expect(response.ok).toBe(true);
    const data = response.data as Record<string, JsonValue>;
    expect((data["plannerResult"] as Record<string, JsonValue>)["status"]).toBe("ok");
    expect(data["graph"]).toBeDefined();
    expect(data["providerResponses"]).toEqual([]);
    expect((data["skillOutput"] as Record<string, JsonValue>)["ok"]).toBe(true);
    expect(steps(response)).toEqual([
      "runtime.receive",
      "kernel.validate.systemRequest",
      "planner.input",
      "planner.plan",
      "kernel.validate.taskGraph",
      "skill.execute",
    ]);
  });

  it("executes local provider reads and feeds items to the skill", async () => {
    const response = await runtimeWith({ providers: localRegistry() }).handle(
      planRequest({
        request: "what is next",
        context: { providerRequests: [{ providerId: "local", action: "list", query: "" }] },
      }),
    );
    expect(response.ok).toBe(true);
    const data = response.data as Record<string, JsonValue>;
    const providerResponses = data["providerResponses"] as Array<Record<string, JsonValue>>;
    expect(providerResponses).toHaveLength(1);
    const output = data["output"] as { tasks: Array<{ title: string; reason: string }> };
    expect(output.tasks.map((t) => t.title)).toEqual(["Fix login flow", "Write onboarding doc"]);
    expect(output.tasks.map((t) => t.reason)).toEqual(["open_item", "open_item"]);
    expect(steps(response)).toContain("provider.execute");
  });

  it("extracts line-level risks only from recognized risk headings", async () => {
    // A document with no risk heading contributes no risk; a document with a
    // Blockers section contributes one line-level risk per list item, never a
    // document-title collapse.
    const providers = createProviderRegistry([
      createLocalProvider({
        items: [
          {
            id: "docs/notes.md",
            type: "document",
            title: "Meeting Notes",
            data: { path: "docs/notes.md", content: "Everything is on schedule.", bytes: 26 },
          },
          {
            id: "docs/constraints.md",
            type: "document",
            title: "Delivery Constraints",
            data: {
              path: "docs/constraints.md",
              content: ["# Delivery Constraints", "", "## Blockers", "", "- The launch is blocked by the vendor."].join("\n"),
              bytes: 80,
            },
          },
        ],
      }),
    ]);
    const response = await runtimeWith({ providers }).handle(
      planRequest({
        request: "review project risks",
        context: { providerRequests: [{ providerId: "local", action: "list", query: "" }] },
      }),
    );
    expect(response.ok).toBe(true);
    const data = response.data as Record<string, JsonValue>;
    const output = data["output"] as {
      risks: Array<{ id: string; title: string; severity: string; reason: string }>;
    };
    expect(output.risks).toEqual([
      {
        id: "docs/constraints.md#risk-1",
        title: "The launch is blocked by the vendor.",
        severity: "high",
        reason: "markdown_heading:blockers",
        source: "markdown",
      },
    ]);
  });

  it("derives next tasks from unchecked markdown checkboxes in document content", async () => {
    const documentItems = [
      {
        id: "docs/actions.md",
        type: "document" as const,
        title: "Delivery Notes",
        data: {
          path: "docs/actions.md",
          content: [
            "# Delivery Notes",
            "",
            "- [ ] Confirm print quantity.",
            "- [x] Approve the cover.",
            "- [ ] Schedule the proof review.",
          ].join("\n"),
          bytes: 100,
        },
      },
    ];
    const snapshot = JSON.parse(JSON.stringify(documentItems));
    const providers = createProviderRegistry([createLocalProvider({ items: documentItems })]);
    const response = await runtimeWith({ providers }).handle(
      planRequest({
        request: "derive next project tasks",
        context: { providerRequests: [{ providerId: "local", action: "list", query: "" }] },
      }),
    );
    expect(response.ok).toBe(true);
    const data = response.data as Record<string, JsonValue>;
    const skillOutput = data["skillOutput"] as Record<string, JsonValue>;
    expect(skillOutput["skillId"]).toBe("deriveNextTasks");
    const output = data["output"] as {
      tasks: Array<{ id: string; title: string; reason: string }>;
    };
    expect(output.tasks).toEqual([
      {
        id: "docs/actions.md#task-1",
        title: "Confirm print quantity.",
        reason: "markdown_unchecked_task",
        source: "markdown",
      },
      {
        id: "docs/actions.md#task-3",
        title: "Schedule the proof review.",
        reason: "markdown_unchecked_task",
        source: "markdown",
      },
    ]);
    expect(documentItems).toEqual(snapshot);
  });

  it("feeds document data.content into the risk skill as item body via a marker", async () => {
    // Regression guard for the Markdown pipeline: the loader stores document
    // text in data.content and detection comes from the body alone — here an
    // explicit Blocker: marker line, recognized even before any heading.
    const documentItems = [
      {
        id: "docs/constraints.md",
        type: "document" as const,
        title: "Delivery Constraints",
        data: {
          path: "docs/constraints.md",
          content: "Blocker: The launch is blocked by an external dependency.",
          bytes: 57,
        },
      },
    ];
    const snapshot = JSON.parse(JSON.stringify(documentItems));
    const providers = createProviderRegistry([createLocalProvider({ items: documentItems })]);
    const response = await runtimeWith({ providers }).handle(
      planRequest({
        request: "review project risks",
        context: { providerRequests: [{ providerId: "local", action: "list", query: "" }] },
      }),
    );
    expect(response.ok).toBe(true);
    const data = response.data as Record<string, JsonValue>;
    const skillOutput = data["skillOutput"] as Record<string, JsonValue>;
    expect(skillOutput["skillId"]).toBe("extractRisks");
    const output = data["output"] as {
      risks: Array<{ id: string; title: string; severity: string; reason: string }>;
    };
    expect(output.risks).toEqual([
      {
        id: "docs/constraints.md#risk-1",
        title: "The launch is blocked by an external dependency.",
        severity: "high",
        reason: "markdown_marker:blocker",
        source: "markdown",
      },
    ]);
    expect(documentItems).toEqual(snapshot);
  });

  it("derives handoff sections from generic Markdown items alone", async () => {
    // Neutral document titles: extraction must depend on Markdown section
    // headings and body content, not on accidental title matches. The Runtime
    // must not alias generic items into explicit tasks/risks/changes/decisions.
    const documentItems = [
      {
        id: "docs/one.md",
        type: "document" as const,
        title: "Field Notes",
        data: {
          path: "docs/one.md",
          content: [
            "# Field Notes",
            "",
            "## Current objective",
            "",
            "Ship the printable edition.",
            "",
            "## Next actions",
            "",
            "- [ ] Confirm the paper stock.",
            "- [x] Approve the legend.",
          ].join("\n"),
          bytes: 120,
        },
      },
      {
        id: "docs/two.md",
        type: "document" as const,
        title: "Delivery Constraints",
        data: {
          path: "docs/two.md",
          content: [
            "# Blockers",
            "",
            "Preamble prose that is not a blocker line.",
            "",
            "- The quote is blocked until the supplier responds.",
            "",
            "# Decisions",
            "",
            "- Ship as a single volume.",
          ].join("\n"),
          bytes: 140,
        },
      },
    ];
    const snapshot = JSON.parse(JSON.stringify(documentItems));
    const providers = createProviderRegistry([createLocalProvider({ items: documentItems })]);
    const response = await runtimeWith({ providers }).handle(
      planRequest({
        request: "create project handoff",
        context: { providerRequests: [{ providerId: "local", action: "list", query: "" }] },
      }),
    );
    expect(response.ok).toBe(true);
    const data = response.data as Record<string, JsonValue>;
    const skillOutput = data["skillOutput"] as Record<string, JsonValue>;
    expect(skillOutput["skillId"]).toBe("createHandoff");

    const output = data["output"] as {
      title: string;
      sections: Array<{ heading: string; items: string[] }>;
    };
    expect(output.title).toBe("Field Notes");
    const items = (heading: string) =>
      output.sections.find((section) => section.heading === heading)?.items ?? [];

    // Summary from the objective section; open task from the unchecked box only.
    expect(items("Summary")).toEqual(["Ship the printable edition."]);
    expect(items("Open Tasks")).toEqual(["Confirm the paper stock."]);
    // The checked box never becomes a task; neutral titles never become tasks.
    expect(items("Open Tasks")).not.toContain("Approve the legend.");
    expect(items("Open Tasks")).not.toContain("Field Notes");
    expect(items("Open Tasks")).not.toContain("Delivery Constraints");
    // Blocker section becomes a risk; its preamble prose does not.
    expect(items("Risks")).toEqual(["The quote is blocked until the supplier responds."]);
    expect(items("Risks")).not.toContain("Preamble prose that is not a blocker line.");
    // Decision section becomes a decision.
    expect(items("Decisions")).toEqual(["Ship as a single volume."]);

    // The Runtime passed generic items only: no explicit alias keys leaked.
    const providerResponses = JSON.stringify(data["providerResponses"]);
    expect(providerResponses).toContain("docs/one.md");
    // Source document objects are never mutated by the read-only pipeline.
    expect(documentItems).toEqual(snapshot);
  });

  it("returns OMP-R-2004 when the payload cannot become planner input", async () => {
    const response = await runtimeWith().handle(planRequest({ context: {} }));
    expect(response.ok).toBe(false);
    expect(response.error?.code).toBe("OMP-R-2004");
  });

  it("returns OMP-R-2004 when the planner reports missing context", async () => {
    const response = await runtimeWith().handle(planRequest({ request: "   " }));
    expect(response.ok).toBe(false);
    expect(response.error?.code).toBe("OMP-R-2004");
    const data = response.data as Record<string, JsonValue>;
    expect(data["reason"]).toBe("request_missing");
  });

  it("stops before providers and skills when graph validation fails", async () => {
    const kernel = fakeKernel({
      validateJson: (target) =>
        target === "taskGraph"
          ? {
              target,
              passed: false,
              errors: [{ code: "OMP-K-1006", message: "cycle", path: "", blocking: true }],
              warnings: [],
            }
          : passingReport(target),
    });
    const response = await runtimeWith({ kernel, providers: localRegistry() }).handle(
      planRequest({
        request: "what is next",
        context: { providerRequests: [{ providerId: "local", action: "list", query: "" }] },
      }),
    );
    expect(response.error?.code).toBe("OMP-R-2007");
    expect(steps(response)).not.toContain("provider.execute");
    expect(steps(response)).not.toContain("skill.execute");
  });

  it("returns OMP-R-2005 when the provider registry is missing", async () => {
    const response = await runtimeWith().handle(
      planRequest({
        request: "what is next",
        context: { providerRequests: [{ providerId: "local", action: "list", query: "" }] },
      }),
    );
    expect(response.error?.code).toBe("OMP-R-2005");
    expect(response.error?.message).toBe("provider registry is not configured");
  });

  it("returns OMP-R-2005 when a provider execution fails", async () => {
    const failingGithub: Provider = {
      descriptor: {
        id: "github",
        name: "Failing GitHub",
        readOnly: true,
        capabilities: [{ action: "search", readOnly: true }],
      },
      execute: async () => ({
        ok: false,
        code: "OMP-P-4003",
        message: "credentials missing",
        response: { providerId: "github", items: [] },
      }),
    };
    const response = await runtimeWith({ providers: createProviderRegistry([failingGithub]) }).handle(
      planRequest({
        request: "what is next",
        context: { providerRequests: [{ providerId: "github", action: "search", query: "x" }] },
      }),
    );
    expect(response.error?.code).toBe("OMP-R-2005");
    expect(response.error?.message).toContain("credentials missing");
  });

  it("returns OMP-R-2006 when the skill fails", async () => {
    const failingSkills: SkillRegistry = {
      list: () => [],
      get: () => undefined,
      execute: (input) => ({
        skillId: input.skillId,
        ok: false,
        output: { code: "OMP-S-5003", message: "skill exploded" },
        warnings: [{ code: "OMP-S-5003", message: "skill exploded" }],
      }),
    };
    const response = await runtimeWith({ skills: failingSkills }).handle(
      planRequest({ request: "what is next" }),
    );
    expect(response.error?.code).toBe("OMP-R-2006");
  });

  it("keeps executeSkill unsupported", async () => {
    const response = await runtimeWith().handle({
      id: "req-skill",
      kind: "executeSkill",
      locale: "en",
      payload: {},
    });
    expect(response.error?.code).toBe("OMP-R-2002");
  });

  it("produces JSON-serializable responses without stack traces", async () => {
    const throwingSkills: SkillRegistry = {
      list: () => [],
      get: () => undefined,
      execute: () => {
        throw new Error("secret skill stack");
      },
    };
    const ok = await runtimeWith({ providers: localRegistry() }).handle(
      planRequest({ request: "status report" }),
    );
    expect(JSON.parse(JSON.stringify(ok))).toEqual(ok);
    const thrown = await runtimeWith({ skills: throwingSkills }).handle(
      planRequest({ request: "status report" }),
    );
    expect(thrown.error?.code).toBe("OMP-R-2003");
    expect(JSON.stringify(thrown)).not.toContain("secret skill stack");
  });
});
