#!/usr/bin/env node
// Private local development wrapper for the OH MY PM CLI core.
// Uses an injected deterministic local Kernel boundary and local provider
// seed data. This is not a production release and is not published.

import { runCli } from "../dist/index.js";
import { createRuntime } from "@oh-my-pm/runtime";
import { createLocalProvider, createProviderRegistry } from "@oh-my-pm/providers";
import { createDefaultSkillRegistry } from "@oh-my-pm/skills";

function createLocalCliKernelApi() {
  return {
    version() {
      return "2.0.0-alpha.0-local";
    },
    validateJson(target) {
      return {
        target,
        passed: true,
        errors: [],
        warnings: [],
      };
    },
    checkUpdatePlan(plan) {
      return {
        status: "allowed",
        planId: plan.id,
        planHash: `local:${plan.id}`,
        reasons: [],
      };
    },
    decideTransition(input) {
      return {
        from: input.from,
        to: input.to,
        allowed: true,
        reason: "local_cli_wrapper",
      };
    },
  };
}

function createLocalCliProviders() {
  return createProviderRegistry([
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
  ]);
}

function createLocalCliRuntime() {
  return createRuntime({
    kernel: createLocalCliKernelApi(),
    providers: createLocalCliProviders(),
    skills: createDefaultSkillRegistry(),
    version: "2.0.0-alpha.0-local",
    now: "2026-01-01T00:00:00.000Z",
  });
}

const result = runCli(process.argv.slice(2), { runtime: createLocalCliRuntime() });

if (result.stdout !== "") {
  process.stdout.write(result.stdout);
}

if (result.stderr !== "") {
  process.stderr.write(result.stderr);
}

process.exitCode = result.exitCode;
