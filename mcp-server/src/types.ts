import type { JsonValue, RuntimeResponse } from "@oh-my-pm/contracts";

export type McpProjectOperation = "brief" | "risks" | "next" | "handoff";

export type McpProjectToolName =
  | "project_brief"
  | "project_risks"
  | "project_next"
  | "project_handoff";

export type McpProjectDocumentSummary = {
  filesScanned: number;
  filesMatched: number;
  filesExcluded: number;
  filesLoaded: number;
  totalBytes: number;
  configExists: boolean;
};

export type McpProjectToolSuccess = {
  ok: true;
  operation: McpProjectOperation;
  root: string;
  documents: McpProjectDocumentSummary;
  output: JsonValue;
  markdown: string;
  // Internal only: used by the runner tests and the server formatting step.
  // The MCP server layer must never expose this field to clients.
  runtimeResponse: RuntimeResponse;
};

export type McpProjectToolFailureCode =
  | "project_config_invalid"
  | "project_root_not_found"
  | "project_root_not_directory"
  | "project_documents_empty"
  | "project_runtime_failed"
  | "project_output_invalid";

export type McpProjectToolFailure = {
  ok: false;
  operation: McpProjectOperation;
  root: string;
  code: McpProjectToolFailureCode;
  message: string;
};

export type McpProjectToolExecution = McpProjectToolSuccess | McpProjectToolFailure;
