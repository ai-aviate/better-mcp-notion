/**
 * Notion APIラッパー
 * ページ取得、ブロック操作、DB query等をまとめる
 */
import { Client, collectPaginatedAPI, isFullPage } from "@notionhq/client";
import type {
  PageObjectResponse,
  DataSourceObjectResponse,
  BlockObjectRequest,
  SearchParameters,
  GetPageResponse,
} from "@notionhq/client/build/src/api-endpoints.js";
import { NotionMcpError } from "../errors.js";

let client: Client | null = null;

/**
 * Notion Clientのシングルトンを取得する。
 */
export function getClient(): Client {
  if (!client) {
    const auth = process.env.NOTION_API_KEY;
    if (!auth) {
      throw new NotionMcpError(
        "NOTION_API_KEY environment variable is not set",
        "AUTH_MISSING"
      );
    }
    client = new Client({ auth, timeoutMs: 30_000 });
  }
  return client;
}

/**
 * ページを取得する（フルオブジェクト）。
 */
export async function getPage(pageId: string): Promise<PageObjectResponse> {
  const notion = getClient();
  const page = await notion.pages.retrieve({ page_id: pageId });
  if (!isFullPage(page)) {
    throw new NotionMcpError(
      "Partial page response received. Check integration permissions.",
      "PARTIAL_RESPONSE"
    );
  }
  return page;
}

/**
 * ページを作成する。
 */
export async function createPage(params: {
  parent: { page_id: string } | { database_id: string };
  properties: Record<string, unknown>;
  children?: BlockObjectRequest[];
  icon?: { emoji: string } | { external: { url: string } };
  cover?: { external: { url: string } };
}): Promise<PageObjectResponse> {
  const notion = getClient();
  const page = await notion.pages.create(params as Parameters<typeof notion.pages.create>[0]);
  if (!isFullPage(page)) {
    throw new NotionMcpError(
      "Partial page response after creation.",
      "PARTIAL_RESPONSE"
    );
  }
  return page;
}

/**
 * ページのプロパティを更新する。
 */
export async function updatePage(
  pageId: string,
  params: {
    properties?: Record<string, unknown>;
    icon?: { emoji: string } | { external: { url: string } } | null;
    cover?: { external: { url: string } } | null;
  }
): Promise<PageObjectResponse> {
  const notion = getClient();
  const page = await notion.pages.update({
    page_id: pageId,
    ...params,
  } as Parameters<typeof notion.pages.update>[0]);
  if (!isFullPage(page)) {
    throw new NotionMcpError(
      "Partial page response after update.",
      "PARTIAL_RESPONSE"
    );
  }
  return page;
}

/**
 * ページの全ブロックを削除する（全置換の前処理）。
 * レートリミット対策として3件ずつ並列削除。
 */
export async function deleteAllBlocks(pageId: string): Promise<void> {
  const notion = getClient();
  const blocks = await collectPaginatedAPI(
    notion.blocks.children.list,
    { block_id: pageId }
  );
  const CONCURRENCY = 3;
  for (let i = 0; i < blocks.length; i += CONCURRENCY) {
    const batch = blocks.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map((block) => notion.blocks.delete({ block_id: block.id }))
    );
  }
}

/**
 * ページにブロックを追加する。
 * Notion APIの制限（100ブロック/リクエスト）に対応してバッチ処理する。
 */
export async function appendBlocks(
  pageId: string,
  children: BlockObjectRequest[]
): Promise<void> {
  const notion = getClient();
  const BATCH_SIZE = 100;
  for (let i = 0; i < children.length; i += BATCH_SIZE) {
    const batch = children.slice(i, i + BATCH_SIZE);
    await notion.blocks.children.append({
      block_id: pageId,
      children: batch,
    });
  }
}

/**
 * データソースを取得する（DBスキーマ取得用）。
 */
export async function getDataSource(
  dataSourceId: string
): Promise<DataSourceObjectResponse> {
  const notion = getClient();
  const ds = await notion.dataSources.retrieve({
    data_source_id: dataSourceId,
  });
  if (ds.object !== "data_source") {
    throw new NotionMcpError(
      "Partial data source response received.",
      "PARTIAL_RESPONSE"
    );
  }
  return ds as DataSourceObjectResponse;
}

/**
 * データベースからデータソースIDを取得する。
 */
export async function getDatabaseDataSourceId(
  databaseId: string
): Promise<string> {
  const notion = getClient();
  const db = await notion.databases.retrieve({ database_id: databaseId });
  if ("data_sources" in db && Array.isArray(db.data_sources) && db.data_sources.length > 0) {
    return db.data_sources[0].id;
  }
  throw new NotionMcpError(
    `Database ${databaseId} has no data sources.`,
    "NO_DATA_SOURCE"
  );
}

/**
 * データソースをクエリする（DBレコード一覧取得）。
 */
export async function queryDataSource(params: {
  dataSourceId: string;
  filter?: Record<string, unknown>;
  sorts?: Array<{ property: string; direction: "ascending" | "descending" }>;
  limit?: number;
}): Promise<PageObjectResponse[]> {
  const notion = getClient();
  const pages: PageObjectResponse[] = [];
  let cursor: string | undefined;
  const limit = params.limit ?? 50;

  while (pages.length < limit) {
    const pageSize = Math.min(100, limit - pages.length);
    const response = await notion.dataSources.query({
      data_source_id: params.dataSourceId,
      filter: params.filter as Parameters<typeof notion.dataSources.query>[0]["filter"],
      sorts: params.sorts,
      start_cursor: cursor,
      page_size: pageSize,
    });

    for (const result of response.results) {
      if (isFullPage(result)) {
        pages.push(result);
      }
    }

    if (!response.has_more || !response.next_cursor) break;
    cursor = response.next_cursor;
  }

  return pages.slice(0, limit);
}

