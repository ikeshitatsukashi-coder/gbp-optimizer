import { getAccessToken } from "@/lib/get-session"
import { createGmbClient } from "@/lib/gbp-client"
import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  
  
  const accessToken = await getAccessToken()

  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const locationName = request.nextUrl.searchParams.get("locationName")
  const startDate = request.nextUrl.searchParams.get("startDate")
  const endDate = request.nextUrl.searchParams.get("endDate")

  if (!locationName || !startDate || !endDate) {
    return NextResponse.json(
      { error: "locationName, startDate, and endDate are required" },
      { status: 400 }
    )
  }

  // Performance API は「リクエスト日から18ヶ月」が上限。
  // 境界ギリギリだと 400 で弾かれるため、17ヶ月半（525日）で安全にクランプする。
  const MAX_DAYS = 525
  let safeStart = startDate
  const startMs = new Date(startDate).getTime()
  const limitMs = Date.now() - MAX_DAYS * 86400000
  if (!isNaN(startMs) && startMs < limitMs) {
    const d = new Date(limitMs)
    const pad = (n: number) => String(n).padStart(2, "0")
    safeStart = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }

  try {
    const client = createGmbClient(accessToken)
    const data = await client.getInsights(locationName, safeStart, endDate)
    return NextResponse.json({
      ...data,
      ...(safeStart !== startDate
        ? { clampedStartDate: safeStart, note: "Googleの上限（18ヶ月）に合わせて開始日を調整しました" }
        : {}),
    })
  } catch (error) {
    // Google からの実エラーを UI に伝える（原因調査のため握りつぶさない）
    const raw = error instanceof Error ? error.message : String(error)
    console.error("Failed to fetch insights:", raw)

    const isRange = /date|range|18|invalid/i.test(raw)
    const friendly = isRange
      ? "この期間のデータを取得できませんでした（Googleの上限は18ヶ月です）。期間を短くしてお試しください。"
      : /permission|forbidden|403/i.test(raw)
        ? "この店舗のインサイトを取得する権限がありません。"
        : "インサイトの取得に失敗しました。"

    return NextResponse.json({ error: friendly, detail: raw.slice(0, 500) }, { status: 502 })
  }
}
