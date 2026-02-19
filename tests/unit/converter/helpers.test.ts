import { describe, it, expect } from "vitest";
import {
  extractId,
  formatUuid,
  isNotionId,
  isNotionUrl,
} from "../../../src/notion/helpers.js";

describe("extractId", () => {
  it("should extract ID from UUID format", () => {
    expect(extractId("abcdef01-2345-6789-abcd-ef0123456789")).toBe(
      "abcdef01-2345-6789-abcd-ef0123456789"
    );
  });

  it("should extract ID from 32-char hex", () => {
    expect(extractId("abcdef0123456789abcdef0123456789")).toBe(
      "abcdef01-2345-6789-abcd-ef0123456789"
    );
  });

  it("should extract ID from Notion URL", () => {
    expect(
      extractId("https://www.notion.so/workspace/Page-Title-abcdef0123456789abcdef0123456789")
    ).toBe("abcdef01-2345-6789-abcd-ef0123456789");
  });

  it("should extract ID from Notion URL with query params", () => {
    expect(
      extractId("https://notion.so/abcdef0123456789abcdef0123456789?v=xxx")
    ).toBe("abcdef01-2345-6789-abcd-ef0123456789");
  });

  it("should extract ID from notion.site URL", () => {
    expect(
      extractId("https://workspace.notion.site/Page-abcdef0123456789abcdef0123456789")
    ).toBe("abcdef01-2345-6789-abcd-ef0123456789");
  });

  it("should return input as-is for names", () => {
    expect(extractId("My Page Name")).toBe("My Page Name");
  });

  it("should handle whitespace", () => {
    expect(extractId("  abcdef0123456789abcdef0123456789  ")).toBe(
      "abcdef01-2345-6789-abcd-ef0123456789"
    );
  });
});

describe("formatUuid", () => {
  it("should format 32-char hex to UUID", () => {
    expect(formatUuid("abcdef0123456789abcdef0123456789")).toBe(
      "abcdef01-2345-6789-abcd-ef0123456789"
    );
  });

  it("should handle uppercase", () => {
    expect(formatUuid("ABCDEF0123456789ABCDEF0123456789")).toBe(
      "abcdef01-2345-6789-abcd-ef0123456789"
    );
  });
});

describe("isNotionId", () => {
  it("should return true for UUID", () => {
    expect(isNotionId("abcdef01-2345-6789-abcd-ef0123456789")).toBe(true);
  });

  it("should return true for 32-char hex", () => {
    expect(isNotionId("abcdef0123456789abcdef0123456789")).toBe(true);
  });

  it("should return false for names", () => {
    expect(isNotionId("My Page")).toBe(false);
  });

  it("should return false for URLs", () => {
    expect(isNotionId("https://notion.so/abc123")).toBe(false);
  });
});

describe("isNotionUrl", () => {
  it("should return true for notion.so URLs", () => {
    expect(
      isNotionUrl("https://www.notion.so/workspace/abcdef0123456789abcdef0123456789")
    ).toBe(true);
  });

  it("should return true for notion.site URLs", () => {
    expect(
      isNotionUrl("https://workspace.notion.site/abcdef0123456789abcdef0123456789")
    ).toBe(true);
  });

  it("should return false for other URLs", () => {
    expect(isNotionUrl("https://example.com/page")).toBe(false);
  });

  it("should return false for plain text", () => {
    expect(isNotionUrl("My Page")).toBe(false);
  });
});
