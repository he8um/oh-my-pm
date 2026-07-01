import type { AirtableClient } from "./client.js";
import type { AirtableBase } from "./types.js";

interface RawAirtableBase {
  id: string;
  name: string;
  permissionLevel: string;
}

const METADATA_API_ROOT = "https://api.airtable.com/v0/meta";

export async function fetchBases(
  client: AirtableClient
): Promise<{ bases: AirtableBase[] | null; error: unknown | null }> {
  const result = await client.get<{ bases: RawAirtableBase[] }>("/bases", METADATA_API_ROOT);

  if (result.error) return { bases: null, error: result.error };

  const bases = (result.data?.bases ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    permission_level: b.permissionLevel ?? null,
  }));

  return { bases, error: null };
}
