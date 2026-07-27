import { NextResponse } from "next/server"
import { getAccessToken } from "@/lib/get-session"
import { getFlagCandidates } from "@/lib/services/reviews-sync"
import { errorResponse } from "@/lib/api-helpers"

/**
 * GET /api/reviews/candidates
 *   ?locationName=...    対象店舗（上部プルダウンで選択中の店舗に限定）
 *   ?storeFilter=...     店舗名部分一致
 *   ?cooldownDays=N      連投ガード日数（default 14）
 *
 * 削除申請バッチの対象候補（運用中・星2以下・コメント付き・cooldown経過）を返す
 */
export async function GET(request: Request) {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const url = new URL(request.url)
  const storeFilter = url.searchParams.get("storeFilter") ?? undefined
  const locationNameRaw = url.searchParams.get("locationName")
  const locationNames = locationNameRaw
    ? [
        locationNameRaw.startsWith("locations/")
          ? locationNameRaw
          : `locations/${locationNameRaw}`,
      ]
    : undefined
  const cooldownDaysRaw = url.searchParams.get("cooldownDays")
  const cooldownDays = cooldownDaysRaw ? Math.max(0, parseInt(cooldownDaysRaw, 10)) : 14

  try {
    const candidates = await getFlagCandidates({ locationNames, storeFilter, cooldownDays })
    return NextResponse.json({
      candidates,
      total: candidates.length,
    })
  } catch (e) {
    return errorResponse("Failed to fetch candidates", e)
  }
}
