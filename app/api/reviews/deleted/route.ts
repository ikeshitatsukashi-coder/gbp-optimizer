import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getAccessToken } from "@/lib/get-session"
import { sql } from "drizzle-orm"
import { errorResponse } from "@/lib/api-helpers"

/**
 * GET /api/reviews/deleted
 *   ?storeFilter=...
 *
 * archive_reason='deleted' のクチコミを一覧。
 * クチコミ削除申請が通った／投稿者が削除した／その他で消えた履歴の確認に使う。
 */
export async function GET(request: Request) {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const url = new URL(request.url)
  const storeFilter = url.searchParams.get("storeFilter")?.trim()

  try {
    const rows = await db.execute(sql`
      SELECT
        r.review_name,
        r.location_name,
        s.title AS store_name,
        r.reviewer,
        r.star_rating,
        r.comment,
        r.create_time,
        r.deleted_detected_at,
        (
          SELECT json_build_object(
            'flaggedAt', f.flagged_at,
            'status', f.status::text
          )
          FROM flag_history f
          WHERE f.review_name = r.review_name
            AND f.status IN ('submitted', 'approved')
          ORDER BY f.flagged_at DESC
          LIMIT 1
        ) AS last_flag
      FROM reviews_archive r
      INNER JOIN stores s ON s.location_name = r.location_name
        AND (s.has_voice_of_merchant IS NULL OR s.has_voice_of_merchant = true)
        AND s.duplicate_of IS NULL
      WHERE r.archive_reason = 'deleted'
        ${storeFilter ? sql`AND s.title ILIKE ${"%" + storeFilter + "%"}` : sql``}
      ORDER BY r.deleted_detected_at DESC NULLS LAST
      LIMIT 1000
    `)

    const list = Array.isArray(rows)
      ? rows
      : ((rows as { rows?: unknown[] }).rows ?? [])

    interface Row {
      review_name: string
      location_name: string
      store_name: string
      reviewer: string | null
      star_rating: number | null
      comment: string | null
      create_time: Date | string | null
      deleted_detected_at: Date | string | null
      last_flag: { flaggedAt?: string | null; status?: string } | null
    }

    const deleted = (list as Array<Record<string, unknown>>).map((row) => {
      const r = row as unknown as Row
      return {
        reviewName: r.review_name,
        locationName: r.location_name,
        storeName: r.store_name,
        reviewer: r.reviewer,
        starRating: r.star_rating,
        comment: r.comment,
        createTime: r.create_time ? new Date(r.create_time).toISOString() : null,
        deletedDetectedAt: r.deleted_detected_at
          ? new Date(r.deleted_detected_at).toISOString()
          : null,
        lastFlaggedAt: r.last_flag?.flaggedAt
          ? new Date(r.last_flag.flaggedAt).toISOString()
          : null,
        wasFlagged: !!r.last_flag?.flaggedAt,
      }
    })

    // by-store summary
    const byStore: Record<string, number> = {}
    for (const d of deleted) {
      byStore[d.storeName] = (byStore[d.storeName] ?? 0) + 1
    }

    // flagged vs natural
    const flaggedCount = deleted.filter((d) => d.wasFlagged).length

    return NextResponse.json({
      deleted,
      total: deleted.length,
      flaggedCount,
      naturalCount: deleted.length - flaggedCount,
      storeCount: Object.keys(byStore).length,
    })
  } catch (e) {
    return errorResponse("Failed to fetch deleted reviews", e)
  }
}
