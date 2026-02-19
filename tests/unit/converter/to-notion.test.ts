import { describe, it, expect } from "vitest";
import { parseMarkdown, markdownToNotionBlocks } from "../../../src/converter/to-notion.js";

describe("parseMarkdown", () => {
  it("should parse frontmatter and content", () => {
    const md = `---
title: Test Page
parent: My Workspace
icon: "\u{1F4DD}"
---

# Hello World

This is the body.
`;

    const result = parseMarkdown(md);

    expect(result.frontmatter.title).toBe("Test Page");
    expect(result.frontmatter.parent).toBe("My Workspace");
    expect(result.frontmatter.icon).toBe("\u{1F4DD}");
    expect(result.content).toContain("# Hello World");
    expect(result.content).toContain("This is the body.");
  });

  it("should parse database entry frontmatter", () => {
    const md = `---
database: "Task DB"
title: My Task
properties:
  Status: In Progress
  Tags:
    - backend
    - urgent
  Due Date: "2026-03-01"
---

## Task details
`;

    const result = parseMarkdown(md);

    expect(result.frontmatter.database).toBe("Task DB");
    expect(result.frontmatter.title).toBe("My Task");
    expect(result.frontmatter.properties).toBeDefined();
    expect(result.frontmatter.properties!["Status"]).toBe("In Progress");
    expect(result.frontmatter.properties!["Tags"]).toEqual(["backend", "urgent"]);
    expect(result.frontmatter.properties!["Due Date"]).toBe("2026-03-01");
  });

  it("should parse update with id", () => {
    const md = `---
id: abc-123-def
title: Updated Title
---

New content here.
`;

    const result = parseMarkdown(md);

    expect(result.frontmatter.id).toBe("abc-123-def");
    expect(result.frontmatter.title).toBe("Updated Title");
    expect(result.content).toContain("New content here.");
  });

  it("should handle empty content", () => {
    const md = `---
title: Empty Page
parent: workspace
---
`;

    const result = parseMarkdown(md);
    expect(result.frontmatter.title).toBe("Empty Page");
    expect(result.content.trim()).toBe("");
  });

  it("should roundtrip: read output can be parsed for write input", () => {
    // Simulates output from the read tool (includes readonly fields)
    const readOutput = `---
id: abc123-def456
url: "https://notion.so/abc123"
title: Weekly Review
database: db-123
icon: "\u{1F4CB}"
last_edited: "2026-02-19T10:00:00Z"
created: "2026-02-01T09:00:00Z"
properties:
  Status: In Progress
  Tags:
    - backend
    - urgent
---

## Notes
- Completed API design
`;

    const result = parseMarkdown(readOutput);

    // Write-relevant fields are preserved
    expect(result.frontmatter.id).toBe("abc123-def456");
    expect(result.frontmatter.title).toBe("Weekly Review");
    expect(result.frontmatter.database).toBe("db-123");
    expect(result.frontmatter.icon).toBe("\u{1F4CB}");
    expect(result.frontmatter.properties!["Status"]).toBe("In Progress");
    expect(result.frontmatter.properties!["Tags"]).toEqual(["backend", "urgent"]);

    // Read-only fields are parsed but won't affect write
    expect(result.frontmatter.url).toBe("https://notion.so/abc123");
    expect(result.frontmatter.last_edited).toBe("2026-02-19T10:00:00Z");
    expect(result.frontmatter.created).toBe("2026-02-01T09:00:00Z");

    // Content is preserved
    expect(result.content).toContain("## Notes");
    expect(result.content).toContain("- Completed API design");
  });

  it("should handle no frontmatter", () => {
    const md = `# Just content

No frontmatter here.
`;

    const result = parseMarkdown(md);
    expect(result.frontmatter.title).toBeUndefined();
    expect(result.content).toContain("# Just content");
  });
});

describe("markdownToNotionBlocks", () => {
  it("should convert headings", () => {
    const blocks = markdownToNotionBlocks("# Heading 1\n\n## Heading 2\n\n### Heading 3");

    expect(blocks.length).toBeGreaterThanOrEqual(3);
    expect(blocks[0]).toHaveProperty("heading_1");
    expect(blocks[1]).toHaveProperty("heading_2");
    expect(blocks[2]).toHaveProperty("heading_3");
  });

  it("should convert paragraphs", () => {
    const blocks = markdownToNotionBlocks("This is a paragraph.");

    expect(blocks.length).toBe(1);
    expect(blocks[0]).toHaveProperty("paragraph");
  });

  it("should convert bullet list", () => {
    const blocks = markdownToNotionBlocks("- Item 1\n- Item 2\n- Item 3");

    expect(blocks.length).toBe(3);
    blocks.forEach((b) => {
      expect(b).toHaveProperty("bulleted_list_item");
    });
  });

  it("should convert numbered list", () => {
    const blocks = markdownToNotionBlocks("1. First\n2. Second\n3. Third");

    expect(blocks.length).toBe(3);
    blocks.forEach((b) => {
      expect(b).toHaveProperty("numbered_list_item");
    });
  });

  it("should convert code blocks", () => {
    const blocks = markdownToNotionBlocks("```typescript\nconst x = 1;\n```");

    expect(blocks.length).toBe(1);
    expect(blocks[0]).toHaveProperty("code");
  });

  it("should convert todo items", () => {
    const blocks = markdownToNotionBlocks("- [ ] Todo\n- [x] Done");

    expect(blocks.length).toBe(2);
    blocks.forEach((b) => {
      expect(b).toHaveProperty("to_do");
    });
  });

  it("should convert blockquote", () => {
    const blocks = markdownToNotionBlocks("> This is a quote");

    expect(blocks.length).toBe(1);
    expect(blocks[0]).toHaveProperty("quote");
  });

  it("should handle empty content", () => {
    const blocks = markdownToNotionBlocks("");
    expect(blocks.length).toBe(0);
  });

  // Note: @tryfabric/martian does not support thematic breaks (---/***) → divider conversion

  it("should convert table", () => {
    const md = "| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |";
    const blocks = markdownToNotionBlocks(md);

    expect(blocks.length).toBeGreaterThanOrEqual(1);
    expect(blocks[0]).toHaveProperty("table");
  });
});
