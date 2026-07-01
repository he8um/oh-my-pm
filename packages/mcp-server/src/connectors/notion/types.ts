export interface NotionPageSummary {
  id: string;
  title: string;
  url: string;
  last_edited_time: string | null;
  properties: Record<string, unknown>;
}

export interface NotionDatabaseItem {
  id: string;
  title: string;
  url: string;
  last_edited_time: string | null;
  properties: Record<string, unknown>;
}

export interface NotionDatabasePropertySchema {
  name: string;
  type: string;
}

export interface NotionDatabaseSchema {
  id: string;
  title: string;
  properties: NotionDatabasePropertySchema[];
}

export interface NotionBlockTextExcerpt {
  type: string;
  text_excerpt: string | null;
}

export interface NotionSearchResultItem {
  id: string;
  object: "page" | "database";
  title: string;
  url: string;
}

export interface NotionRateLimitInfo {
  retry_after: string | null;
}
