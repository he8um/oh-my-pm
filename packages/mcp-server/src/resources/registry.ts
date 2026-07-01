import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { safeReadFile, getProjectRoot } from "../utils/safe-files.js";
import { now } from "../utils/formatting.js";
import { loadClickUpConfig } from "../connectors/clickup/config.js";
import { ClickUpClient } from "../connectors/clickup/client.js";
import { fetchWorkspaceContext, fetchSpaces } from "../connectors/clickup/hierarchy.js";
import { fetchOpenTasksInList } from "../connectors/clickup/tasks.js";
import { extractDeliveryTags } from "../connectors/clickup/formatters.js";
import { makeDegradedNoToken } from "../connectors/clickup/errors.js";
import { HARD_MAX_TASKS } from "../connectors/clickup/limits.js";
import { loadAirtableConfig } from "../connectors/airtable/config.js";
import { AirtableClient } from "../connectors/airtable/client.js";
import { fetchTables, resolveTableIdentifier } from "../connectors/airtable/tables.js";
import { fetchRecords } from "../connectors/airtable/records.js";
import { extractDataQualityTags } from "../connectors/airtable/formatters.js";
import { makeDegradedNoToken as makeAirtableDegradedNoToken } from "../connectors/airtable/errors.js";
import { HARD_MAX_RECORDS } from "../connectors/airtable/limits.js";

export function registerResources(server: McpServer): void {
  const root = getProjectRoot();

  server.resource(
    "project://current",
    "project://current",
    { description: "Current project context: name, version, and milestone state." },
    async (_uri) => {
      const [version, roadmapMd, readmeMd] = await Promise.all([
        safeReadFile(root, "VERSION"),
        safeReadFile(root, "ROADMAP.md"),
        safeReadFile(root, "README.md"),
      ]);
      const content = JSON.stringify(
        {
          read_at: now(),
          version: version?.trim() ?? "unknown",
          roadmap_excerpt: roadmapMd?.split("\n").slice(0, 20).join("\n") ?? null,
          readme_excerpt: readmeMd?.split("\n").slice(0, 10).join("\n") ?? null,
        },
        null,
        2
      );
      return { contents: [{ uri: "project://current", text: content }] };
    }
  );

  server.resource(
    "project://risks/open",
    "project://risks/open",
    { description: "Open risk register items from local repository." },
    async (_uri) => {
      const riskMd = await safeReadFile(root, "templates/en/risk-register.md");
      const content = JSON.stringify(
        {
          read_at: now(),
          note: "v0.7.0: risk data from local template only. Connect a project tool for live risks.",
          risk_register_available: riskMd !== null,
        },
        null,
        2
      );
      return { contents: [{ uri: "project://risks/open", text: content }] };
    }
  );

  server.resource(
    "project://decisions/open",
    "project://decisions/open",
    { description: "Open decisions with owners from local repository." },
    async (_uri) => {
      const decisionMd = await safeReadFile(root, "templates/en/decision-log.md");
      const content = JSON.stringify(
        {
          read_at: now(),
          note: "v0.7.0: decision data from local template only. Connect a project tool for live decisions.",
          decision_log_available: decisionMd !== null,
        },
        null,
        2
      );
      return { contents: [{ uri: "project://decisions/open", text: content }] };
    }
  );

  // ── ClickUp connector resources (read-only, bounded) ─────────────────────

  server.resource(
    "clickup://workspace/current",
    "clickup://workspace/current",
    { description: "Current configured ClickUp workspace identity." },
    async (_uri) => {
      const content = JSON.stringify(await readClickUpWorkspaceCurrent(), null, 2);
      return { contents: [{ uri: "clickup://workspace/current", text: content }] };
    }
  );

  server.resource(
    "clickup://spaces",
    "clickup://spaces",
    { description: "Spaces in the configured ClickUp workspace (bounded)." },
    async (_uri) => {
      const content = JSON.stringify(await readClickUpSpaces(), null, 2);
      return { contents: [{ uri: "clickup://spaces", text: content }] };
    }
  );

  server.resource(
    "clickup://tasks/open",
    "clickup://tasks/open",
    { description: "Open tasks in the configured ClickUp list (bounded)." },
    async (_uri) => {
      const content = JSON.stringify(await readClickUpOpenTasks(), null, 2);
      return { contents: [{ uri: "clickup://tasks/open", text: content }] };
    }
  );

  // ── Airtable connector resources (read-only, bounded) ────────────────────

  server.resource(
    "airtable://base/current",
    "airtable://base/current",
    { description: "Current configured Airtable base identity." },
    async (_uri) => {
      const content = JSON.stringify(await readAirtableBaseCurrent(), null, 2);
      return { contents: [{ uri: "airtable://base/current", text: content }] };
    }
  );

  server.resource(
    "airtable://tables",
    "airtable://tables",
    { description: "Tables in the configured Airtable base (bounded)." },
    async (_uri) => {
      const content = JSON.stringify(await readAirtableTables(), null, 2);
      return { contents: [{ uri: "airtable://tables", text: content }] };
    }
  );

  server.resource(
    "airtable://records/current",
    "airtable://records/current",
    { description: "Records in the configured Airtable table (bounded)." },
    async (_uri) => {
      const content = JSON.stringify(await readAirtableRecordsCurrent(), null, 2);
      return { contents: [{ uri: "airtable://records/current", text: content }] };
    }
  );
}

