/**
 * Notion → Markdown変換
 * notion-to-md + frontmatter付加
 */
import { Client } from "@notionhq/client";
import { NotionToMarkdown } from "notion-to-md";
import matter from "gray-matter";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints.js";
import { pageToFrontmatter } from "./frontmatter.js";
import type { DocumentFrontmatter } from "./types.js";

/**
 * Notionページをfrontmatter付きMarkdown文字列に変換する。
 */
export async function pageToMarkdown(
  client: Client,
  page: PageObjectResponse
): Promise<string> {
  const n2m = new NotionToMarkdown({
    notionClient: client,
    config: {
      parseChildPages: false,
      separateChildPage: false,
    },
  });

  // カスタムトランスフォーマー: 未サポートブロックのフォールバック
  n2m.setCustomTransformer("breadcrumb", async () => "");
  n2m.setCustomTransformer("table_of_contents", async () => "");
  n2m.setCustomTransformer("child_database", async (block) => {
    return `[Unsupported: child_database]`;
  });

  const mdBlocks = await n2m.pageToMarkdown(page.id);
  const mdString = n2m.toMarkdownString(mdBlocks);

  const frontmatter = pageToFrontmatter(page);
  return buildMarkdown(frontmatter, mdString.parent);
}

/**
 * frontmatterオブジェクトとMarkdown本文からfrontmatter付きMD文字列を生成する。
 */
export function buildMarkdown(
  frontmatter: DocumentFrontmatter,
  content: string
): string {
  // undefinedの値を除去（gray-matterがnullを出力してしまうため）
  const cleanFm: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(frontmatter)) {
    if (value !== undefined) {
      cleanFm[key] = value;
    }
  }

  return matter.stringify((content ?? "").trim() + "\n", cleanFm);
}
