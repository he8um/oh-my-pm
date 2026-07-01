import type { AirtableClient } from "./client.js";
import type { AirtableRecord } from "./types.js";
import { excerptFieldValue, clampMaxItems } from "./limits.js";

interface RawAirtableRecord {
  id: string;
  fields: Record<string, unknown>;
  createdTime: string;
}

function excerptFields(fields: Record<string, unknown>): Record<string, unknown> {
  const excerpted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    excerpted[key] = excerptFieldValue(value);
  }
  return excerpted;
}

function toAirtableRecord(r: RawAirtableRecord): AirtableRecord {
  return {
    id: r.id,
    fields: excerptFields(r.fields ?? {}),
    created_time: r.createdTime,
  };
}

export async function fetchRecords(
  client: AirtableClient,
  tableIdOrName: string,
  maxItems?: number
): Promise<{ records: AirtableRecord[] | null; error: unknown | null }> {
  const limit = clampMaxItems(maxItems);
  const pageSize = Math.min(limit, 100);
  const result = await client.get<{ records: RawAirtableRecord[] }>(
    `/${client.baseId}/${encodeURIComponent(tableIdOrName)}?pageSize=${pageSize}`
  );

  if (result.error) return { records: null, error: result.error };

  const raw = result.data?.records ?? [];
  const records = raw.slice(0, limit).map(toAirtableRecord);

  return { records, error: null };
}

export async function fetchRecordById(
  client: AirtableClient,
  tableIdOrName: string,
  recordId: string
): Promise<{ record: AirtableRecord | null; error: unknown | null }> {
  const result = await client.get<RawAirtableRecord>(
    `/${client.baseId}/${encodeURIComponent(tableIdOrName)}/${recordId}`
  );

  if (result.error) return { record: null, error: result.error };
  if (!result.data) return { record: null, error: null };

  return { record: toAirtableRecord(result.data), error: null };
}
