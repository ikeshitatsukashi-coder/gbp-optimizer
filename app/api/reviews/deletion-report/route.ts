import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { sql } from "drizzle-orm"
import { getAccessToken } from "@/lib/get-session"
import { errorResponse } from "@/lib/api-helpers"

/**
 * GET /api/reviews/deletion-report
 *   ?locationName=locations/123   単一店舗
 *   ?group=株式会社LIGO           グループ（店舗名の前方一致）
 *   ?from=2026-01-01&to=2026-07-31 期間（削除を検知した日で絞る）
 *
 * クライアント報告用。「消えたクチコミ」＋「当社の削除申請記録」を突き合わせて返す。
 *
 * ※Google には削除申請のAPIが存在しない（v4 の :flag は 404）。
 *   実務ではGBP管理画面やGoogleのフォームから人が申請するため、
 *   flag_history には手動申請の記録（status='manual'）も入る。
 */

export async function GET(request: Request) {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const url = new URL(request.url)
  const locationName = url.searchParams.get("locationName")?.trim()
  const group = url.searchParams.get("group")?.trim()
  const from = url.searchParams.get("from")?.trim()
  const to = url.searchParams.get("to")?.trim()

  try {
    // 期間は「削除を検知した日」で判定。検知日が無い古いデータは投稿日で代替する。
    const fromCond = from
      ? sql`AND COALESCE(r.deleted_detected_at, r.create_time) >= ${from}::timestamptz`
      : sql``
    // to は「その日を含む」ため翌日0時未満で比較
    const toCond = to
      ? sql`AND COALESCE(r.deleted_detected_at, r.create_time) < (${to}::date + INTERVAL '1 day')`
      : sql``
    const locCond = locationName
      ? sql`AND r.location_name = ${locationName}`
      : sql``
    const groupCond = group ? sql`AND s.title ILIKE ${group + "%"}` : sql``

    const result = await db.execute(sql`
      SELECT
        r.review_name,
        r.location_name,
        s.title            AS store_name,
        r.reviewer,
        r.star_rating,
        r.comment,
        r.reply_comment,
        r.create_time,
        r.deleted_detected_at,
        (
          SELECT json_build_object(
            'flaggedAt',     f.flagged_at,
            'status',        f.status::text,
            'requestMethod', f.request_method,
            'requestedBy',   f.requested_by,
            'note',          f.note
          )
          FROM flag_history f
          WHERE f.review_name = r.review_name
          ORDER BY
            -- 手動記録・申請成功を優先し、次に新しいものを採用
            CASE f.status::text
              WHEN 'manual' THEN 0
              WHEN 'submitted' THEN 1
              WHEN 'approved' THEN 2
              WHEN 'already_reported' THEN 3
              ELSE 9
            END,
            f.flagged_at DESC
          LIMIT 1
        ) AS flag_record
      FROM reviews_archive r
      INNER JOIN stores s ON s.location_name = r.location_name
        AND (s.has_voice_of_merchant IS NULL OR s.has_voice_of_merchant = true)
        AND s.duplicate_of IS NULL
      WHERE r.archive_reason = 'deleted'
        ${locCond}
        ${groupCond}
        ${fromCond}
        ${toCond}
      ORDER BY r.deleted_detected_at DESC NULLS LAST, r.create_time DESC
      LIMIT 2000
    `)

    type Row = {
      review_name: string
      location_name: string
      store_name: string
      reviewer: string | null
      star_rating: number | null
      comment: string | null
      reply_comment: string | null
      create_time: string | null
      deleted_detected_at: string | null
      flag_record: {
        flaggedAt: string | null
        status: string | null
        requestMethod: string | null
        requestedBy: string | null
        note: string | null
      } | null
    }
    const rows = ((result as unknown as { rows?: Row[] }).rows ?? result) as Row[]

    const items = rows.map((r) => ({
      reviewName: r.review_name,
      locationName: r.location_name,
      storeName: r.store_name,
      reviewer: r.reviewer,
      starRating: r.star_rating,
      comment: r.comment,
      replyComment: r.reply_comment,
      createTime: r.create_time ? new Date(r.create_time).toISOString() : null,
      deletedDetectedAt: r.deleted_detected_at
        ? new Date(r.deleted_detected_at).toISOString()
        : null,
      flag: r.flag_record
        ? {
            flaggedAt: r.flag_record.flaggedAt
              ? new Date(r.flag_record.flaggedAt).toISOString()
              : null,
            status: r.flag_record.status,
            requestMethod: r.flag_record.requestMethod,
            requestedBy: r.flag_record.requestedBy,
            note: r.flag_record.note,
          }
        : null,
    }))

    /** 申請記録があり、かつ「申請した」と言える状態のもの */
    const requested = items.filter(
      (i) =>
        i.flag &&
        ["manual", "submitted", "approved", "already_reported"].includes(i.flag.status ?? "")
    )
    const rated = items.filter((i) => typeof i.starRating === "number")

    return NextResponse.json({
      items,
      summary: {
        total: items.length,
        requested: requested.length,
        /** 申請記録なしで消えたもの（投稿者の自主削除・Google判断など） */
        notRequested: items.length - requested.length,
        withComment: items.filter((i) => (i.comment ?? "").trim().length > 0).length,
        lowRating: items.filter((i) => (i.starRating ?? 5) <= 2).length,
        avgRating:
          rated.length > 0
            ? Math.round(
                (rated.reduce((s, i) => s + (i.starRating ?? 0), 0) / rated.length) * 100
              ) / 100
            : null,
        stores: new Set(items.map((i) => i.locationName)).size,
      },
    })
  } catch (e) {
    return errorResponse("Failed to build deletion report", e)
  }
}
