/**
 * 変換レイヤーの内部型定義
 */

/** パースされたMarkdownドキュメント */
export interface ParsedDocument {
  frontmatter: DocumentFrontmatter;
  content: string;
}

/** frontmatterの構造 */
export interface DocumentFrontmatter {
  // 識別情報
  id?: string;
  url?: string;

  // メタ情報
  title?: string;
  icon?: string;
  cover?: string;

  // 階層情報（どちらか一方）
  parent?: string;
  database?: string;

  // DBプロパティ
  properties?: Record<string, unknown>;

  // 読み取り専用（readで返却、writeでは無視）
  last_edited?: string;
  created?: string;
}

/** 読み取り専用プロパティのキー */
export const READONLY_KEYS = [
  "last_edited",
  "created",
  "url",
] as const;

/** Notion APIのプロパティ型 */
export type NotionPropertyType =
  | "title"
  | "rich_text"
  | "number"
  | "select"
  | "multi_select"
  | "date"
  | "checkbox"
  | "url"
  | "email"
  | "phone_number"
  | "status"
  | "people"
  | "relation"
  | "files"
  | "formula"
  | "rollup"
  | "created_time"
  | "last_edited_time"
  | "created_by"
  | "last_edited_by"
  | "unique_id"
  | "verification"
  | "button";

/** 読み取り専用のプロパティ型 */
export const READONLY_PROPERTY_TYPES: readonly NotionPropertyType[] = [
  "formula",
  "rollup",
  "created_time",
  "last_edited_time",
  "created_by",
  "last_edited_by",
  "unique_id",
  "verification",
  "button",
];

/** DBスキーマのプロパティ定義 */
export interface DatabasePropertySchema {
  id: string;
  name: string;
  type: NotionPropertyType;
}
