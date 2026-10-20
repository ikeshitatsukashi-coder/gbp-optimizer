import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { stores } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { createGmbClient } from "@/lib/gbp-client"
import { verifyApiKey } from "@/lib/services/api-key-auth"
import { errorResponse } from "@/lib/api-helpers"
import { checkRateLimit, getClientId } from "@/lib/rate-limit"
import { getServiceAccessToken } from "@/lib/services/cron-auth"

export const maxDuration = 30

/**
 * GET /api/ext/media-stats?locationId=xxx&since=YYYY-MM-DD  (APIキー認証・読み取り専用)
 *
 * 外部ツールが「写真・動画」欄に載せた動画の成果を取り込むための値を返す。
 *   media       : 店舗の写真・動画の一覧（name・種類・登録日時・Google が返す閲覧数 viewCount）
 *   impressions : 店舗プロフィールの日別の表示回数（地図・検索の合計）。since〜昨日
 * 動画ごとの閲覧数を、同じ期間の店舗の表示回数で割ると「表示した人のうち動画を見た割合」になる。
 * Google への書き込みは一切しない。
 */
export async function GET(request: Request) {
  const rl = checkRateLimit(`ext-media-stats:${getClientId(request)}`, {
    windowMs: 60_000,
    max: 20,
  })
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }
  const auth = await verifyApiKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  const url = new URL(request.url)
  const id = (url.searchParams.get("locationId") ?? "").replace(/^locations\//, "")
  const since = url.searchParams.get("since") ?? ""
  if (!/^\d{1,30}$/.test(id)) {
    return NextResponse.json({ error: "locationId を指定してください" }, { status: 400 })
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) {
    return NextResponse.json({ error: "since は YYYY-MM-DD で指定してください" }, { status: 400 })
  }

  const locationName = `locations/${id}`
  const [store] = await db
    .select({ accountName: stores.accountName })
    .from(stores)
    .where(eq(stores.locationName, locationName))
  if (!store) {
    return NextResponse.json({ error: "店舗が登録されていません" }, { status: 404 })
  }

  const svc = await getServiceAccessToken()
  if (!svc.accessToken) {
    return NextResponse.json({ error: svc.reason }, { status: 503 })
  }
  const client = createGmbClient(svc.accessToken)

  try {
    // 写真・動画の一覧（全ページ）
    type Item = {
      name?: string
      mediaFormat?: string
      createTime?: string
      googleUrl?: string
      insights?: { viewCount?: string | number }
      locationAssociation?: { category?: string }
    }
    const media: Item[] = []
    let pageToken: string | undefined
    let pages = 0
    do {
      const res = (await client.listMedia(store.accountName, locationName, pageToken)) as {
        mediaItems?: Item[]
        nextPageToken?: string
      }
      media.push(...(res.mediaItems ?? []))
      pageToken = res.nextPageToken
    } while (pageToken && ++pages < 10)

    // 店舗プロフィールの表示回数（日別）。Google の集計は数日遅れるので昨日まで
    const end = new Date(Date.now() + 9 * 3600e3 - 86400e3).toISOString().slice(0, 10)
    const impressions: Record<string, number> = {}
    if (since <= end) {
      const ins = (await client.getInsights(locationName, since, end)) as {
        multiDailyMetricTimeSeries?: Array<{
          dailyMetricTimeSeries?: Array<{
            dailyMetric?: string
            timeSeries?: { datedValues?: Array<{ date?: { year: number; month: number; day: number }; value?: string }> }
          }>
        }>
      }
      for (const group of ins.multiDailyMetricTimeSeries ?? []) {
        for (const s of group.dailyMetricTimeSeries ?? []) {
          if (!s.dailyMetric?.startsWith("BUSINESS_IMPRESSIONS_")) continue
          for (const dv of s.timeSeries?.datedValues ?? []) {
            if (!dv.date) continue
            const d = `${dv.date.year}-${String(dv.date.month).padStart(2, "0")}-${String(dv.date.day).padStart(2, "0")}`
            impressions[d] = (impressions[d] ?? 0) + Number(dv.value ?? 0)
          }
        }
      }
    }

    return NextResponse.json({
      media: media.map((m) => ({
        name: m.name ?? null,
        mediaFormat: m.mediaFormat ?? null,
        category: m.locationAssociation?.category ?? null,
        createTime: m.createTime ?? null,
        viewCount: m.insights?.viewCount != null ? Number(m.insights.viewCount) : null,
        googleUrl: m.googleUrl ?? null,
      })),
      impressions,
      range: { since, end },
    })
  } catch (e) {
    return errorResponse("Failed to load media stats", e)
  }
}
