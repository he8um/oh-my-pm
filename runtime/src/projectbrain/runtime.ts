// The Project Brain Runtime factory (v0.3 Phase 3).
//
// A SEPARATE programmatic surface from createRuntime()/Runtime.handle(). It wires
// the capture and compare orchestration to the injected dependency ports. No CLI
// or MCP surface invokes it; it is a workspace/programmatic API only.

import { captureProject } from "./capture.js";
import { compareProject } from "./compare.js";
import { timelineProject } from "./timeline.js";
import type {
  CaptureProjectInput,
  CaptureProjectResult,
  CompareProjectInput,
  CompareProjectResult,
  ProjectBrainRuntime,
  ProjectBrainRuntimeDeps,
  TimelineProjectInput,
  TimelineProjectResult,
} from "./types.js";

/** Create a Project Brain Runtime from its dependency ports. */
export function createProjectBrainRuntime(
  deps: ProjectBrainRuntimeDeps,
): ProjectBrainRuntime {
  return {
    capture(input: CaptureProjectInput): Promise<CaptureProjectResult> {
      return captureProject(deps, input);
    },
    compare(input: CompareProjectInput): Promise<CompareProjectResult> {
      return compareProject(deps, input);
    },
    timeline(input: TimelineProjectInput): Promise<TimelineProjectResult> {
      return timelineProject(deps, input);
    },
  };
}
