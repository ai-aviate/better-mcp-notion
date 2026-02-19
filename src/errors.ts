/**
 * エラーハンドリング
 */

export class NotionMcpError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "NotionMcpError";
  }
}

/**
 * エラーをMCPレスポンス用のテキストに変換する。
 * LLMが次のアクションを判断できるよう、具体的なヒントを含める。
 */
export function formatError(error: unknown): string {
  if (error instanceof NotionMcpError) {
    return `Error [${error.code}]: ${error.message}`;
  }

  if (error instanceof Error) {
    // Notion API errors (APIResponseError has status & code)
    const status = "status" in error ? (error as { status: number }).status : undefined;
    const code = "code" in error ? (error as { code: string }).code : undefined;

    if (status || code) {
      const prefix = `Notion API Error${status ? ` (HTTP ${status})` : ""}${code ? ` [${code}]` : ""}`;
      const hint = getErrorHint(status, code);
      return `${prefix}: ${error.message}${hint ? `\nHint: ${hint}` : ""}`;
    }
    return `Error: ${error.message}`;
  }

  return `Error: ${String(error)}`;
}

function getErrorHint(status?: number, code?: string): string | null {
  if (status === 401) return "NOTION_API_KEY is invalid or expired.";
  if (status === 403) return "The integration does not have access to this page/database. Add the integration via 'Connect to' in Notion.";
  if (status === 404) return "Page or database not found. Verify the ID and that the integration has access.";
  if (status === 409) return "Conflict: the page was modified by another process. Try again.";
  if (status === 429) return "Rate limited. The request will be retried automatically, but if this persists, reduce the frequency of calls.";
  if (code === "validation_error") return "Invalid parameters. Check the property names and value formats.";
  return null;
}
