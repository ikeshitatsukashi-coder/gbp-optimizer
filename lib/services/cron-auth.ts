import { db } from "@/lib/db"
import { appSettings } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

/**
 * 予約投稿の自動実行用の認証まわり。
 *
 * 仕組み: 管理者（meo-support@li-go.jp）が UI で「自動実行を有効化」を押すと、
 * その時のログインセッションの Google リフレッシュトークンを app_settings に保存。
 * 以後、定期実行（GitHub Actions → GET /api/cron/execute-scheduled）は
 * このリフレッシュトークンからアクセストークンを都度発行して投稿する。
 */

const KEY = "gbp_refresh_token"

export interface SavedCronAuth {
  refreshToken: string
  savedBy: string
  savedAt: string
}

export async function saveCronRefreshToken(
  refreshToken: string,
  savedBy: string
): Promise<void> {
  const value = JSON.stringify({
    refreshToken,
    savedBy,
    savedAt: new Date().toISOString(),
  } satisfies SavedCronAuth)
  await db
    .insert(appSettings)
    .values({ key: KEY, value, updatedBy: savedBy })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedBy: savedBy, updatedAt: new Date() },
    })
}

export async function getCronAuthStatus(): Promise<{
  configured: boolean
  savedBy?: string
  savedAt?: string
}> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, KEY))
  if (!row) return { configured: false }
  try {
    const v = JSON.parse(row.value) as SavedCronAuth
    return { configured: true, savedBy: v.savedBy, savedAt: v.savedAt }
  } catch {
    return { configured: false }
  }
}

export async function deleteCronRefreshToken(): Promise<void> {
  await db.delete(appSettings).where(eq(appSettings.key, KEY))
}

/**
 * 保存済みリフレッシュトークンからアクセストークンを発行する。
 * 未設定/失効時は null。
 */
export async function getServiceAccessToken(): Promise<
  { accessToken: string; reason?: undefined } | { accessToken: null; reason: string }
> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, KEY))
  if (!row) {
    return {
      accessToken: null,
      reason:
        "自動実行が未設定です。投稿スケジューラ画面の「自動実行を有効化」を押してください。",
    }
  }
  let saved: SavedCronAuth
  try {
    saved = JSON.parse(row.value) as SavedCronAuth
  } catch {
    return { accessToken: null, reason: "保存済みトークンが壊れています。再設定してください。" }
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
      refresh_token: saved.refreshToken,
    }),
  })
  const data = (await res.json()) as { access_token?: string; error?: string }
  if (!res.ok || !data.access_token) {
    return {
      accessToken: null,
      reason: `トークン更新に失敗しました（${data.error ?? res.status}）。投稿スケジューラ画面で「自動実行を有効化」をやり直してください。`,
    }
  }
  return { accessToken: data.access_token }
}