async function readClickUpWorkspaceCurrent(): Promise<Record<string, unknown>> {
  const { config, error } = loadClickUpConfig();
  if (error || !config) {
    return { read_at: now(), status: "error", error_code: "config_missing", message: error };
  }
  if (!config.token) {
    return { read_at: now(), ...makeDegradedNoToken() };
  }
  const client = new ClickUpClient(config);
  const { workspace, error: fetchError } = await fetchWorkspaceContext(
    client,
    config.workspaceId
  );
  if (fetchError) return { read_at: now(), ...(fetchError as Record<string, unknown>) };
  return { read_at: now(), status: "ok", workspace };
}

async function readClickUpSpaces(): Promise<Record<string, unknown>> {
  const { config, error } = loadClickUpConfig();
  if (error || !config) {
    return { read_at: now(), status: "error", error_code: "config_missing", message: error };
  }
  if (!config.token) {
    return { read_at: now(), ...makeDegradedNoToken() };
  }
  const client = new ClickUpClient(config);
  const { spaces, error: fetchError } = await fetchSpaces(client, config.workspaceId);
  if (fetchError) return { read_at: now(), ...(fetchError as Record<string, unknown>) };
  return { read_at: now(), status: "ok", spaces: spaces ?? [] };
}

async function readClickUpOpenTasks(): Promise<Record<string, unknown>> {
  const { config, error } = loadClickUpConfig();
  if (error || !config) {
    return { read_at: now(), status: "error", error_code: "config_missing", message: error };
  }
  if (!config.token) {
    return { read_at: now(), ...makeDegradedNoToken() };
  }
  if (!config.listId) {
    return {
      read_at: now(),
      status: "error",
      error_code: "config_missing",
      message: "OH_MY_PM_CLICKUP_LIST_ID is not set.",
    };
  }
  const client = new ClickUpClient(config);
  const { tasks, error: fetchError } = await fetchOpenTasksInList(
    client,
    config.listId,
    HARD_MAX_TASKS
  );
  if (fetchError) return { read_at: now(), ...(fetchError as Record<string, unknown>) };
  return {
    read_at: now(),
    status: "ok",
    list_id: config.listId,
    tasks: (tasks ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      delivery_tags: extractDeliveryTags(t),
    })),
  };
}

async function readAirtableBaseCurrent(): Promise<Record<string, unknown>> {
  const { config, error } = loadAirtableConfig();
  if (error || !config) {
    return { read_at: now(), status: "error", error_code: "config_missing", message: error };
  }
  if (!config.token) {
    return { read_at: now(), ...makeAirtableDegradedNoToken() };
  }
  return { read_at: now(), status: "ok", base_id: config.baseId };
}

async function readAirtableTables(): Promise<Record<string, unknown>> {
  const { config, error } = loadAirtableConfig();
  if (error || !config) {
    return { read_at: now(), status: "error", error_code: "config_missing", message: error };
  }
  if (!config.token) {
    return { read_at: now(), ...makeAirtableDegradedNoToken() };
  }
  const client = new AirtableClient(config);
  const { tables, error: fetchError } = await fetchTables(client);
  if (fetchError) return { read_at: now(), ...(fetchError as Record<string, unknown>) };
  return { read_at: now(), status: "ok", base_id: config.baseId, tables: tables ?? [] };
}

async function readAirtableRecordsCurrent(): Promise<Record<string, unknown>> {
  const { config, error } = loadAirtableConfig();
  if (error || !config) {
    return { read_at: now(), status: "error", error_code: "config_missing", message: error };
  }
  if (!config.token) {
    return { read_at: now(), ...makeAirtableDegradedNoToken() };
  }
  const client = new AirtableClient(config);
  const table = resolveTableIdentifier(client);
  if (!table) {
    return {
      read_at: now(),
      status: "error",
      error_code: "config_missing",
      message: "OH_MY_PM_AIRTABLE_TABLE_ID / OH_MY_PM_AIRTABLE_TABLE_NAME is not set.",
    };
  }
  const { records, error: fetchError } = await fetchRecords(client, table, HARD_MAX_RECORDS);
  if (fetchError) return { read_at: now(), ...(fetchError as Record<string, unknown>) };
  return {
    read_at: now(),
    status: "ok",
    base_id: config.baseId,
    table_id: table,
    records: (records ?? []).map((r) => ({
      id: r.id,
      data_quality_tags: extractDataQualityTags(r),
    })),
  };
}
