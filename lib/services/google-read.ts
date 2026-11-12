import { getAccessToken } from "@/lib/get-session"
import { getServiceAccessToken } from "@/lib/services/cron-auth"

/**
 * Google からの「読み取り」に使う認証をまとめたもの。
 *
 * まずログイン中の担当の認証で読み、期限切れ・権限不足のときだけ
 * 予約投稿の自動実行で使っている保存済みの認証で読み直す。
 * （担当のログインが切れていてもレポートを出せるようにするため）
 *
 * ここを通す処理は読み取りだけにすること。書き込みには使わない。
 */

/** 認証切れ・権限不足のエラーか */
export function isGoogleAuthError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  return /\b(401|403)\b|UNAUTHENTICATED|PERMISSION_DENIED|invalid authentication credentials/i.test(
    msg
  )
}

async function candidateTokens(): Promise<string[]> {
  const out: string[] = []
  const session = await getAccessToken()
  // ローカル確認用の仮トークンは Google には通らないので使わない
  if (session && session !== "dev-bypass-token") out.push(session)
  const svc = await getServiceAccessToken()
  if (svc.accessToken) out.push(svc.accessToken)
  return out
}

/**
 * fn に認証を渡して実行する。認証切れ・権限不足なら次の認証で1回だけやり直す。
 */
export async function withGoogleRead<T>(fn: (accessToken: string) => Promise<T>): Promise<T> {
  const tokens = await candidateTokens()
  if (tokens.length === 0) {
    throw new Error(
      "Google の認証がありません。いちどログアウトして、ログインし直してください。"
    )
  }
  let lastErr: unknown
  for (const t of tokens) {
    try {
      return await fn(t)
    } catch (e) {
      lastErr = e
      if (!isGoogleAuthError(e)) throw e
    }
  }
  throw lastErr
}
