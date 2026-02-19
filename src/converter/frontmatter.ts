/**
 * frontmatter ↔ Notionプロパティ 双方向変換
 */
import type {
  PageObjectResponse,
  DataSourceObjectResponse,
} from "@notionhq/client/build/src/api-endpoints.js";
import {
  READONLY_PROPERTY_TYPES,
  type DatabasePropertySchema,
  type DocumentFrontmatter,
  type NotionPropertyType,
} from "./types.js";

// ─────────────────────────────────────────────
// Notion → YAML (read方向)
// ─────────────────────────────────────────────

type PageProperty = PageObjectResponse["properties"][string];

/**
 * Notionページからfrontmatterオブジェクトを生成する。
 */
export function pageToFrontmatter(page: PageObjectResponse): DocumentFrontmatter {
  const fm: DocumentFrontmatter = {
    id: page.id,
    url: page.url,
    last_edited: page.last_edited_time,
    created: page.created_time,
  };

  // icon
  if (page.icon) {
    if (page.icon.type === "emoji") {
      fm.icon = page.icon.emoji;
    } else if (page.icon.type === "external") {
      fm.icon = page.icon.external.url;
    }
  }

  // cover
  if (page.cover) {
    if (page.cover.type === "external") {
      fm.cover = page.cover.external.url;
    }
  }

  // parent
  if (page.parent.type === "database_id") {
    fm.database = page.parent.database_id;
  } else if (page.parent.type === "data_source_id") {
    fm.database = (page.parent as { data_source_id: string }).data_source_id;
  } else if (page.parent.type === "page_id") {
    fm.parent = page.parent.page_id;
  } else if (page.parent.type === "workspace") {
    fm.parent = "workspace";
  }

  // properties
  const props: Record<string, unknown> = {};
  for (const [name, prop] of Object.entries(page.properties)) {
    if (prop.type === "title") {
      fm.title = extractRichTextPlain(prop.title);
      continue;
    }
    const value = extractPropertyValue(prop);
    if (value !== undefined) {
      props[name] = value;
    }
  }

  if (Object.keys(props).length > 0) {
    fm.properties = props;
  }

  return fm;
}

/**
 * 個別プロパティ値を抽出する。
 */
function extractPropertyValue(prop: PageProperty): unknown {
  switch (prop.type) {
    case "rich_text":
      return extractRichTextPlain(prop.rich_text) || undefined;
    case "number":
      return prop.number;
    case "select":
      return prop.select?.name ?? undefined;
    case "multi_select":
      return prop.multi_select.map((s) => s.name);
    case "date":
      if (!prop.date) return undefined;
      return prop.date.end
        ? { start: prop.date.start, end: prop.date.end }
        : prop.date.start;
    case "checkbox":
      return prop.checkbox;
    case "url":
      return prop.url;
    case "email":
      return prop.email;
    case "phone_number":
      return prop.phone_number;
    case "status":
      return prop.status?.name ?? undefined;
    case "people":
      return prop.people.map((p) => {
        if ("name" in p && p.name) return p.name;
        return p.id;
      });
    case "relation":
      return prop.relation.map((r) => r.id);
    case "files":
      return prop.files.map((f) =>
        f.type === "external" ? f.external.url : f.file.url
      );
    case "formula":
      return extractFormulaValue(prop.formula);
    case "rollup":
      return extractRollupValue(prop.rollup);
    case "created_time":
      return prop.created_time;
    case "last_edited_time":
      return prop.last_edited_time;
    case "created_by":
      return "name" in prop.created_by && prop.created_by.name
        ? prop.created_by.name
        : prop.created_by.id;
    case "last_edited_by":
      return "name" in prop.last_edited_by && prop.last_edited_by.name
        ? prop.last_edited_by.name
        : prop.last_edited_by.id;
    case "unique_id":
      return prop.unique_id.prefix
        ? `${prop.unique_id.prefix}-${prop.unique_id.number}`
        : prop.unique_id.number;
    default:
      return undefined;
  }
}

function extractFormulaValue(
  formula: Extract<PageProperty, { type: "formula" }>["formula"]
): unknown {
  switch (formula.type) {
    case "string":
      return formula.string;
    case "number":
      return formula.number;
    case "boolean":
      return formula.boolean;
    case "date":
      return formula.date?.start ?? null;
    default:
      return null;
  }
}

