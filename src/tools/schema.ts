/**
 * schema ツール: DBカラム管理
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { extractId, isNotionId } from "../notion/helpers.js";
import {
  getDatabaseDataSourceId,
  getDataSource,
  resolveByName,
  getClient,
} from "../notion/client.js";
import { extractDatabaseSchema } from "../converter/frontmatter.js";
import { formatError, NotionMcpError } from "../errors.js";

const PROPERTY_TYPES = [
  "title", "rich_text", "number", "select", "multi_select",
  "date", "checkbox", "url", "email", "phone_number",
  "status", "people", "files", "relation",
] as const;

type PropertyType = typeof PROPERTY_TYPES[number];

const DESCRIPTION = `View or modify database schema (columns/properties).

## Actions

### "list" (default) — View current schema
  schema({ database: "Task Board" })
  Returns: property names, types, and select/multi_select options.

### "add" — Add a new property
  schema({ database: "Task Board", action: "add", property: "Priority", type: "select", options: ["Low", "Medium", "High"] })

### "remove" — Remove a property
  schema({ database: "Task Board", action: "remove", property: "Old Column" })

### "rename" — Rename a property
  schema({ database: "Task Board", action: "rename", property: "Due", name: "Due Date" })

## Supported types for add
title, rich_text, number, select, multi_select, date, checkbox, url, email, phone_number, status, people, files

For select/multi_select, you can provide initial options.`;

export function registerSchemaTool(server: McpServer): void {
  server.tool(
    "schema",
    DESCRIPTION,
    {
      database: z.string().describe("Database name, ID, or URL"),
      action: z
        .enum(["list", "add", "remove", "rename"])
        .default("list")
        .describe('"list" (default): show schema. "add": add property. "remove": remove property. "rename": rename property.'),
      property: z
        .string()
        .optional()
        .describe("Property name (required for add/remove/rename)"),
      type: z
        .string()
        .optional()
        .describe("Property type for add (e.g. select, number, rich_text)"),
      name: z
        .string()
        .optional()
        .describe("New name for rename action"),
      options: z
        .array(z.string())
        .optional()
        .describe("Options for select/multi_select (e.g. ['Low', 'Medium', 'High'])"),
    },
    async ({ database, action, property, type, name, options }) => {
      try {
        // DB ID を解決
        let dbId: string;
        if (isNotionId(database) || database.includes("notion.so") || database.includes("notion.site")) {
          dbId = extractId(database);
        } else {
          const resolved = await resolveByName(database, "database");
          dbId = resolved.id;
        }

        const dsId = await getDatabaseDataSourceId(dbId);

        if (action === "list") {
          return await listSchema(dsId);
        }

        if (!property) {
          throw new NotionMcpError(
            `"property" is required for action "${action}".`,
            "MISSING_PROPERTY"
          );
        }

        switch (action) {
          case "add":
            return await addProperty(dsId, property, type, options);
          case "remove":
            return await removeProperty(dsId, property);
          case "rename":
            if (!name) {
              throw new NotionMcpError(
                '"name" is required for rename action.',
                "MISSING_NAME"
              );
            }
            return await renameProperty(dsId, property, name);
          default:
            throw new NotionMcpError(`Unknown action: ${action}`, "INVALID_ACTION");
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

// ─── List schema ───

async function listSchema(dsId: string) {
  const ds = await getDataSource(dsId);
  const schema = extractDatabaseSchema(ds);
  const title = ds.title.map((t) => t.plain_text).join("") || "Untitled";

  const lines: string[] = [`# ${title} — Schema (${schema.length} properties)\n`];
  lines.push("| Property | Type | Details |");
  lines.push("| --- | --- | --- |");

  for (const prop of schema) {
    const details = getPropertyDetails(ds.properties[prop.name]);
    lines.push(`| ${prop.name} | ${prop.type} | ${details} |`);
  }

  return { content: [{ type: "text" as const, text: lines.join("\n") }] };
}

function getPropertyDetails(prop: Record<string, unknown>): string {
  const type = prop.type as string;
  const data = prop[type] as Record<string, unknown> | undefined;
  if (!data) return "-";

  if ((type === "select" || type === "multi_select") && Array.isArray(data.options)) {
    const opts = (data.options as Array<{ name: string }>).map((o) => o.name);
    return opts.length > 0 ? opts.join(", ") : "-";
  }
  if (type === "status" && "groups" in data && Array.isArray(data.groups)) {
    const statuses: string[] = [];
    for (const group of data.groups as Array<{ option_ids: string[]; name: string }>) {
      statuses.push(group.name);
    }
    return statuses.join(", ") || "-";
  }
  if (type === "number" && data.format) {
    return String(data.format);
  }
  return "-";
}

// ─── Add property ───

async function addProperty(
  dsId: string,
  propertyName: string,
  type?: string,
  options?: string[]
) {
  if (!type) {
    throw new NotionMcpError(
      '"type" is required for add action.',
      "MISSING_TYPE"
    );
  }
  if (!PROPERTY_TYPES.includes(type as PropertyType)) {
    throw new NotionMcpError(
      `Unsupported type "${type}". Supported: ${PROPERTY_TYPES.join(", ")}`,
      "INVALID_TYPE"
    );
  }

  const propConfig = buildPropertyConfig(type as PropertyType, options);
  const notion = getClient();
  await notion.dataSources.update({
    data_source_id: dsId,
    properties: {
      [propertyName]: propConfig,
    },
  } as Parameters<typeof notion.dataSources.update>[0]);

  return {
    content: [{ type: "text" as const, text: `Added property "${propertyName}" (${type})` }],
  };
}

function buildPropertyConfig(type: PropertyType, options?: string[]): Record<string, unknown> {
  const base: Record<string, unknown> = { type };

  switch (type) {
    case "select":
      base.select = {
        options: (options ?? []).map((name) => ({ name })),
      };
      break;
    case "multi_select":
      base.multi_select = {
        options: (options ?? []).map((name) => ({ name })),
      };
      break;
    case "number":
      base.number = { format: "number" };
      break;
    default:
      base[type] = {};
      break;
  }

  return base;
}

// ─── Remove property ───

async function removeProperty(dsId: string, propertyName: string) {
  // 存在確認
  const ds = await getDataSource(dsId);
  if (!(propertyName in ds.properties)) {
    throw new NotionMcpError(
      `Property "${propertyName}" not found in database.`,
      "PROPERTY_NOT_FOUND"
    );
  }

  const notion = getClient();
  await notion.dataSources.update({
    data_source_id: dsId,
    properties: {
      [propertyName]: null,
    },
  } as Parameters<typeof notion.dataSources.update>[0]);

  return {
    content: [{ type: "text" as const, text: `Removed property "${propertyName}"` }],
  };
}

// ─── Rename property ───

async function renameProperty(dsId: string, propertyName: string, newName: string) {
  const ds = await getDataSource(dsId);
  if (!(propertyName in ds.properties)) {
    throw new NotionMcpError(
      `Property "${propertyName}" not found in database.`,
      "PROPERTY_NOT_FOUND"
    );
  }

  const notion = getClient();
  await notion.dataSources.update({
    data_source_id: dsId,
    properties: {
      [propertyName]: { name: newName },
    },
  } as Parameters<typeof notion.dataSources.update>[0]);

  return {
    content: [{ type: "text" as const, text: `Renamed "${propertyName}" → "${newName}"` }],
  };
}
