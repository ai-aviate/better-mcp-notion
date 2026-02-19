/**
 * Notion URL→ID変換、UUID正規化等のユーティリティ
 */

const NOTION_URL_PATTERN =
  /(?:https?:\/\/)?(?:[^/]+\.)?notion\.(?:so|site)\/(?:[^/]+\/)?(?:[^?#]*-)?([a-f0-9]{32})(?:[?#].*)?$/i;

const UUID_PATTERN =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

const RAW_ID_PATTERN = /^[a-f0-9]{32}$/i;

/**
 * Notion URL または ID からページ/DB IDを抽出する。
 * 入力: URL, UUID形式, ハイフンなしID のいずれか。
 */
export function extractId(input: string): string {
  const trimmed = input.trim();

  // UUID形式 (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
  if (UUID_PATTERN.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  // ハイフンなし32文字
  if (RAW_ID_PATTERN.test(trimmed)) {
    return formatUuid(trimmed);
  }

  // Notion URL
  const match = trimmed.match(NOTION_URL_PATTERN);
  if (match) {
    return formatUuid(match[1]);
  }

  // そのまま返す（名前検索用途）
  return trimmed;
}

/**
 * 32文字のハイフンなしIDをUUID形式に変換する。
 */
export function formatUuid(raw: string): string {
  const id = raw.replace(/-/g, "").toLowerCase();
  return [
    id.slice(0, 8),
    id.slice(8, 12),
    id.slice(12, 16),
    id.slice(16, 20),
    id.slice(20, 32),
  ].join("-");
}

/**
 * 入力がNotionのID（UUID or 32文字hex）かどうか判定する。
 */
export function isNotionId(input: string): boolean {
  const trimmed = input.trim();
  return UUID_PATTERN.test(trimmed) || RAW_ID_PATTERN.test(trimmed);
}

/**
 * 入力がNotion URLかどうか判定する。
 */
export function isNotionUrl(input: string): boolean {
  return NOTION_URL_PATTERN.test(input.trim());
}
