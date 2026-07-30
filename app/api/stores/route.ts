import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { stores, type Store } from "@/lib/db/schema"
import { getAccessToken } from "@/lib/get-session"
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm"
import { checkRateLimit, getClientId } from "@/lib/rate-limit"
import { errorResponse } from "@/lib/api-helpers"
import { isValidScope, scopeCountsSql, storeScopeCondition } from "@/lib/store-scope"

/**
 * GET /api/stores
 *
 * クエリパラメータ:
 *   status=active|paused|archived  ステータスでフィルタ（省略時は全件）
 *   scope=operational|unverified|duplicate
 *     operational … オーナー確認済み(または不明)かつ重複でない店舗のみ（店舗セレクタ等の既定）
 *     unverified  … オーナー確認が必要な店舗のみ
 *     duplicate   … 重複リスティングのみ
 *     省略時は全件（従来動作）
 *   breakdown=1                    scope別の件数内訳も返す（店舗マスタのフィルタ用）
 *   industry=btob_logistics|...    業種でフィルタ
 *   q=<freetext>                   タイトル / 住所 / 電話 部分一致
 *   autoReply=true|false           自動返信ON/OFFでフィルタ
 *   autoFlag=true|false            自動削除申請ON/OFFでフィルタ
 *   sort=title|status|updated      ソート（default: title）
 *   order=asc|desc                 並び順
 *   limit=<n>                      最大件数（default: 1000）
 *   offset=<n>                     オフセット
 */
export async function GET(request: Request) {
  const rl = checkRateLimit(`stores-list:${getClientId(request)}`, {
    windowMs: 60_000,
    max: 60,
  })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter ?? 60) } }
    )
  }

  // 認証チェック（公開させない）
  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const url = new URL(request.url)
  const status = url.searchParams.get("status")
  const scopeParam = url.searchParams.get("scope")
  const scope = isValidScope(scopeParam) ? scopeParam : "all"
  /** 内訳（運用対象/未確認/重複の件数）が必要な画面だけ true にする */
  const wantBreakdown = url.searchParams.get("breakdown") === "1"
  const industry = url.searchParams.get("industry")
  const q = url.searchParams.get("q")?.trim()
  const autoReply = url.searchParams.get("autoReply")
  const autoFlag = url.searchParams.get("autoFlag")
  const sort = url.searchParams.get("sort") ?? "title"
  const order = url.searchParams.get("order") === "desc" ? "desc" : "asc"
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "1000", 10), 2000)
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10), 0)

  try {
    const conditions = []
    const scopeCond = storeScopeCondition(scope)
    if (scopeCond) conditions.push(scopeCond)
    if (status === "active" || status === "paused" || status === "archived") {
      conditions.push(eq(stores.status, status))
    }
    if (industry) {
      conditions.push(eq(stores.industry, industry as Store["industry"]))
    }
    if (autoReply === "true") conditions.push(eq(stores.autoReplyEnabled, true))
    if (autoReply === "false") conditions.push(eq(stores.autoReplyEnabled, false))
    if (autoFlag === "true") conditions.push(eq(stores.autoFlagEnabled, true))
    if (autoFlag === "false") conditions.push(eq(stores.autoFlagEnabled, false))
    if (q) {
      const like = `%${q}%`
      // あいまい検索: 中黒・空白を除去した状態でも一致させる
      // （「アイリンク」で「株式会社アイ・リンク」がヒットするように）
      const compactQ = q
        .normalize("NFKC")
        .toLowerCase()
        .replace(/[\s・･·\-‐‑–—−]/g, "")
      const compactLike = `%${compactQ}%`
      conditions.push(
        or(
          ilike(stores.title, like),
          ilike(stores.primaryPhone, like),
          ilike(stores.parentCompany, like),
          sql`replace(replace(replace(${stores.title}, '・', ''), ' ', ''), '　', '') ILIKE ${compactLike}`,
          sql`replace(replace(replace(coalesce(${stores.parentCompany}, ''), '・', ''), ' ', ''), '　', '') ILIKE ${compactLike}`,
          sql`replace(replace(coalesce(${stores.primaryPhone}, ''), '-', ''), ' ', '') ILIKE ${compactLike}`
        )
      )
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined

    const orderColumn =
      sort === "status"
        ? stores.status
        : sort === "updated"
          ? stores.updatedAt
          : stores.title
    const orderExpr = order === "desc" ? desc(orderColumn) : asc(orderColumn)

    // 件数クエリは1本だけに保つ（DB負荷を増やさないため）。
    // breakdown=1 のときは scope 以外の条件で内訳を数え、total はそこから導出する
    // （total = 内訳の該当 scope の件数と必ず一致する）。
    if (wantBreakdown) {
      const countConditions = conditions.filter((c) => c !== scopeCond)
      const countWhere = countConditions.length > 0 ? and(...countConditions) : undefined

      const [rows, breakdownRow] = await Promise.all([
        db.select().from(stores).where(where).orderBy(orderExpr).limit(limit).offset(offset),
        db
          .select({
            all: scopeCountsSql.all,
            operational: scopeCountsSql.operational,
            unverified: scopeCountsSql.unverified,
            duplicate: scopeCountsSql.duplicate,
          })
          .from(stores)
          .where(countWhere),
      ])
      const breakdown =
        breakdownRow[0] ?? { all: 0, operational: 0, unverified: 0, duplicate: 0 }

      return NextResponse.json({
        stores: rows,
        total: breakdown[scope] ?? breakdown.all,
        /** scope 別の件数（フィルタUIのバッジ用） */
        breakdown,
        scope,
        limit,
        offset,
      })
    }

    const [rows, totalRow] = await Promise.all([
      db.select().from(stores).where(where).orderBy(orderExpr).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(stores).where(where),
    ])

    return NextResponse.json({
      stores: rows,
      total: totalRow[0]?.count ?? 0,
      scope,
      limit,
      offset,
    })
  } catch (e) {
    return errorResponse("Failed to list stores", e)
  }
}
