import type { AirtableClient } from "./client.js";
import type { AirtableTable, AirtableTableSchema } from "./types.js";

interface RawAirtableField {
  id: string;
  name: string;
  type: string;
}

interface RawAirtableView {
  id: string;
  name: string;
  type: string;
}

interface RawAirtableTable {
  id: string;
  name: string;
  primaryFieldId: string;
  fields: RawAirtableField[];
  views: RawAirtableView[];
}

const METADATA_API_ROOT = "https://api.airtable.com/v0/meta";

async function fetchRawTables(
  client: AirtableClient
): Promise<{ tables: RawAirtableTable[] | null; error: unknown | null }> {
  const result = await client.get<{ tables: RawAirtableTable[] }>(
    `/bases/${client.baseId}/tables`,
    METADATA_API_ROOT
  );

  if (result.error) return { tables: null, error: result.error };
  return { tables: result.data?.tables ?? [], error: null };
}

export async function fetchTables(
  client: AirtableClient
): Promise<{ tables: AirtableTable[] | null; error: unknown | null }> {
  const { tables: raw, error } = await fetchRawTables(client);
  if (error) return { tables: null, error };

  const tables: AirtableTable[] = (raw ?? []).map((t) => {
    const primaryField = t.fields.find((f) => f.id === t.primaryFieldId);
    return {
      id: t.id,
      name: t.name,
      field_count: t.fields.length,
      primary_field_name: primaryField?.name ?? null,
    };
  });

  return { tables, error: null };
}

export async function fetchTableSchema(
  client: AirtableClient,
  tableIdOrName: string
): Promise<{ schema: AirtableTableSchema | null; error: unknown | null }> {
  const { tables: raw, error } = await fetchRawTables(client);
  if (error) return { schema: null, error };

  const table = (raw ?? []).find(
    (t) => t.id === tableIdOrName || t.name === tableIdOrName
  );
  if (!table) return { schema: null, error: null };

  return {
    schema: {
      id: table.id,
      name: table.name,
      fields: table.fields.map((f) => ({ id: f.id, name: f.name, type: f.type })),
      views: table.views.map((v) => ({ id: v.id, name: v.name, type: v.type })),
    },
    error: null,
  };
}

// Resolves a table_id/table_name parameter (or config default) to the
// identifier Airtable's data API accepts in a record-listing path segment.
export function resolveTableIdentifier(
  client: AirtableClient,
  paramTableId?: string,
  paramTableName?: string
): string | null {
  return paramTableId ?? client.tableId ?? paramTableName ?? client.tableName ?? null;
}
