import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getAccessToken } from "@/lib/get-session"
import { sql } from "drizzle-orm"
import { errorResponse } from "@/lib/api-helpers"

/**
 * GET /api/reviews/highlights
 *   ?locationName=...  単一店舗（省略時は全店舗集計）
 *
 * 注目すべきクチコミを抽出:
 *  - top:        最近の高評価（★5・コメント付き・長め）
 *  - concerning: 最近の低評価（★1-2・コメント付き）
 *  - unreplied:  未返信のクチコミ（古い順 / 改善余地）
 */
export async function GET(request: Request) {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const url = new URL(request.url)
  const locationName = url.searchParams.get("locationName") ?? undefined
  const fullLocation = locationName
    ? locationName.startsWith("locations/")
      ? locationName
      : `locations/${locationName}`
    : null

  try {
    const baseWhere = sql`r.archive_reason = 'current'
      ${fullLocation ? sql`AND r.location_name = ${fullLocation}` : sql``}`

    const [topRes, concerningRes, unrepliedRes] = await Promise.all([
      db.execute(sql`
        SELECT r.review_name, r.location_name, s.title AS store_name,
               r.reviewer, r.star_rating, r.comment, r.create_time, r.reply_comment
        FROM reviews_archive r
        INNER JOIN stores s ON s.location_name = r.location_name
        AND (s.has_voice_of_merchant IS NULL OR s.has_voice_of_merchant = true)
        AND s.duplicate_of IS NULL
        WHERE ${baseWhere}
          AND r.star_rating = 5
          AND r.comment IS NOT NULL
          AND length(trim(r.comment)) >= 30
        ORDER BY r.create_time DESC NULLS LAST
        LIMIT 20
      `),
      db.execute(sql`
        SELECT r.review_name, r.location_name, s.title AS store_name,
               r.reviewer, r.star_rating, r.comment, r.create_time, r.reply_comment
        FROM reviews_archive r
        INNER JOIN stores s ON s.location_name = r.location_name
        AND (s.has_voice_of_merchant IS NULL OR s.has_voice_of_merchant = true)
        AND s.duplicate_of IS NULL
        WHERE ${baseWhere}
          AND r.star_rating <= 2
          AND r.comment IS NOT NULL
          AND length(trim(r.comment)) > 0
        ORDER BY r.create_time DESC NULLS LAST
        LIMIT 20
      `),
      db.execute(sql`
        SELECT r.review_name, r.location_name, s.title AS store_name,
               r.reviewer, r.star_rating, r.comment, r.create_time, r.reply_comment
        FROM reviews_archive r
        INNER JOIN stores s ON s.location_name = r.location_name
        AND (s.has_voice_of_merchant IS NULL OR s.has_voice_of_merchant = true)
        AND s.duplicate_of IS NULL
        WHERE ${baseWhere}
          AND (r.reply_comment IS NULL OR length(trim(r.reply_comment)) = 0)
          AND r.comment IS NOT NULL
          AND length(trim(r.comment)) > 0
        ORDER BY r.create_time ASC NULLS LAST
        LIMIT 20
      `),
    ])

    return NextResponse.json({
      top: toList(topRes),
      concerning: toList(concerningRes),
      unreplied: toList(unrepliedRes),
    })
  } catch (e) {
    return errorResponse("Failed to fetch highlights", e)
  }
}

interface HighlightRow {
  review_name: string
  location_name: string
  store_name: string
  reviewer: string | null
  star_rating: number | null
  comment: string | null
  create_time: Date | string | null
  reply_comment: string | null
}

function toList(rows: unknown): Array<{
  reviewName: string
  locationName: string
  storeName: string
  reviewer: string | null
  starRating: number | null
  comment: string | null
  createTime: string | null
  hasReply: boolean
}> {
  const list = Array.isArray(rows)
    ? rows
    : ((rows as { rows?: unknown[] }).rows ?? [])
  return (list as HighlightRow[]).map((r) => ({
    reviewName: r.review_name,
    locationName: r.location_name,
    storeName: r.store_name,
    reviewer: r.reviewer,
    starRating: r.star_rating,
    comment: r.comment,
    createTime: r.create_time ? new Date(r.create_time).toISOString() : null,
    hasReply: !!(r.reply_comment && r.reply_comment.trim()),
  }))
}
