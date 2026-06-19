import { NextResponse } from "next/server"
import { getAccessToken } from "@/lib/get-session"
import { syncAllStores } from "@/lib/services/store-sync"
import { errorResponse } from "@/lib/api-helpers"
import { checkRateLimit, getClientId } from "@/lib/rate-limit"

/**
 * POST /api/stores/sync
 *
 * Google API から全店舗を取得して DB(stores) に UPSERT する。
 * 業種・運用ステータス・自動返信フラグ等の社内設定は維持される。
 *
 * 434店舗で 30〜60秒程度かかる想定。
 */
export async function POST(request: Request) {
  const rl = checkRateLimit(`stores-sync:${getClientId(request)}`, {
    windowMs: 60_000,
    max: 3, // 1分間に3回まで
  })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter ?? 60) } }
    )
  }

  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    const result = await syncAllStores(accessToken)
    return NextResponse.json({ success: true, result })
  } catch (e) {
    return errorResponse("Failed to sync stores", e)
  }
}
