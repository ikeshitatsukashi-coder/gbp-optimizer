import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { stores, type Store } from "@/lib/db/schema"
import { getAccessToken } from "@/lib/get-session"
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm"
import { checkRateLimit, getClientId } from "@/lib/rate-limit"
import { errorResponse } from "@/lib/api-helpers"

/**
 * GET /api/stores
 *
 * クエリパラメータ:
 *   status=active|paused|archived  ステータスでフィルタ（省略時は全件）
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

    const [rows, totalRow] = await Promise.all([
      db.select().from(stores).where(where).orderBy(orderExpr).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(stores).where(where),
    ])

    return NextResponse.json({
      stores: rows,
      total: totalRow[0]?.count ?? 0,
      limit,
      offset,
    })
  } catch (e) {
    return errorResponse("Failed to list stores", e)
  }
}
