import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getAccessToken } from "@/lib/get-session"
import { sql } from "drizzle-orm"
import { errorResponse } from "@/lib/api-helpers"

/**
 * GET /api/reviews/unreplied
 *   ?days=8                直近 N 日（default 8 = ユーザー要件の「直近8日分」）
 *   ?storeFilter=...       店舗名部分一致
 *   ?industry=...          業種フィルタ
 *
 * 自動返信対象の候補：
 *  - 運用中(active)店舗
 *  - 返信なし
 *  - コメントあり
 *  - 直近 N 日（create_time >= now - N days）
 *  - review_exclusions に登録されていない
 */
export async function GET(request: Request) {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const url = new URL(request.url)
  const days = Math.max(1, parseInt(url.searchParams.get("days") ?? "8", 10))
  const storeFilter = url.searchParams.get("storeFilter")?.trim()
  const industry = url.searchParams.get("industry")?.trim()

  try {
    const rows = await db.execute(sql`
      SELECT
        r.review_name,
        r.location_name,
        s.title AS store_name,
        s.industry::text AS industry,
        r.reviewer,
        r.star_rating,
        r.comment,
        r.create_time
      FROM reviews_archive r
      INNER JOIN stores s ON s.location_name = r.location_name
        AND (s.has_voice_of_merchant IS NULL OR s.has_voice_of_merchant = true)
        AND s.duplicate_of IS NULL
      WHERE s.status = 'active'
        AND s.auto_reply_enabled = true
        AND r.archive_reason = 'current'
        AND (r.reply_comment IS NULL OR length(trim(r.reply_comment)) = 0)
        AND r.comment IS NOT NULL
        AND length(trim(r.comment)) > 0
        AND r.create_time IS NOT NULL
        AND r.create_time >= now() - (${days} || ' days')::interval
        ${storeFilter ? sql`AND s.title ILIKE ${"%" + storeFilter + "%"}` : sql``}
        ${industry ? sql`AND s.industry::text = ${industry}` : sql``}
        AND NOT EXISTS (
          SELECT 1 FROM review_exclusions e
          WHERE e.location_name = r.location_name
            AND e.exclude_auto_reply = true
            AND (
              e.review_name = r.review_name
              OR (e.reviewer_name = r.reviewer AND e.create_time = r.create_time)
            )
        )
      ORDER BY r.create_time DESC
      LIMIT 500
    `)

    const list = Array.isArray(rows)
      ? rows
      : ((rows as { rows?: unknown[] }).rows ?? [])

    const candidates = (list as Array<Record<string, unknown>>).map((row) => {
      const r = row as {
        review_name: string
        location_name: string
        store_name: string
        industry: string
        reviewer: string | null
        star_rating: number | null
        comment: string | null
        create_time: Date | string | null
      }
      return {
        reviewName: r.review_name,
        locationName: r.location_name,
        storeName: r.store_name,
        industry: r.industry,
        reviewer: r.reviewer,
        starRating: r.star_rating,
        comment: r.comment,
        createTime: r.create_time ? new Date(r.create_time).toISOString() : null,
      }
    })

    return NextResponse.json({ candidates, days })
  } catch (e) {
    return errorResponse("Failed to fetch unreplied candidates", e)
  }
}
