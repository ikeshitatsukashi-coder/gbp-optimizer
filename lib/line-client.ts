/**
 * LINE Messaging API クライアント
 *
 * Messaging API は審査不要・無料枠ありで使えるため、Meta（Instagram / Facebook）の
 * アプリ審査を待たずに実装できる。
 *
 * 参照: https://developers.line.biz/en/reference/messaging-api/
 */

const BASE = "https://api.line.me"

export interface LineBotInfo {
  /** ボットのユーザーID */
  userId: string
  /** @から始まるベーシックID（例: @123abcde） */
  basicId: string
  /** 公式アカウントの表示名 */
  displayName: string
  pictureUrl?: string
  /** chat / bot — 応答モード */
  chatMode?: string
  markAsReadMode?: string
}

export interface LineQuota {
  /** none = 無制限（従量）, limited = 上限あり */
  type: string
  value?: number
}

export class LineApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = "LineApiError"
    this.status = status
  }
}

async function lineRequest<T>(
  path: string,
  accessToken: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  })

  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }

  if (!res.ok) {
    const d = data as { message?: string; details?: { message?: string }[] } | null
    // LINEは 401=トークン不正, 403=プラン/権限不足 を返す
    const detail = d?.details?.map((x) => x.message).filter(Boolean).join(" / ")
    const msg =
      res.status === 401
        ? "チャネルアクセストークンが正しくありません（LINE Developersで再発行してください）"
        : res.status === 403
          ? "この操作の権限がありません（Messaging APIチャネルの設定をご確認ください）"
          : d?.message || `LINE APIエラー (HTTP ${res.status})`
    throw new LineApiError(detail ? `${msg}: ${detail}` : msg, res.status)
  }

  return data as T
}

/** トークンの疎通確認と公式アカウント情報の取得 */
export function getBotInfo(accessToken: string): Promise<LineBotInfo> {
  return lineRequest<LineBotInfo>("/v2/bot/info", accessToken)
}

/** 当月の送信上限 */
export function getQuota(accessToken: string): Promise<LineQuota> {
  return lineRequest<LineQuota>("/v2/bot/message/quota", accessToken)
}

/** 当月の送信済み件数 */
export function getQuotaConsumption(
  accessToken: string
): Promise<{ totalUsage: number }> {
  return lineRequest<{ totalUsage: number }>(
    "/v2/bot/message/quota/consumption",
    accessToken
  )
}

/**
 * 友だち数。20人未満だと status が "unready" になりカウントが返らない仕様。
 * date は YYYYMMDD（前日以前でないとデータが無い）。
 */
export function getFollowerInsight(
  accessToken: string,
  yyyymmdd: string
): Promise<{ status: string; followers?: number; targetedReaches?: number }> {
  return lineRequest(`/v2/bot/insight/followers?date=${yyyymmdd}`, accessToken)
}

export type LineMessage =
  | { type: "text"; text: string }
  | { type: "image"; originalContentUrl: string; previewImageUrl: string }

/**
 * 友だち全員へ配信する（ブロードキャスト）。
 *
 * 実際に相手のLINEへ届く操作なので、呼び出し側で必ず確認を取ること。
 * retryKey を渡すと同じ配信の二重送信を防げる（LINE側で冪等になる）。
 */
export async function broadcast(
  accessToken: string,
  messages: LineMessage[],
  options?: { retryKey?: string; notificationDisabled?: boolean }
): Promise<void> {
  await lineRequest<Record<string, never>>("/v2/bot/message/broadcast", accessToken, {
    method: "POST",
    body: JSON.stringify({
      messages,
      notificationDisabled: options?.notificationDisabled ?? false,
    }),
    ...(options?.retryKey ? { headers: { "X-Line-Retry-Key": options.retryKey } } : {}),
  })
}
