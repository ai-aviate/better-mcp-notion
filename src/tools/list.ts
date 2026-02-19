/**
 * list ツール: DB/ページ子要素 → MDテーブル/リスト
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints.js";
import { extractId, isNotionId } from "../notion/helpers.js";
import {
  getPage,
  getDatabaseDataSourceId,
  getDataSource,
  queryDataSource,
  listChildren,
  resolveByName,
  detectObjectType,
} from "../notion/client.js";
import { extractDatabaseSchema } from "../converter/frontmatter.js";
import type { DatabasePropertySchema } from "../converter/types.js";
import { formatError } from "../errors.js";

const DESCRIPTION = `List database records as a Markdown table, or list child pages of a page.

For databases: returns a table with properties as columns.
For pages: returns a numbered list of child pages.

You can pass a database/page name (resolved via search) or an ID/URL.

## Filter syntax (databases only)
Simple expressions matched against DB property names and types:
- "Status is Done" → select/status equals
- "Priority = High" → select equals
- "Tags contains backend" → multi_select contains
- "Done is true" → checkbox equals
- "Due Date after 2026-03-01" → date after
- "Score > 80" → number greater_than
- "Name contains API" → title/rich_text contains
Multiple filters: separate with " AND " (e.g. "Status is Done AND Priority is High")

## Sort syntax (databases only)
- "Due Date ascending" or "Due Date asc"
- "Created descending" or "Created desc"

## Example output
# Task Board (24 items)
| Name | Status | Due Date |
|---|---|---|
| Fix login bug | In Progress | 2026-03-01 |`;

export function registerListTool(server: McpServer): void {
  server.tool(
    "list",
    DESCRIPTION,
    {
      target: z.string().describe("Database or page: name (e.g. 'Task Board'), ID, or Notion URL"),
      filter: z
        .string()
        .optional()
        .describe('Filter expression (e.g. "Status is Done", "Priority > 3"). See tool description for syntax.'),
      sort: z
        .string()
        .optional()
        .describe('Sort expression (e.g. "Due Date ascending", "Created desc")'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .default(50)
        .describe("Max items to return (default: 50)"),
    },
    async ({ target, filter, sort, limit }) => {
      try {
        let targetId: string;
        let targetType: "page" | "database";

        if (isNotionId(target) || target.includes("notion.so") || target.includes("notion.site")) {
          targetId = extractId(target);
          const detected = await detectObjectType(targetId);
          targetType = detected.type;
        } else {
          const resolved = await resolveByName(target);
          targetId = resolved.id;
          targetType = resolved.object;
        }

        if (targetType === "database") {
          return await listDatabase(targetId, limit, filter, sort);
        } else {
          return await listPageChildren(targetId, limit);
        }
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: formatError(error) }],
          isError: true,
        };
      }
    }
  );
}

// ─── DB listing ───

async function listDatabase(
  dbId: string,
  limit: number,
  filterExpr?: string,
  sortExpr?: string
) {
  const dsId = await getDatabaseDataSourceId(dbId);
  const ds = await getDataSource(dsId);
  const schema = extractDatabaseSchema(ds);

  // フィルタ・ソート構築
  const apiFilter = filterExpr ? buildFilter(filterExpr, schema) : undefined;
  const apiSorts = sortExpr ? buildSort(sortExpr, schema) : undefined;

  const pages = await queryDataSource({
    dataSourceId: dsId,
    filter: apiFilter,
    sorts: apiSorts,
    limit,
  });

  const columns = schema
    .filter((s) => !["formula", "rollup", "created_by", "last_edited_by", "button", "verification"].includes(s.type))
    .slice(0, 8);

  const title = ds.title.map((t) => t.plain_text).join("") || "Untitled Database";
  const filterNote = filterExpr ? ` (filter: ${filterExpr})` : "";
  const lines: string[] = [`# ${title}${filterNote} (${pages.length} items)\n`];

  if (pages.length === 0) {
    lines.push("No records found.");
    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
  }

  // MDテーブル（IDカラムを先頭に追加）
  const header = ["ID", ...columns.map((c) => c.name)];
  lines.push(`| ${header.join(" | ")} |`);
  lines.push(`| ${header.map(() => "---").join(" | ")} |`);

  for (const page of pages) {
    const id = page.id.slice(0, 8);
    const row = columns.map((col) => {
      const prop = page.properties[col.name];
      if (!prop) return "-";
      return escapeCell(formatCellValue(prop));
    });
    lines.push(`| ${id} | ${row.join(" | ")} |`);
  }

  return { content: [{ type: "text" as const, text: lines.join("\n") }] };
}

// ─── Page children listing ───

async function listPageChildren(pageId: string, limit: number) {
  const page = await getPage(pageId);
  const titleProp = Object.values(page.properties).find((p) => p.type === "title");
  const pageTitle =
    titleProp?.type === "title"
      ? titleProp.title.map((t) => t.plain_text).join("")
      : "Untitled";

  const children = await listChildren(pageId, limit);

  const lines: string[] = [`# ${pageTitle} - child pages (${children.length} items)\n`];

  if (children.length === 0) {
    lines.push("No child pages found.");
    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
  }

  children.forEach((child, i) => {
    const childTitle = getTitle(child);
    const icon = child.icon?.type === "emoji" ? child.icon.emoji : "\u{1F4DD}";
    const edited = child.last_edited_time.slice(0, 10);
    lines.push(`${i + 1}. ${icon} [${childTitle}](${child.url}) - ${edited}`);
  });

  return { content: [{ type: "text" as const, text: lines.join("\n") }] };
}

// ─── Filter parser ───

function buildFilter(
  expr: string,
  schema: DatabasePropertySchema[]
): Record<string, unknown> | undefined {
  // AND で分割して複数フィルタ対応
  const parts = expr.split(/\s+AND\s+/i);
  const filters = parts
    .map((part) => parseSingleFilter(part.trim(), schema))
    .filter((f): f is Record<string, unknown> => f !== null);

  if (filters.length === 0) return undefined;
  if (filters.length === 1) return filters[0];
  return { and: filters };
}

function parseSingleFilter(
  expr: string,
  schema: DatabasePropertySchema[]
): Record<string, unknown> | null {
  // パターン: "PropertyName operator value"
  // 演算子: is, =, !=, contains, >, <, >=, <=, before, after
  const patterns: Array<{
    regex: RegExp;
    build: (prop: string, value: string, type: string) => Record<string, unknown> | null;
  }> = [
    {
      // "Prop is value" / "Prop = value"
      regex: /^(.+?)\s+(?:is|=|equals)\s+(.+)$/i,
      build: (prop, value, type) => buildEqualsFilter(prop, value, type),
    },
    {
      // "Prop != value" / "Prop is not value"
      regex: /^(.+?)\s+(?:!=|is not|does not equal)\s+(.+)$/i,
      build: (prop, value, type) => buildNotEqualsFilter(prop, value, type),
    },
    {
      // "Prop contains value"
      regex: /^(.+?)\s+contains\s+(.+)$/i,
      build: (prop, value, type) => buildContainsFilter(prop, value, type),
    },
    {
      // "Prop > value"
      regex: /^(.+?)\s+(?:>|greater than)\s+(.+)$/i,
      build: (prop, value, type) => {
        const num = parseFilterNumber(value);
        return num === null ? null : { property: prop, [type]: { greater_than: num } };
      },
    },
    {
      // "Prop < value"
      regex: /^(.+?)\s+(?:<|less than)\s+(.+)$/i,
      build: (prop, value, type) => {
        const num = parseFilterNumber(value);
        return num === null ? null : { property: prop, [type]: { less_than: num } };
      },
    },
    {
      // "Prop >= value"
      regex: /^(.+?)\s+>=\s+(.+)$/i,
      build: (prop, value, type) => {
        const num = parseFilterNumber(value);
        return num === null ? null : { property: prop, [type]: { greater_than_or_equal_to: num } };
      },
    },
    {
      // "Prop <= value"
      regex: /^(.+?)\s+<=\s+(.+)$/i,
      build: (prop, value, type) => {
        const num = parseFilterNumber(value);
        return num === null ? null : { property: prop, [type]: { less_than_or_equal_to: num } };
      },
    },
    {
      // "Prop after date"
      regex: /^(.+?)\s+after\s+(.+)$/i,
      build: (prop, value, _type) => ({
        property: prop,
        date: { after: value.trim() },
      }),
    },
    {
      // "Prop before date"
      regex: /^(.+?)\s+before\s+(.+)$/i,
      build: (prop, value, _type) => ({
        property: prop,
        date: { before: value.trim() },
      }),
    },
  ];

  for (const { regex, build } of patterns) {
    const match = expr.match(regex);
    if (!match) continue;

    const propName = match[1].trim();
    const value = match[2].trim();

    // スキーマからプロパティ型を解決
    const schemaProp = schema.find(
      (s) => s.name.toLowerCase() === propName.toLowerCase()
    );
    if (!schemaProp) continue;

    return build(schemaProp.name, value, schemaProp.type);
  }

  return null;
}

function buildEqualsFilter(
  prop: string,
  value: string,
  type: string
): Record<string, unknown> | null {
  switch (type) {
    case "select":
    case "status":
      return { property: prop, [type]: { equals: value } };
    case "multi_select":
      return { property: prop, multi_select: { contains: value } };
    case "checkbox":
      return { property: prop, checkbox: { equals: value.toLowerCase() === "true" || value.toLowerCase() === "yes" } };
    case "number": {
      const num = parseFilterNumber(value);
      return num === null ? null : { property: prop, number: { equals: num } };
    }
    case "date":
      return { property: prop, date: { equals: value } };
    case "title":
      return { property: prop, title: { equals: value } };
    case "rich_text":
      return { property: prop, rich_text: { equals: value } };
    default:
      return { property: prop, [type]: { equals: value } };
  }
}

function buildNotEqualsFilter(
  prop: string,
  value: string,
  type: string
): Record<string, unknown> | null {
  switch (type) {
    case "select":
    case "status":
      return { property: prop, [type]: { does_not_equal: value } };
    case "multi_select":
      return { property: prop, multi_select: { does_not_contain: value } };
    case "checkbox":
      return { property: prop, checkbox: { does_not_equal: value.toLowerCase() === "true" || value.toLowerCase() === "yes" } };
    case "number": {
      const num = parseFilterNumber(value);
      return num === null ? null : { property: prop, number: { does_not_equal: num } };
    }
    default:
      return { property: prop, [type]: { does_not_equal: value } };
  }
}

function buildContainsFilter(
  prop: string,
  value: string,
  type: string
): Record<string, unknown> {
  switch (type) {
    case "multi_select":
      return { property: prop, multi_select: { contains: value } };
    case "title":
      return { property: prop, title: { contains: value } };
    case "rich_text":
      return { property: prop, rich_text: { contains: value } };
    default:
      return { property: prop, [type]: { contains: value } };
  }
}

// ─── Sort parser ───

function buildSort(
  expr: string,
  schema: DatabasePropertySchema[]
): Array<{ property: string; direction: "ascending" | "descending" }> | undefined {
  const parts = expr.split(/,/).map((s) => s.trim());
  const sorts: Array<{ property: string; direction: "ascending" | "descending" }> = [];

  for (const part of parts) {
    const match = part.match(/^(.+?)\s+(asc(?:ending)?|desc(?:ending)?)$/i);
    if (!match) continue;

    const propName = match[1].trim();
    const dir = match[2].toLowerCase().startsWith("asc") ? "ascending" : "descending";

    const schemaProp = schema.find(
      (s) => s.name.toLowerCase() === propName.toLowerCase()
    );
    if (schemaProp) {
      sorts.push({ property: schemaProp.name, direction: dir });
    }
  }

  return sorts.length > 0 ? sorts : undefined;
}

// ─── Helpers ───

function parseFilterNumber(value: string): number | null {
  const num = Number(value);
  if (isNaN(num)) return null;
  return num;
}

function getTitle(page: PageObjectResponse): string {
  const titleProp = Object.values(page.properties).find((p) => p.type === "title");
  if (titleProp?.type === "title") {
    return titleProp.title.map((t) => t.plain_text).join("") || "Untitled";
  }
  return "Untitled";
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function formatCellValue(prop: PageObjectResponse["properties"][string]): string {
  switch (prop.type) {
    case "title":
      return prop.title.map((t) => t.plain_text).join("") || "-";
    case "rich_text":
      return prop.rich_text.map((t) => t.plain_text).join("") || "-";
    case "number":
      return prop.number?.toString() ?? "-";
    case "select":
      return prop.select?.name ?? "-";
    case "multi_select":
      return prop.multi_select.map((s) => s.name).join(", ") || "-";
    case "date":
      if (!prop.date) return "-";
      return prop.date.end
        ? `${prop.date.start} → ${prop.date.end}`
        : prop.date.start;
    case "checkbox":
      return prop.checkbox ? "Yes" : "No";
    case "url":
      return prop.url ?? "-";
    case "email":
      return prop.email ?? "-";
    case "phone_number":
      return prop.phone_number ?? "-";
    case "status":
      return prop.status?.name ?? "-";
    case "created_time":
      return prop.created_time.slice(0, 10);
    case "last_edited_time":
      return prop.last_edited_time.slice(0, 10);
    case "unique_id":
      return prop.unique_id.prefix
        ? `${prop.unique_id.prefix}-${prop.unique_id.number}`
        : String(prop.unique_id.number ?? "-");
    default:
      return "-";
  }
}
