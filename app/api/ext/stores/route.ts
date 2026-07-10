import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { stores } from "@/lib/db/schema"
import { and, asc, eq, ilike, or, sql } from "drizzle-orm"
import { verifyApiKey } from "@/lib/services/api-key-auth"
import { errorResponse } from "@/lib/api-helpers"
import { checkRateLimit, getClientId } from "@/lib/rate-limit"

/**
 * GET /api/ext/stores
 *   ?status=active|paused|archived
 *   ?industry=...
 *   ?q=<店舗名・電話・親会社 部分一致>
 *   ?limit / ?offset
 *
 * 店舗一覧（APIキー認証・読み取り専用）
 */
export async function GET(request: Request) {
  const rl = checkRateLimit(`ext-stores:${getClientId(request)}`, {
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
  const status = url.searchParams.get("status")
  const industry = url.searchParams.get("industry")
  const q = url.searchParams.get("q")?.trim()
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "500", 10), 1000)
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10), 0)

  try {
    const conditions = []
    if (status === "active" || status === "paused" || status === "archived") {
      conditions.push(eq(stores.status, status))
    }
    if (industry) {
      conditions.push(sql`${stores.industry}::text = ${industry}`)
    }
    if (q) {
      const like = `%${q}%`
      conditions.push(
        or(
          ilike(stores.title, like),
          ilike(stores.primaryPhone, like),
          ilike(stores.parentCompany, like)
        )
      )
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined

    const rows = await db
      .select({
        locationName: stores.locationName,
        title: stores.title,
        industry: stores.industry,
        status: stores.status,
        primaryPhone: stores.primaryPhone,
        primaryCategory: stores.primaryCategory,
        parentCompany: stores.parentCompany,
        autoReplyEnabled: stores.autoReplyEnabled,
        autoFlagEnabled: stores.autoFlagEnabled,
      })
      .from(stores)
      .where(where)
      .orderBy(asc(stores.title))
      .limit(limit)
      .offset(offset)

    return NextResponse.json({ stores: rows, count: rows.length })
  } catch (e) {
    return errorResponse("Failed to list stores", e)
  }
}