/** 検索結果の統一型 */
export type SearchResult =
  | PageObjectResponse
  | { object: "data_source"; id: string; title: string; url: string };

/**
 * ワークスペース検索
 */
export async function search(params: {
  query: string;
  filter?: "page" | "database";
  limit?: number;
}): Promise<SearchResult[]> {
  const notion = getClient();
  const searchParams: SearchParameters = {
    query: params.query,
    page_size: params.limit ?? 10,
  };
  if (params.filter === "page") {
    searchParams.filter = { value: "page", property: "object" };
  } else if (params.filter === "database") {
    searchParams.filter = { value: "data_source", property: "object" };
  }

  const response = await notion.search(searchParams);
  return response.results.map((result): SearchResult => {
    if (isFullPage(result)) {
      return result;
    }
    // DataSource result - extract basic info
    if ("title" in result && Array.isArray(result.title)) {
      const ds = result as { object: "data_source"; id: string; title: Array<{ plain_text: string }>; url: string };
      return {
        object: "data_source",
        id: ds.id,
        title: ds.title.map((t) => t.plain_text).join(""),
        url: ds.url,
      };
    }
    return {
      object: "data_source",
      id: result.id,
      title: "",
      url: "",
    };
  });
}

/**
 * ページをアーカイブする。
 */
export async function archivePage(pageId: string): Promise<PageObjectResponse> {
  const notion = getClient();
  const page = await notion.pages.update({
    page_id: pageId,
    archived: true,
  });
  if (!isFullPage(page)) {
    throw new NotionMcpError(
      "Partial page response after archive.",
      "PARTIAL_RESPONSE"
    );
  }
  return page;
}

/**
 * ページを移動する。
 */
export async function movePage(
  pageId: string,
  parentId: string,
  parentType: "page_id" | "data_source_id"
): Promise<PageObjectResponse> {
  const notion = getClient();
  const parent =
    parentType === "page_id"
      ? { page_id: parentId }
      : { data_source_id: parentId };
  const page = await notion.pages.move({
    page_id: pageId,
    parent,
  } as Parameters<typeof notion.pages.move>[0]);
  if (!isFullPage(page)) {
    throw new NotionMcpError(
      "Partial page response after move.",
      "PARTIAL_RESPONSE"
    );
  }
  return page;
}

/**
 * ページの子要素一覧を取得する。
 * 段階的に pagination して、必要な件数だけ取得する。
 */
export async function listChildren(
  pageId: string,
  limit?: number
): Promise<PageObjectResponse[]> {
  const notion = getClient();
  const childPages: PageObjectResponse[] = [];
  let cursor: string | undefined;
  const maxItems = limit ?? 100;

  outer: while (childPages.length < maxItems) {
    const response = await notion.blocks.children.list({
      block_id: pageId,
      start_cursor: cursor,
      page_size: 100,
    });

    for (const block of response.results) {
      if (
        "type" in block &&
        (block.type === "child_page" || block.type === "child_database")
      ) {
        try {
          const page = await getPage(block.id);
          childPages.push(page);
          if (childPages.length >= maxItems) break outer;
        } catch {
          // アクセス権がない場合はスキップ
        }
      }
    }

    if (!response.has_more || !response.next_cursor) break;
    cursor = response.next_cursor;
  }

  return childPages;
}

/**
 * IDがページかDBかを判定する。
 * getPage()を試し、404の場合のみDBと判定する。
 * 権限エラーやネットワークエラーは再スローする。
 */
export async function detectObjectType(
  id: string
): Promise<{ type: "page" | "database"; page?: PageObjectResponse }> {
  try {
    const page = await getPage(id);
    return { type: "page", page };
  } catch (error) {
    // Notion APIの404 = このIDではページが見つからない → DBの可能性
    if (error instanceof Error && "status" in error && (error as { status: number }).status === 404) {
      return { type: "database" };
    }
    // 権限エラー、レート制限、ネットワークエラー等はそのまま投げる
    throw error;
  }
}

/**
 * 名前でページまたはDBを検索して単一の結果を返す。
 * 複数マッチした場合はエラーを出す。
 */
export async function resolveByName(
  name: string,
  type?: "page" | "database"
): Promise<{ id: string; object: "page" | "database" }> {
  const results = await search({
    query: name,
    filter: type,
    limit: 5,
  });

  const matches = results.filter((r) => {
    if ("properties" in r && r.object === "page") {
      // PageObjectResponse
      const titleProp = Object.values(r.properties).find(
        (p) => p.type === "title"
      );
      if (titleProp && titleProp.type === "title") {
        const title = titleProp.title.map((t) => t.plain_text).join("");
        return title === name;
      }
    }
    if ("title" in r && typeof r.title === "string") {
      return r.title === name;
    }
    return false;
  });

  if (matches.length === 0) {
    throw new NotionMcpError(
      `"${name}" not found. Check the name and try again.`,
      "NOT_FOUND"
    );
  }

  if (matches.length > 1) {
    const list = matches
      .map((r) => `  - ${r.id}`)
      .join("\n");
    throw new NotionMcpError(
      `Multiple matches found for "${name}":\n${list}\nUse ID to specify the exact target.`,
      "AMBIGUOUS"
    );
  }

  const match = matches[0];
  return {
    id: match.id,
    object: match.object === "page" ? "page" : "database",
  };
}
