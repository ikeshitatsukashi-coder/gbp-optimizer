import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { stores } from "@/lib/db/schema"
import { getAccessToken } from "@/lib/get-session"
import { sql } from "drizzle-orm"
import { errorResponse } from "@/lib/api-helpers"

/**
 * GET /api/stores/category-stats
 * 現状の業種設定 / Google プライマリカテゴリ / 親会社のカウントを返す。
 * 一括マッピングのルール作成補助に使う。
 */
export async function GET() {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    const [industryRows, categoryRows, parentRows] = await Promise.all([
      db.execute(sql`
        SELECT industry::text AS industry, count(*)::int AS count
        FROM stores
        GROUP BY industry
        ORDER BY count DESC
      `),
      db.execute(sql`
        SELECT coalesce(primary_category, '(未設定)') AS category, count(*)::int AS count
        FROM stores
        GROUP BY primary_category
        ORDER BY count DESC
        LIMIT 100
      `),
      db.execute(sql`
        SELECT coalesce(parent_company, '(未設定)') AS parent, count(*)::int AS count
        FROM stores
        WHERE parent_company IS NOT NULL
        GROUP BY parent_company
        ORDER BY count DESC
        LIMIT 100
      `),
    ])

    const toArr = (rows: unknown): Array<Record<string, unknown>> => {
      if (Array.isArray(rows)) return rows as Array<Record<string, unknown>>
      return ((rows as { rows?: Array<Record<string, unknown>> }).rows ?? [])
    }

    return NextResponse.json({
      byIndustry: toArr(industryRows).map((r) => ({
        industry: r.industry as string,
        count: Number(r.count) || 0,
      })),
      byCategory: toArr(categoryRows).map((r) => ({
        category: r.category as string,
        count: Number(r.count) || 0,
      })),
      byParentCompany: toArr(parentRows).map((r) => ({
        parent: r.parent as string,
        count: Number(r.count) || 0,
      })),
    })
  } catch (e) {
    return errorResponse("Failed to compute stats", e)
  }
}
