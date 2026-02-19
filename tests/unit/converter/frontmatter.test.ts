import { describe, it, expect } from "vitest";
import {
  pageToFrontmatter,
  frontmatterToProperties,
  buildPageProperties,
  extractDatabaseSchema,
} from "../../../src/converter/frontmatter.js";
import type { DocumentFrontmatter, DatabasePropertySchema } from "../../../src/converter/types.js";

// ── pageToFrontmatter テスト ──

describe("pageToFrontmatter", () => {
  it("should extract basic page info", () => {
    const page = makePage({
      id: "abc-123",
      url: "https://notion.so/abc123",
      created_time: "2026-01-01T00:00:00Z",
      last_edited_time: "2026-02-01T00:00:00Z",
      parent: { type: "workspace", workspace: true },
      icon: { type: "emoji", emoji: "\u{1F4CB}" },
      cover: null,
      properties: {
        Name: {
          id: "title",
          type: "title",
          title: [{ plain_text: "Test Page", annotations: {}, href: null }],
        },
      },
    });

    const fm = pageToFrontmatter(page);

    expect(fm.id).toBe("abc-123");
    expect(fm.url).toBe("https://notion.so/abc123");
    expect(fm.title).toBe("Test Page");
    expect(fm.icon).toBe("\u{1F4CB}");
    expect(fm.parent).toBe("workspace");
    expect(fm.last_edited).toBe("2026-02-01T00:00:00Z");
    expect(fm.created).toBe("2026-01-01T00:00:00Z");
  });

  it("should extract database parent", () => {
    const page = makePage({
      parent: { type: "database_id", database_id: "db-123" },
      properties: {
        Title: {
          id: "title",
          type: "title",
          title: [{ plain_text: "DB Entry", annotations: {}, href: null }],
        },
      },
    });

    const fm = pageToFrontmatter(page);
    expect(fm.database).toBe("db-123");
    expect(fm.parent).toBeUndefined();
  });

  it("should extract page parent", () => {
    const page = makePage({
      parent: { type: "page_id", page_id: "parent-123" },
    });

    const fm = pageToFrontmatter(page);
    expect(fm.parent).toBe("parent-123");
    expect(fm.database).toBeUndefined();
  });

  it("should extract various property types", () => {
    const page = makePage({
      properties: {
        Name: {
          id: "title",
          type: "title",
          title: [{ plain_text: "Test", annotations: {}, href: null }],
        },
        Status: {
          id: "status",
          type: "status",
          status: { id: "s1", name: "In Progress", color: "blue" },
        },
        Tags: {
          id: "tags",
          type: "multi_select",
          multi_select: [
            { id: "t1", name: "backend", color: "green" },
            { id: "t2", name: "urgent", color: "red" },
          ],
        },
        Priority: {
          id: "priority",
          type: "number",
          number: 5,
        },
        Done: {
          id: "done",
          type: "checkbox",
          checkbox: true,
        },
        "Due Date": {
          id: "due",
          type: "date",
          date: { start: "2026-03-01", end: null, time_zone: null },
        },
        Website: {
          id: "url",
          type: "url",
          url: "https://example.com",
        },
        Category: {
          id: "select",
          type: "select",
          select: { id: "c1", name: "Engineering", color: "purple" },
        },
        Description: {
          id: "desc",
          type: "rich_text",
          rich_text: [
            { plain_text: "Hello ", annotations: {}, href: null },
            { plain_text: "World", annotations: {}, href: null },
          ],
        },
      },
    });

    const fm = pageToFrontmatter(page);

    expect(fm.title).toBe("Test");
    expect(fm.properties).toBeDefined();
    expect(fm.properties!["Status"]).toBe("In Progress");
    expect(fm.properties!["Tags"]).toEqual(["backend", "urgent"]);
    expect(fm.properties!["Priority"]).toBe(5);
    expect(fm.properties!["Done"]).toBe(true);
    expect(fm.properties!["Due Date"]).toBe("2026-03-01");
    expect(fm.properties!["Website"]).toBe("https://example.com");
    expect(fm.properties!["Category"]).toBe("Engineering");
    expect(fm.properties!["Description"]).toBe("Hello World");
  });

  it("should handle date with end", () => {
    const page = makePage({
      properties: {
        Name: {
          id: "title",
          type: "title",
          title: [{ plain_text: "Event", annotations: {}, href: null }],
        },
        Period: {
          id: "period",
          type: "date",
          date: {
            start: "2026-03-01",
            end: "2026-03-15",
            time_zone: null,
          },
        },
      },
    });

    const fm = pageToFrontmatter(page);
    expect(fm.properties!["Period"]).toEqual({
      start: "2026-03-01",
      end: "2026-03-15",
    });
  });

  it("should handle null property values", () => {
    const page = makePage({
      properties: {
        Name: {
          id: "title",
          type: "title",
          title: [],
        },
        Status: {
          id: "status",
          type: "select",
          select: null,
        },
        Score: {
          id: "score",
          type: "number",
          number: null,
        },
      },
    });

    const fm = pageToFrontmatter(page);
    expect(fm.title).toBe("");
    // null values should not appear in properties
    expect(fm.properties?.["Status"]).toBeUndefined();
  });

  it("should extract external icon", () => {
    const page = makePage({
      icon: { type: "external", external: { url: "https://example.com/icon.png" } },
    });

    const fm = pageToFrontmatter(page);
    expect(fm.icon).toBe("https://example.com/icon.png");
  });

  it("should extract cover", () => {
    const page = makePage({
      cover: { type: "external", external: { url: "https://example.com/cover.png" } },
    });

    const fm = pageToFrontmatter(page);
    expect(fm.cover).toBe("https://example.com/cover.png");
  });
});

