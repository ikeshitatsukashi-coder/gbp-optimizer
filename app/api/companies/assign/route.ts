import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { companies, stores } from "@/lib/db/schema"
import { eq, inArray } from "drizzle-orm"
import { getAccessToken } from "@/lib/get-session"
import { errorResponse } from "@/lib/api-helpers"
import { requireRole } from "@/lib/services/authz"

/**
 * POST /api/companies/assign
 *
 * 画面で人が確定した「店舗 → 会社」の紐づけを保存する。
 * body: { companyId: number | null, locationNames: string[] }
 *   companyId: null を渡すと紐づけを解除する
 *
 * 自動推測では紐づけない。ここは必ず人の操作を経由する。
 */
export async function POST(request: Request) {
  const denied = await requireRole("editor")
  if (denied) return denied

  const token = await getAccessToken()
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  let body: { companyId?: number | null; locationNames?: string[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const locationNames = Array.isArray(body.locationNames)
    ? body.locationNames.filter((v) => typeof v === "string" && v.trim())
    : []
  if (locationNames.length === 0) {
    return NextResponse.json({ error: "対象の店舗を選択してください" }, { status: 400 })
  }
  if (locationNames.length > 1000) {
    return NextResponse.json({ error: "一度に指定できるのは1000件までです" }, { status: 400 })
  }

  const companyId = body.companyId ?? null

  try {
    if (companyId !== null) {
      const [company] = await db
        .select({ id: companies.id })
        .from(companies)
        .where(eq(companies.id, companyId))
      if (!company) {
        return NextResponse.json({ error: "会社が見つかりません" }, { status: 404 })
      }
    }

    const updated = await db
      .update(stores)
      .set({ companyId, updatedAt: new Date() })
      .where(inArray(stores.locationName, locationNames))
      .returning({ locationName: stores.locationName })

    return NextResponse.json({
      success: true,
      updated: updated.length,
      /** 指定したのに更新されなかった件数（存在しない店舗IDを渡した場合） */
      notFound: locationNames.length - updated.length,
    })
  } catch (e) {
    return errorResponse("Failed to assign company", e)
  }
}