function extractRollupValue(
  rollup: Extract<PageProperty, { type: "rollup" }>["rollup"]
): unknown {
  switch (rollup.type) {
    case "number":
      return rollup.number;
    case "date":
      return rollup.date?.start ?? null;
    case "array":
      return rollup.array.map((item) => extractPropertyValue(item as PageProperty));
    default:
      return null;
  }
}

function extractRichTextPlain(
  richText: Array<{ plain_text: string }>
): string {
  return richText.map((t) => t.plain_text).join("");
}

// ─────────────────────────────────────────────
// YAML → Notion (write方向)
// ─────────────────────────────────────────────

type PropertyInput = Record<string, unknown>;

/**
 * frontmatterのpropertiesをNotion APIのproperties形式に変換する。
 * DBスキーマを参照して各プロパティの型を解決する。
 */
export function frontmatterToProperties(
  fm: DocumentFrontmatter,
  dbSchema: DatabasePropertySchema[]
): PropertyInput {
  const result: PropertyInput = {};

  // titleプロパティ
  if (fm.title !== undefined) {
    const titleProp = dbSchema.find((s) => s.type === "title");
    const titleKey = titleProp?.name ?? "title";
    result[titleKey] = {
      title: [{ text: { content: fm.title } }],
    };
  }

  // その他のプロパティ
  if (fm.properties) {
    for (const [name, value] of Object.entries(fm.properties)) {
      const schema = dbSchema.find((s) => s.name === name);
      if (!schema) continue;

      // 読み取り専用プロパティはスキップ
      if (READONLY_PROPERTY_TYPES.includes(schema.type)) continue;

      const converted = buildPropertyValue(schema.type, value);
      if (converted !== undefined) {
        result[name] = converted;
      }
    }
  }

  return result;
}

/**
 * プロパティ型とYAML値からNotion API用のプロパティ値を構築する。
 */
function buildPropertyValue(
  type: NotionPropertyType,
  value: unknown
): unknown {
  switch (type) {
    case "rich_text":
      return {
        rich_text: [{ text: { content: String(value ?? "") } }],
      };

    case "number":
      return { number: typeof value === "number" ? value : Number(value) };

    case "select":
      return { select: value ? { name: String(value) } : null };

    case "multi_select": {
      const items = Array.isArray(value) ? value : [value];
      return {
        multi_select: items.map((v) => ({ name: String(v) })),
      };
    }

    case "date": {
      if (!value) return { date: null };
      if (typeof value === "string") {
        return { date: { start: value } };
      }
      if (typeof value === "object" && value !== null && "start" in value) {
        const d = value as { start: string; end?: string };
        return { date: { start: d.start, end: d.end ?? null } };
      }
      return { date: { start: String(value) } };
    }

    case "checkbox":
      return { checkbox: Boolean(value) };

    case "url":
      return { url: value ? String(value) : null };

    case "email":
      return { email: value ? String(value) : null };

    case "phone_number":
      return { phone_number: value ? String(value) : null };

    case "status":
      return { status: value ? { name: String(value) } : null };

    case "people": {
      const ids = Array.isArray(value) ? value : [value];
      return {
        people: ids.map((id) => ({ id: String(id) })),
      };
    }

    case "relation": {
      const ids = Array.isArray(value) ? value : [value];
      return {
        relation: ids.map((id) => ({ id: String(id) })),
      };
    }

    case "files": {
      const urls = Array.isArray(value) ? value : [value];
      return {
        files: urls.map((u) => ({
          name: String(u),
          external: { url: String(u) },
        })),
      };
    }

    default:
      return undefined;
  }
}

/**
 * parentページの場合（DBスキーマなし）のシンプルなプロパティ構築。
 * titleのみセットする。
 */
export function buildPageProperties(
  fm: DocumentFrontmatter
): PropertyInput {
  const result: PropertyInput = {};

  if (fm.title !== undefined) {
    result["title"] = {
      title: [{ text: { content: fm.title } }],
    };
  }

  return result;
}

/**
 * DataSourceObjectResponseからスキーマ情報を抽出する。
 * Notion SDK v5ではDBプロパティがDataSourceに移動している。
 */
export function extractDatabaseSchema(
  dataSource: DataSourceObjectResponse
): DatabasePropertySchema[] {
  return Object.entries(dataSource.properties).map(([name, prop]) => ({
    id: prop.id,
    name,
    type: prop.type as NotionPropertyType,
  }));
}