// ── frontmatterToProperties テスト ──

describe("frontmatterToProperties", () => {
  const schema: DatabasePropertySchema[] = [
    { id: "title", name: "Name", type: "title" },
    { id: "status", name: "Status", type: "status" },
    { id: "tags", name: "Tags", type: "multi_select" },
    { id: "priority", name: "Priority", type: "number" },
    { id: "done", name: "Done", type: "checkbox" },
    { id: "due", name: "Due Date", type: "date" },
    { id: "url", name: "Website", type: "url" },
    { id: "select", name: "Category", type: "select" },
    { id: "desc", name: "Description", type: "rich_text" },
    { id: "email", name: "Email", type: "email" },
    { id: "phone", name: "Phone", type: "phone_number" },
    { id: "formula", name: "Computed", type: "formula" },
    { id: "created", name: "Created", type: "created_time" },
  ];

  it("should convert title", () => {
    const fm: DocumentFrontmatter = { title: "My Page" };
    const result = frontmatterToProperties(fm, schema);
    expect(result["Name"]).toEqual({
      title: [{ text: { content: "My Page" } }],
    });
  });

  it("should convert various property types", () => {
    const fm: DocumentFrontmatter = {
      title: "Test",
      properties: {
        Status: "In Progress",
        Tags: ["backend", "urgent"],
        Priority: 5,
        Done: true,
        "Due Date": "2026-03-01",
        Website: "https://example.com",
        Category: "Engineering",
        Description: "Some text",
        Email: "test@example.com",
        Phone: "+1234567890",
      },
    };

    const result = frontmatterToProperties(fm, schema);

    expect(result["Status"]).toEqual({ status: { name: "In Progress" } });
    expect(result["Tags"]).toEqual({
      multi_select: [{ name: "backend" }, { name: "urgent" }],
    });
    expect(result["Priority"]).toEqual({ number: 5 });
    expect(result["Done"]).toEqual({ checkbox: true });
    expect(result["Due Date"]).toEqual({ date: { start: "2026-03-01" } });
    expect(result["Website"]).toEqual({ url: "https://example.com" });
    expect(result["Category"]).toEqual({ select: { name: "Engineering" } });
    expect(result["Description"]).toEqual({
      rich_text: [{ text: { content: "Some text" } }],
    });
    expect(result["Email"]).toEqual({ email: "test@example.com" });
    expect(result["Phone"]).toEqual({ phone_number: "+1234567890" });
  });

  it("should skip readonly property types", () => {
    const fm: DocumentFrontmatter = {
      properties: {
        Computed: "should be skipped",
        Created: "should be skipped",
      },
    };

    const result = frontmatterToProperties(fm, schema);
    expect(result["Computed"]).toBeUndefined();
    expect(result["Created"]).toBeUndefined();
  });

  it("should skip unknown properties not in schema", () => {
    const fm: DocumentFrontmatter = {
      properties: {
        "Unknown Field": "value",
      },
    };

    const result = frontmatterToProperties(fm, schema);
    expect(result["Unknown Field"]).toBeUndefined();
  });

  it("should handle date with start and end", () => {
    const fm: DocumentFrontmatter = {
      properties: {
        "Due Date": { start: "2026-03-01", end: "2026-03-15" },
      },
    };

    const result = frontmatterToProperties(fm, schema);
    expect(result["Due Date"]).toEqual({
      date: { start: "2026-03-01", end: "2026-03-15" },
    });
  });

  it("should handle null/empty values", () => {
    const fm: DocumentFrontmatter = {
      properties: {
        Website: null,
        Category: null,
        "Due Date": null,
      },
    };

    const result = frontmatterToProperties(fm, schema);
    expect(result["Website"]).toEqual({ url: null });
    expect(result["Category"]).toEqual({ select: null });
    expect(result["Due Date"]).toEqual({ date: null });
  });
});

// ── buildPageProperties テスト ──

describe("buildPageProperties", () => {
  it("should build title property", () => {
    const fm: DocumentFrontmatter = { title: "Simple Page" };
    const result = buildPageProperties(fm);
    expect(result["title"]).toEqual({
      title: [{ text: { content: "Simple Page" } }],
    });
  });

  it("should return empty for no title", () => {
    const fm: DocumentFrontmatter = {};
    const result = buildPageProperties(fm);
    expect(Object.keys(result)).toHaveLength(0);
  });
});

// ── Helper ──

function makePage(overrides: Record<string, unknown> = {}) {
  return {
    object: "page" as const,
    id: "test-id",
    created_time: "2026-01-01T00:00:00Z",
    last_edited_time: "2026-02-01T00:00:00Z",
    archived: false,
    in_trash: false,
    is_locked: false,
    url: "https://notion.so/test",
    public_url: null,
    parent: { type: "workspace" as const, workspace: true },
    icon: null,
    cover: null,
    created_by: { object: "user" as const, id: "user-1" },
    last_edited_by: { object: "user" as const, id: "user-1" },
    properties: {},
    ...overrides,
  } as any;
}
