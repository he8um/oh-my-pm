// Structured output helpers for Oh My PM MCP tool responses.

export type ToolStatus = "ok" | "partial" | "error";

export interface BaseResponse {
  status: ToolStatus;
  data_source: "local_repo";
  read_at: string;
}

export interface PartialResponse extends BaseResponse {
  status: "partial";
  warnings: string[];
}

export interface ErrorResponse {
  status: "error";
  error_code: string;
  message: string;
}

export function now(): string {
  return new Date().toISOString();
}

export function makeError(error_code: string, message: string): ErrorResponse {
  return { status: "error", error_code, message };
}

export function baseResponse(status: ToolStatus = "ok"): BaseResponse {
  return { status, data_source: "local_repo", read_at: now() };
}
