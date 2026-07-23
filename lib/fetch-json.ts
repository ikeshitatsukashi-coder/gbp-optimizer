/**
 * fetch のレスポンスを安全に JSON パースする（クライアント用）。
 *
 * Vercel の上限超過(413)やタイムアウト(504)ではプレーンな HTML/テキストが返るため、
 * そのまま res.json() すると「Unexpected token 'R'...」のような分かりにくい
 * エラーになる。ここで status に応じた日本語メッセージへ変換する。
 *
 * 使い方:
 *   const { ok, data, error } = await fetchJson("/api/...", {...})
 *   if (!ok) throw new Error(error)
 */
export interface FetchJsonResult<T = Record<string, unknown>> {
  ok: boolean
  status: number
  data: T | null
  error: string | null
}

export async function fetchJson<T = Record<string, unknown>>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<FetchJsonResult<T>> {
  let res: Response
  try {
    res = await fetch(input, init)
  } catch (e) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: `通信に失敗しました: ${e instanceof Error ? e.message : String(e)}`,
    }
  }

  const text = await res.text()
  let data: T | null = null
  try {
    data = text ? (JSON.parse(text) as T) : null
  } catch {
    data = null
  }

  if (res.ok && data !== null) {
    return { ok: true, status: res.status, data, error: null }
  }

  // JSON で返ってきたエラー
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>
    const msg =
      (typeof d.error === "string" && d.error) ||
      (typeof d.detail === "string" && d.detail) ||
      null
    if (msg) return { ok: res.ok, status: res.status, data, error: res.ok ? null : msg }
  }

  // JSON でないエラー応答（プラットフォームのHTML等）を status で翻訳
  const friendly =
    res.status === 413
      ? "送信データが大きすぎます（画像は自動リサイズしていますが、枚数を減らすか小さい画像でお試しください）。"
      : res.status === 504 || res.status === 408
        ? "処理がタイムアウトしました。時間をおいて再試行してください。"
        : res.status === 401
          ? "ログインの有効期限が切れています。再度ログインしてください。"
          : res.status >= 500
            ? `サーバーエラーが発生しました（HTTP ${res.status}）。`
            : `エラーが発生しました（HTTP ${res.status}）。`

  return { ok: false, status: res.status, data, error: friendly }
}
