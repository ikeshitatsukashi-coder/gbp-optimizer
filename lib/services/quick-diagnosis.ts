import { db } from "@/lib/db"
import { sql } from "drizzle-orm"

export interface QuickDiagnosisStore {
  locationName: string
  storeName: string
  industry: string
  score: number
  hasPhone: boolean
  hasAddress: boolean
  hasCategory: boolean
  reviewCount: number
  replyRate: number | null
  unansweredLow: number
  avgRating: number
  issues: string[]
}

export interface QuickDiagnosisResult {
  stores: QuickDiagnosisStore[]
  summary: {
    total: number
    avgScore: number
    critical: number
    warning: number
    good: number
  }
}

/**
 * 全 active 店舗のクイック診断（DB のみ・GBP 書き込みなし）。
 * /api/meo/diagnosis と /api/ext/diagnosis の共通ロジック。
 */
export async function computeQuickDiagnosis(): Promise<QuickDiagnosisResult> {
  const rows = await db.execute(sql`
    SELECT
      s.location_name,
      s.title,
      s.industry::text AS industry,
      (s.primary_phone IS NOT NULL AND length(trim(s.primary_phone)) > 0) AS has_phone,
      (s.address IS NOT NULL) AS has_address,
      (s.primary_category IS NOT NULL AND length(trim(s.primary_category)) > 0) AS has_category,
      count(r.review_name)::int AS review_count,
      count(r.review_name) FILTER (
        WHERE r.reply_comment IS NOT NULL AND length(trim(r.reply_comment)) > 0
      )::int AS replied_count,
      count(r.review_name) FILTER (
        WHERE r.star_rating <= 2
          AND (r.reply_comment IS NULL OR length(trim(r.reply_comment)) = 0)
      )::int AS unanswered_low,
      coalesce(avg(r.star_rating), 0)::text AS avg_rating
    FROM stores s
    LEFT JOIN reviews_archive r
      ON r.location_name = s.location_name AND r.archive_reason = 'current'
    WHERE s.status = 'active'
    GROUP BY s.location_name, s.title, s.industry, s.primary_phone, s.address, s.primary_category
    ORDER BY s.title
    LIMIT 1000
  `)

  const list = Array.isArray(rows)
    ? rows
    : ((rows as { rows?: unknown[] }).rows ?? [])

  interface Row {
    location_name: string
    title: string
    industry: string
    has_phone: boolean
    has_address: boolean
    has_category: boolean
    review_count: number
    replied_count: number
    unanswered_low: number
    avg_rating: string
  }

  const stores = (list as Array<Record<string, unknown>>).map((raw) => {
    const r = raw as unknown as Row
    const reviewCount = Number(r.review_count) || 0
    const replied = Number(r.replied_count) || 0
    const unansweredLow = Number(r.unanswered_low) || 0
    const replyRate = reviewCount > 0 ? replied / reviewCount : null

    let score = 0
    if (r.has_phone) score += 20
    if (r.has_address) score += 20
    if (r.has_category) score += 20
    if (replyRate === null) score += 10
    else score += Math.round(replyRate * 20)
    if (unansweredLow === 0) score += 20
    else if (unansweredLow <= 2) score += 10

    const issues: string[] = []
    if (!r.has_phone) issues.push("電話番号未設定")
    if (!r.has_address) issues.push("住所未設定")
    if (!r.has_category) issues.push("カテゴリ未設定")
    if (replyRate !== null && replyRate < 0.5) issues.push("クチコミ返信率50%未満")
    if (unansweredLow > 0) issues.push(`未対応の低評価 ${unansweredLow}件`)

    return {
      locationName: r.location_name,
      storeName: r.title,
      industry: r.industry,
      score,
      hasPhone: r.has_phone,
      hasAddress: r.has_address,
      hasCategory: r.has_category,
      reviewCount,
      replyRate: replyRate === null ? null : Math.round(replyRate * 100),
      unansweredLow,
      avgRating: parseFloat(r.avg_rating) || 0,
      issues,
    }
  })

  const avgScore =
    stores.length > 0
      ? Math.round(stores.reduce((s, x) => s + x.score, 0) / stores.length)
      : 0

  return {
    stores,
    summary: {
      total: stores.length,
      avgScore,
      critical: stores.filter((s) => s.score < 50).length,
      warning: stores.filter((s) => s.score >= 50 && s.score < 80).length,
      good: stores.filter((s) => s.score >= 80).length,
    },
  }
}
