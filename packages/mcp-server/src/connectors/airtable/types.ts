export interface AirtableBase {
  id: string;
  name: string;
  permission_level: string | null;
}

export interface AirtableFieldSchema {
  id: string;
  name: string;
  type: string;
}

export interface AirtableTable {
  id: string;
  name: string;
  field_count: number;
  primary_field_name: string | null;
}

export interface AirtableTableSchema {
  id: string;
  name: string;
  fields: AirtableFieldSchema[];
  views: AirtableViewSummary[];
}

export interface AirtableViewSummary {
  id: string;
  name: string;
  type: string;
}

export interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
  created_time: string;
}
