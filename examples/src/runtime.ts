import { createLocalProvider, createProviderRegistry } from "@oh-my-pm/providers";
import type { Runtime } from "@oh-my-pm/runtime";
import { createRuntime } from "@oh-my-pm/runtime";
import { createDefaultSkillRegistry } from "@oh-my-pm/skills";
import { createExampleKernelApi } from "./kernel.js";

/** Fully injected example Runtime: local provider, default skills, fixed now. */
export function createExampleRuntime(): Runtime {
  return createRuntime({
    kernel: createExampleKernelApi(),
    version: "2.0.0-alpha.0-example",
    providers: createProviderRegistry([
      createLocalProvider({
        items: [
          {
            id: "task-1",
            type: "task",
            title: "Finalize project roadmap",
            data: {
              status: "open",
              owner: "PM",
              due: "2026-01-10",
              tags: ["planning"],
            },
          },
          {
            id: "risk-1",
            type: "task",
            title: "Blocked dependency on design review",
            data: {
              status: "blocked",
              owner: "Design",
              tags: ["blocked", "risk"],
            },
          },
          {
            id: "task-2",
            type: "task",
            title: "Prepare launch handoff",
            data: {
              status: "open",
              owner: "Ops",
              tags: ["handoff"],
            },
          },
        ],
      }),
    ]),
    skills: createDefaultSkillRegistry(),
    now: "2026-01-01T00:00:00.000Z",
  });
}
