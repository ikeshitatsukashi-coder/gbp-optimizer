import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { reviewsArchive } from "@/lib/db/schema"
import { getAccessToken } from "@/lib/get-session"
import { and, eq, sql } from "drizzle-orm"
import { errorResponse } from "@/lib/api-helpers"

/**
 * GET /api/reviews/analytics
 *   ?locationName=...    1店舗のみ分析（省略時は全店舗集計）
 *
 * reviews_archive (archiveReason='current') から各種統計を返す
 */
export async function GET(request: Request) {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const url = new URL(request.url)
  const locationName = url.searchParams.get("locationName") ?? undefined

  try {
    const whereClauses = [eq(reviewsArchive.archiveReason, "current")]
    if (locationName) {
      const full = locationName.startsWith("locations/")
        ? locationName
        : `locations/${locationName}`
      whereClauses.push(eq(reviewsArchive.locationName, full))
    }
    const where = and(...whereClauses)

    // 1. 集計（KPI）
    const [aggRow] = await db
      .select({
        total: sql<number>`count(*)::int`,
        avgRating: sql<string>`coalesce(avg(${reviewsArchive.starRating}), 0)::text`,
        withReply: sql<number>`count(*) filter (where ${reviewsArchive.replyComment} is not null and length(trim(${reviewsArchive.replyComment})) > 0)::int`,
      })
      .from(reviewsArchive)
      .where(where)

    // 2. 評価分布
    const ratingRows = await db
      .select({
        stars: reviewsArchive.starRating,
        count: sql<number>`count(*)::int`,
      })
      .from(reviewsArchive)
      .where(where)
      .groupBy(reviewsArchive.starRating)

    const distMap = new Map<number, number>()
    for (const r of ratingRows) {
      if (r.stars != null) distMap.set(r.stars, r.count)
    }
    const ratingDistribution = [5, 4, 3, 2, 1].map((stars) => ({
      stars,
      count: distMap.get(stars) ?? 0,
    }))

    // 3. 月別推移
    const monthlyRows = await db.execute<{
      month: string
      count: number
      avg: string
    }>(sql`
      SELECT
        to_char(date_trunc('month', create_time), 'YYYY-MM') AS month,
        count(*)::int AS count,
        coalesce(avg(star_rating), 0)::text AS avg
      FROM reviews_archive
      WHERE archive_reason = 'current'
        AND create_time IS NOT NULL
        ${locationName ? sql`AND location_name = ${locationName.startsWith("locations/") ? locationName : "locations/" + locationName}` : sql``}
      GROUP BY 1
      ORDER BY 1 DESC
      LIMIT 12
    `)
    const monthlyList = (Array.isArray(monthlyRows)
      ? monthlyRows
      : ((monthlyRows as unknown as { rows?: unknown[] }).rows ?? [])) as Array<{
      month: string
      count: number
      avg: string
    }>
    const monthlyTrend = monthlyList.reverse().map((r) => ({
      month: r.month,
      count: Number(r.count) || 0,
      avg: Number(parseFloat(r.avg).toFixed(2)) || 0,
    }))

    // 4. キーワード抽出（簡易：頻出単語）
    const commentRows = await db
      .select({ comment: reviewsArchive.comment })
      .from(reviewsArchive)
      .where(where)
      .limit(2000)

    const STOP_WORDS = new Set([
      "の",
      "に",
      "は",
      "を",
      "た",
      "が",
      "で",
      "て",
      "と",
      "し",
      "れ",
      "さ",
      "ある",
      "いる",
      "も",
      "する",
      "から",
      "な",
      "こと",
      "として",
      "い",
      "や",
      "れる",
      "など",
      "なっ",
      "ない",
      "この",
      "ため",
      "その",
      "あっ",
      "よう",
      "また",
      "もの",
      "という",
      "あり",
      "まで",
      "られ",
      "なる",
      "へ",
      "か",
      "だ",
      "これ",
      "によって",
      "により",
      "おり",
      "より",
      "対する",
      "行う",
      "について",
      "ので",
      "です",
      "ます",
      "でした",
      "ました",
    ])
    const wordCounts = new Map<string, number>()
    for (const row of commentRows) {
      if (!row.comment) continue
      // Naive: split by non-Japanese boundaries and 2+ chars
      const tokens = row.comment
        .replace(/[\s\d.,!?。、！？「」『』（）()【】\[\]/\\:\-_=+]/g, " ")
        .split(" ")
        .filter((t) => t.length >= 2 && !STOP_WORDS.has(t))
      for (const t of tokens) {
        wordCounts.set(t, (wordCounts.get(t) ?? 0) + 1)
      }
    }
    const keywords = Array.from(wordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([word, count]) => ({ word, count }))

    return NextResponse.json({
      kpi: {
        total: aggRow?.total ?? 0,
        avgRating: parseFloat(aggRow?.avgRating ?? "0") || 0,
        withReply: aggRow?.withReply ?? 0,
        replyRate:
          aggRow?.total && aggRow.total > 0
            ? Math.round(((aggRow.withReply ?? 0) / aggRow.total) * 100)
            : 0,
      },
      ratingDistribution,
      monthlyTrend,
      keywords,
    })
  } catch (e) {
    return errorResponse("Failed to compute analytics", e)
  }
}
