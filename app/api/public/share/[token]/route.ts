import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { shareLinks, stores } from "@/lib/db/schema"
import { and, eq, sql } from "drizzle-orm"
import { checkRateLimit, getClientId } from "@/lib/rate-limit"
import { computeQuickDiagnosis } from "@/lib/services/quick-diagnosis"

/**
 * GET /api/public/share/{token}
 * お客様向け閲覧専用データ（認証なし・トークンが鍵・読み取りのみ）。
 * - 診断スコア / クチコミ: DB からリアルタイム
 * - インサイト: 発行/更新時のスナップショット
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const rl = checkRateLimit(`pub-share:${getClientId(request)}`, {
    windowMs: 60_000,
    max: 30,
  })
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }

  const { token } = await params
  if (!token || token.length < 10) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const [link] = await db.select().from(shareLinks).where(eq(shareLinks.token, token))
  if (!link || link.revoked) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  // 対象店舗
  const scopeStores =
    link.scopeType === "store" && link.locationName
      ? await db
          .select({ locationName: stores.locationName, title: stores.title })
          .from(stores)
          .where(eq(stores.locationName, link.locationName))
      : await db
          .select({ locationName: stores.locationName, title: stores.title })
          .from(stores)
          .where(
            and(
              eq(stores.parentCompany, link.parentCompany ?? ""),
              eq(stores.status, "active")
            )
          )
          .orderBy(stores.title)

  if (scopeStores.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  const scopeSet = new Set(scopeStores.map((s) => s.locationName))
  const sections = link.sections ?? []

  const payload: Record<string, unknown> = {
    name: link.name,
    scopeType: link.scopeType,
    sections,
    stores: scopeStores,
    generatedAt: new Date().toISOString(),
  }

  // 診断スコア（DBのみ・高速）
  if (sections.includes("diagnosis")) {
    const all = await computeQuickDiagnosis()
    const scoped = all.stores.filter((s) => scopeSet.has(s.locationName))
    const avg =
      scoped.length > 0
        ? Math.round(scoped.reduce((a, s) => a + s.score, 0) / scoped.length)
        : 0
    payload.diagnosis = {
      stores: scoped.map((s) => ({
        locationName: s.locationName,
        storeName: s.storeName,
        score: s.score,
        reviewCount: s.reviewCount,
        replyRate: s.replyRate,
        avgRating: s.avgRating,
        issues: s.issues,
      })),
      avgScore: avg,
    }
  }

  // クチコミ（現存のみ）
  if (sections.includes("reviews")) {
    const locationList = [...scopeSet]
    const inClause = sql.join(
      locationList.map((l) => sql`${l}`),
      sql`, `
    )
    const statsRows = await db.execute(sql`
      SELECT
        count(*)::int AS total,
        coalesce(avg(star_rating), 0)::numeric(3,2)::text AS avg_rating,
        count(*) FILTER (WHERE reply_comment IS NOT NULL AND length(trim(reply_comment)) > 0)::int AS replied,
        count(*) FILTER (WHERE star_rating = 5)::int AS star5,
        count(*) FILTER (WHERE star_rating = 4)::int AS star4,
        count(*) FILTER (WHERE star_rating = 3)::int AS star3,
        count(*) FILTER (WHERE star_rating = 2)::int AS star2,
        count(*) FILTER (WHERE star_rating = 1)::int AS star1
      FROM reviews_archive
      WHERE archive_reason = 'current'
        AND location_name IN (${inClause})
    `)
    const statsList = Array.isArray(statsRows)
      ? statsRows
      : ((statsRows as { rows?: unknown[] }).rows ?? [])
    const stats = (statsList[0] ?? {}) as Record<string, unknown>

    const recentRows = await db.execute(sql`
      SELECT r.reviewer, r.star_rating, r.comment, r.create_time, r.reply_comment,
             s.title AS store_title
      FROM reviews_archive r
      INNER JOIN stores s ON s.location_name = r.location_name
      WHERE r.archive_reason = 'current'
        AND r.location_name IN (${inClause})
      ORDER BY r.create_time DESC NULLS LAST
      LIMIT 30
    `)
    const recent = Array.isArray(recentRows)
      ? recentRows
      : ((recentRows as { rows?: unknown[] }).rows ?? [])

    payload.reviews = {
      total: stats.total ?? 0,
      avgRating: stats.avg_rating ?? "0",
      replied: stats.replied ?? 0,
      distribution: {
        5: stats.star5 ?? 0,
        4: stats.star4 ?? 0,
        3: stats.star3 ?? 0,
        2: stats.star2 ?? 0,
        1: stats.star1 ?? 0,
      },
      recent: (recent as Array<Record<string, unknown>>).map((r) => ({
        reviewer: r.reviewer,
        starRating: r.star_rating,
        comment: r.comment,
        createTime: r.create_time,
        replied: !!(r.reply_comment && String(r.reply_comment).trim().length > 0),
        storeTitle: r.store_title,
      })),
    }
  }

  // インサイト（スナップショット）
  if (sections.includes("insights")) {
    payload.insights = link.insightsSnapshot ?? null
  }

  return NextResponse.json(payload)
}
