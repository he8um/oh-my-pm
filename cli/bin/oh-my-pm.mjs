#!/usr/bin/env node
// Private local development wrapper for the OH MY PM CLI core.
// The Kernel is the real Rust Kernel loaded through the WASM binding.
// For status/doctor/plan/install-preview the provider seed data remains
// local; for the brief, risks, next, and handoff project workflows the local
// provider is populated from read-only Markdown project documents under the
// requested root. This is not a production release and is not distributed.

import { loadMarkdownProjectDocuments, parseCliArgs, runCli } from "../dist/index.js";
import { createNodeWasmKernelApi } from "@oh-my-pm/kernel";
import { createRuntime } from "@oh-my-pm/runtime";
import { createLocalProvider, createProviderRegistry } from "@oh-my-pm/providers";
import { createDefaultSkillRegistry } from "@oh-my-pm/skills";

const SEED_ITEMS = [
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
];

function createLocalCliProviders(items) {
  return createProviderRegistry([createLocalProvider({ items })]);
}

function createLocalCliRuntime(items) {
  return createRuntime({
    kernel: createNodeWasmKernelApi(),
    providers: createLocalCliProviders(items),
    skills: createDefaultSkillRegistry(),
    version: "2.0.0-alpha.0-local",
    now: "2026-01-01T00:00:00.000Z",
  });
}

const args = process.argv.slice(2);
const parsed = parseCliArgs(args);

let providerItems = SEED_ITEMS;
let blocked = false;

const usesProjectDocuments =
  parsed.ok &&
  (parsed.command === "brief" ||
    parsed.command === "risks" ||
    parsed.command === "next" ||
    parsed.command === "handoff");

if (usesProjectDocuments) {
  // Errors report the root exactly as the user typed it, never a resolved
  // internal absolute path, and never any document content.
  const root = parsed.input ?? ".";
  const loaded = loadMarkdownProjectDocuments(root);
  if (!loaded.ok) {
    const reason =
      loaded.warnings[0]?.code === "project_root_not_directory"
        ? "project root is not a directory"
        : "project root was not found";
    process.stderr.write(`${reason}: ${root}\n`);
    process.exitCode = 2;
    blocked = true;
  } else if (loaded.filesLoaded === 0) {
    process.stderr.write(`no markdown project documents found under: ${root}\n`);
    process.exitCode = 2;
    blocked = true;
  } else {
    providerItems = loaded.items;
  }
}

if (!blocked) {
  const result = runCli(args, { runtime: createLocalCliRuntime(providerItems) });

  if (result.stdout !== "") {
    process.stdout.write(result.stdout);
  }

  if (result.stderr !== "") {
    process.stderr.write(result.stderr);
  }

  process.exitCode = result.exitCode;
}
