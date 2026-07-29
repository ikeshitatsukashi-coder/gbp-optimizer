import { NextResponse } from "next/server"
import { getAccessToken } from "@/lib/get-session"
import { syncReviewsForActiveStores } from "@/lib/services/reviews-sync"
import { errorResponse } from "@/lib/api-helpers"
import { checkRateLimit, getClientId } from "@/lib/rate-limit"
import { requireRole } from "@/lib/services/authz"

/**
 * POST /api/reviews/sync
 * Body (optional): { locationNames?: string[] }
 *
 * 全 active 店舗または指定店舗のクチコミを Google から取得して reviews_archive に保存。
 * 並列度5で 471店舗 ≒ 2-3分
 */
export async function POST(request: Request) {
  const denied = await requireRole("editor")
  if (denied) return denied

  const rl = checkRateLimit(`reviews-sync:${getClientId(request)}`, {
    windowMs: 60_000,
    max: 2,
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

  let body: { locationNames?: string[] } = {}
  try {
    body = await request.json()
  } catch {
    // empty body is fine
  }

  try {
    const result = await syncReviewsForActiveStores(accessToken, {
      locationNames: body.locationNames,
    })
    return NextResponse.json({ success: true, result })
  } catch (e) {
    return errorResponse("Failed to sync reviews", e)
  }
}
