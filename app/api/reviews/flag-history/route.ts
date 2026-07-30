import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getAccessToken } from "@/lib/get-session"
import { sql } from "drizzle-orm"
import { errorResponse } from "@/lib/api-helpers"

/**
 * GET /api/reviews/flag-history
 *   ?storeFilter=...
 *   ?status=submitted|already_reported|failed|approved|rejected
 *   ?limit=500
 *
 * 削除申請履歴を新しい順に返す。
 */
export async function GET(request: Request) {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const url = new URL(request.url)
  const storeFilter = url.searchParams.get("storeFilter")?.trim()
  const status = url.searchParams.get("status")
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "500", 10), 1), 2000)

  try {
    const rows = await db.execute(sql`
      SELECT
        f.id,
        f.review_name,
        f.location_name,
        s.title AS store_name,
        f.reviewer_snapshot,
        f.star_rating_snapshot,
        f.comment_snapshot,
        f.status::text AS status,
        f.error_message,
        f.flagged_at,
        f.confirmed_at,
        (
          SELECT r.archive_reason::text
          FROM reviews_archive r
          WHERE r.review_name = f.review_name
        ) AS current_archive_reason
      FROM flag_history f
      INNER JOIN stores s ON s.location_name = f.location_name
        AND (s.has_voice_of_merchant IS NULL OR s.has_voice_of_merchant = true)
        AND s.duplicate_of IS NULL
      WHERE 1=1
        ${storeFilter ? sql`AND s.title ILIKE ${"%" + storeFilter + "%"}` : sql``}
        ${status ? sql`AND f.status::text = ${status}` : sql``}
      ORDER BY f.flagged_at DESC
      LIMIT ${limit}
    `)

    const list = Array.isArray(rows)
      ? rows
      : ((rows as { rows?: unknown[] }).rows ?? [])

    interface Row {
      id: number
      review_name: string
      location_name: string
      store_name: string
      reviewer_snapshot: string | null
      star_rating_snapshot: number | null
      comment_snapshot: string | null
      status: string
      error_message: string | null
      flagged_at: Date | string
      confirmed_at: Date | string | null
      current_archive_reason: string | null
    }

    const history = (list as Array<Record<string, unknown>>).map((row) => {
      const r = row as unknown as Row
      return {
        id: r.id,
        reviewName: r.review_name,
        locationName: r.location_name,
        storeName: r.store_name,
        reviewer: r.reviewer_snapshot,
        starRating: r.star_rating_snapshot,
        comment: r.comment_snapshot,
        status: r.status,
        errorMessage: r.error_message,
        flaggedAt: new Date(r.flagged_at).toISOString(),
        confirmedAt: r.confirmed_at ? new Date(r.confirmed_at).toISOString() : null,
        currentArchiveReason: r.current_archive_reason ?? null,
        wasDeleted: r.current_archive_reason === "deleted",
      }
    })

    // Aggregate stats
    const byStatus: Record<string, number> = {}
    for (const h of history) {
      byStatus[h.status] = (byStatus[h.status] ?? 0) + 1
    }
    const deletedAfterFlag = history.filter((h) => h.wasDeleted).length

    return NextResponse.json({
      history,
      total: history.length,
      byStatus,
      deletedAfterFlag,
    })
  } catch (e) {
    return errorResponse("Failed to fetch flag history", e)
  }
}
