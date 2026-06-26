import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getAccessToken } from "@/lib/get-session"
import { sql } from "drizzle-orm"
import { errorResponse } from "@/lib/api-helpers"

/**
 * GET /api/reviews/per-store-summary
 * 全店舗の集計を1店舗1行で返す（運用中の店舗のみ）。
 */
export async function GET() {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    const rows = await db.execute<{
      location_name: string
      store_name: string
      industry: string
      status: string
      total: number
      avg_rating: string
      replied: number
      one_star: number
      two_star: number
      latest_review: Date | string | null
    }>(sql`
      SELECT
        s.location_name,
        s.title AS store_name,
        s.industry::text AS industry,
        s.status::text AS status,
        count(r.review_name)::int AS total,
        coalesce(avg(r.star_rating), 0)::text AS avg_rating,
        count(r.review_name) FILTER (
          WHERE r.reply_comment IS NOT NULL AND length(trim(r.reply_comment)) > 0
        )::int AS replied,
        count(r.review_name) FILTER (WHERE r.star_rating = 1)::int AS one_star,
        count(r.review_name) FILTER (WHERE r.star_rating = 2)::int AS two_star,
        max(r.create_time) AS latest_review
      FROM stores s
      LEFT JOIN reviews_archive r
        ON r.location_name = s.location_name
        AND r.archive_reason = 'current'
      WHERE s.status = 'active'
      GROUP BY s.location_name, s.title, s.industry, s.status
      ORDER BY total DESC, avg_rating ASC
      LIMIT 1000
    `)

    const list = Array.isArray(rows)
      ? rows
      : ((rows as unknown as { rows?: unknown[] }).rows ?? [])

    const summary = (list as Array<Record<string, unknown>>).map((row) => {
      const r = row as {
        location_name: string
        store_name: string
        industry: string
        status: string
        total: number
        avg_rating: string
        replied: number
        one_star: number
        two_star: number
        latest_review: Date | string | null
      }
      const total = Number(r.total) || 0
      const replied = Number(r.replied) || 0
      return {
        locationName: r.location_name,
        storeName: r.store_name,
        industry: r.industry,
        status: r.status,
        total,
        avgRating: parseFloat(r.avg_rating) || 0,
        replied,
        replyRate: total > 0 ? Math.round((replied / total) * 100) : 0,
        oneStar: Number(r.one_star) || 0,
        twoStar: Number(r.two_star) || 0,
        latestReview: r.latest_review ? new Date(r.latest_review).toISOString() : null,
      }
    })

    return NextResponse.json({ summary })
  } catch (e) {
    return errorResponse("Failed to compute summary", e)
  }
}
