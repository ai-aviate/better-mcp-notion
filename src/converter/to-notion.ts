/**
 * Markdown → Notionブロック変換
 * @tryfabric/martian統合
 */
import { markdownToBlocks } from "@tryfabric/martian";
import matter from "gray-matter";
import type { BlockObjectRequest } from "@notionhq/client/build/src/api-endpoints.js";
import type { ParsedDocument, DocumentFrontmatter } from "./types.js";

/**
 * frontmatter付きMarkdown文字列をパースして、
 * ParsedDocumentに変換する。
 */
export function parseMarkdown(markdown: string): ParsedDocument {
  const { data, content } = matter(markdown);

  const frontmatter: DocumentFrontmatter = {
    id: data.id,
    url: data.url,
    title: data.title,
    icon: data.icon,
    cover: data.cover,
    parent: data.parent,
    database: data.database,
    properties: data.properties,
    last_edited: data.last_edited,
    created: data.created,
  };

  return { frontmatter, content };
}

/**
 * Markdown本文をNotionブロック配列に変換する。
 */
export function markdownToNotionBlocks(content: string): BlockObjectRequest[] {
  return markdownToBlocks(content) as BlockObjectRequest[];
}
