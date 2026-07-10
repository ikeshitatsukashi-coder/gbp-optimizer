import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { sql } from "drizzle-orm"
import { verifyApiKey } from "@/lib/services/api-key-auth"
import { errorResponse } from "@/lib/api-helpers"
import { checkRateLimit, getClientId } from "@/lib/rate-limit"

/**
 * GET /api/ext/reviews
 *   ?storeFilter=<店舗名部分一致>
 *   ?maxRating=2          星いくつ以下
 *   ?unrepliedOnly=true   未返信のみ
 *   ?days=30              直近N日
 *   ?limit=100
 *
 * クチコミアーカイブ検索（APIキー認証・読み取り専用）
 */
export async function GET(request: Request) {
  const rl = checkRateLimit(`ext-reviews:${getClientId(request)}`, {
    windowMs: 60_000,
    max: 60,
  })
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }

  const auth = await verifyApiKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  const url = new URL(request.url)
  const storeFilter = url.searchParams.get("storeFilter")?.trim()
  const maxRating = url.searchParams.get("maxRating")
  const unrepliedOnly = url.searchParams.get("unrepliedOnly") === "true"
  const days = url.searchParams.get("days")
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100", 10), 500)

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
        r.reply_comment,
        r.archive_reason::text AS archive_reason
      FROM reviews_archive r
      INNER JOIN stores s ON s.location_name = r.location_name
      WHERE r.archive_reason = 'current'
        ${storeFilter ? sql`AND s.title ILIKE ${"%" + storeFilter + "%"}` : sql``}
        ${maxRating ? sql`AND r.star_rating <= ${parseInt(maxRating, 10)}` : sql``}
        ${
          unrepliedOnly
            ? sql`AND (r.reply_comment IS NULL OR length(trim(r.reply_comment)) = 0)`
            : sql``
        }
        ${
          days
            ? sql`AND r.create_time >= now() - (${parseInt(days, 10)} || ' days')::interval`
            : sql``
        }
      ORDER BY r.create_time DESC NULLS LAST
      LIMIT ${limit}
    `)

    const list = Array.isArray(rows)
      ? rows
      : ((rows as { rows?: unknown[] }).rows ?? [])

    const reviews = (list as Array<Record<string, unknown>>).map((r) => ({
      reviewName: r.review_name,
      locationName: r.location_name,
      storeName: r.store_name,
      reviewer: r.reviewer,
      starRating: r.star_rating,
      comment: r.comment,
      createTime: r.create_time
        ? new Date(r.create_time as string | Date).toISOString()
        : null,
      hasReply: !!(r.reply_comment && String(r.reply_comment).trim()),
    }))

    return NextResponse.json({ reviews, count: reviews.length })
  } catch (e) {
    return errorResponse("Failed to search reviews", e)
  }
}
