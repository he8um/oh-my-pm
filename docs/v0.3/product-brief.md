# v0.3 Product Brief — Project Brain Foundation

## Summary

OH MY PM `v0.2.0` is a stateless, deterministic, read-only project-intelligence
transformer. Given a local Markdown project (or, on explicit opt-in, read-only
GitHub context) it produces a brief, a risk report, a next-task list, or a
handoff. It is fast, private, and reproducible — and it forgets everything the
moment it exits. v0.3 adds the one foundation it lacks: a local, privacy-
preserving memory of what was observed, so the product can answer *what changed*.

## Primary user

The **delivery-accountable individual** who runs OH MY PM against a project they
own or steward: a technical project manager, a product owner, an engineering
lead, or a solo maintainer. They already run `brief` / `risks` / `next` /
`handoff` against a local project directory or a GitHub repository. They work
locally, care about privacy, and do not want their project content leaving their
machine or their project files being edited.

This user is deliberately the same one v0.2 already serves. v0.3 does not chase a
new audience; it deepens the value for the audience the product already has.

## Job to be done

> "When I check on my project, I don't just want to know its state right now — I
> want to know **what changed since I last looked**, **which risks are new or
> worsening**, **which decisions are still active**, and **how stale my
> understanding is** — without uploading my project anywhere or letting the tool
> touch my files."

Today the product answers only the first half of the first clause — the state
right now. Everything after "since I last looked" is unanswerable, because
nothing is remembered.

## Current pain

1. **No memory.** Every run is an island. There is no `before` to compare
   `now` against. (Confirmed: no persistence, cache, or snapshot store exists
   anywhere in the source; the runtime, planner, skills, and local provider are
   all pure and stateless with dedicated purity tests.)
2. **No change awareness.** The `review-changes` skill compares inputs *within a
   single invocation*; it cannot compare two observations taken at different
   times. A risk that appeared, worsened, or was resolved between Monday and
   Friday is invisible.
3. **No decision continuity.** Handoffs extract decisions from the current
   documents, but there is no durable record of which decisions are still active,
   superseded, or stale.
4. **No freshness signal.** A brief looks identical whether the underlying
   documents were touched an hour ago or a year ago. The user cannot tell how
   much to trust the current understanding.
5. **No history.** "What did the system know last week?" has no answer.

None of these are bugs. They are the absence of a foundation. v0.2 was
intentionally built as a pure transformer; the pain is the natural ceiling of a
system that keeps no state.

## User-observable success condition

A user can:

1. run an analysis of a local project as they do today;
2. **explicitly** capture that observation into local memory;
3. change the project;
4. capture again;
5. ask for the **changes** between the two captures and receive a deterministic,
   reviewable answer (added / removed / resolved / worsened / became overdue /
   went stale — per item);
6. see the **evidence** each change is grounded in;
7. **export** or **delete** the entire local memory at any time.

Success is proven when steps 1–7 run offline, produce byte-deterministic change
output for the same inputs and injected clock, write nothing inside the project,
upload nothing, and store no secrets.

## North Star

> OH MY PM can capture a project observation locally, preserve minimized
> evidence, compare it with the previous observation, and return deterministic
> changes — without modifying the project or uploading its content.

The North Star is:

- **narrow** — one minor version delivers capture, compare, and evidence lookup
  over the sources the product already reads;
- **provider-independent** — the memory model knows nothing about Markdown vs.
  GitHub; providers stay read-only acquisition only;
- **local-first** — all state lives in an OH MY PM application-data directory,
  never in the project and never in the network;
- **deterministic** — same inputs plus same injected clock produce deep-equal
  snapshots and change sets, matching the existing extraction guarantee;
- **compatible** — every existing v0.2 workflow, provider, MCP tool, and install
  path keeps working unchanged; memory is strictly additive and optional.

## Non-goals

The following are explicitly **out of scope** for v0.3 and would each require a
separate, later decision:

- cloud sync, a remote database, accounts, or any server component;
- telemetry of any kind;
- vector databases, embeddings, semantic similarity, or a graph database;
- a background daemon, event bus, queue, or multi-agent scheme;
- autonomous write-back or any modification of project files;
- a mandatory LLM anywhere in the path (the memory engine stays rule-based and
  deterministic, exactly like the current extraction layer);
- a provider marketplace, new external providers, or a large MCP tool expansion;
- a dashboard, a mobile app, or real-time collaboration;
- bidirectional third-party sync.

## Why now

v0.2 is stable, closed, and architecturally sound. The contract-generation
pipeline, the pure Rust/WASM kernel, the read-only provider boundary, and the
sanitized MCP projection layer are exactly the substrate a memory foundation
needs — and none of them exist to be redesigned. The gap is not another provider
or another report; it is the state layer that every future intelligence surface
(project-health, project-change, decision-tracking) would otherwise have to
invent independently. Building it once, narrowly, is the highest-leverage next
step. See [current-gap-analysis.md](current-gap-analysis.md) and
[option-evaluation.md](option-evaluation.md) for the evidence and the comparison.
