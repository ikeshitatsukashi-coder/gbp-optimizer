import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { companies, stores } from "@/lib/db/schema"
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm"
import { getAccessToken, getSessionEmail } from "@/lib/get-session"
import { errorResponse } from "@/lib/api-helpers"
import { requireRole } from "@/lib/services/authz"
import { suggestCompanyGroups } from "@/lib/services/company-suggest"

/**
 * 会社（法人）マスタ
 *
 * GET  一覧（所属店舗数つき）。?suggest=1 で未紐づけ店舗の会社候補も返す
 * POST 会社を作成（code 未指定なら C001 形式で自動採番）
 *
 * ※店舗との紐づけは自動で行わない。候補を提示し、画面で人が確定する。
 */

/** 次の会社コードを採番する（C001, C002, ...）。社内コードがある場合は指定を優先 */
async function nextCode(): Promise<string> {
  const rows = await db.select({ code: companies.code }).from(companies)
  let max = 0
  for (const r of rows) {
    const m = r.code.match(/^C(\d+)$/)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return `C${String(max + 1).padStart(3, "0")}`
}

export async function GET(request: Request) {
  const token = await getAccessToken()
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const withSuggest = new URL(request.url).searchParams.get("suggest") === "1"

  try {
    const list = await db
      .select({
        id: companies.id,
        code: companies.code,
        name: companies.name,
        notes: companies.notes,
        storeCount: sql<number>`(
          select count(*) from stores where stores.company_id = ${companies.id}
        )::int`,
      })
      .from(companies)
      .orderBy(asc(companies.code))

    if (!withSuggest) {
      return NextResponse.json({ companies: list })
    }

    // 会社が未設定の店舗だけを候補にする（既に確定済みのものは触らない）
    const unassigned = await db
      .select({ locationName: stores.locationName, title: stores.title })
      .from(stores)
      .where(isNull(stores.companyId))
      .orderBy(asc(stores.title))

    const groups = suggestCompanyGroups(unassigned)

    return NextResponse.json({
      companies: list,
      unassignedCount: unassigned.length,
      /** 候補（確定ではない）。画面で人が選んで確定する */
      suggestions: groups,
    })
  } catch (e) {
    return errorResponse("Failed to list companies", e)
  }
}

export async function POST(request: Request) {
  const denied = await requireRole("editor")
  if (denied) return denied

  const token = await getAccessToken()
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  let body: { code?: string; name?: string; notes?: string; locationNames?: string[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const name = body.name?.trim()
  if (!name) {
    return NextResponse.json({ error: "会社名を入力してください" }, { status: 400 })
  }

  try {
    const code = body.code?.trim() || (await nextCode())

    const [dup] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.code, code))
    if (dup) {
      return NextResponse.json(
        { error: `会社コード「${code}」は既に使われています` },
        { status: 400 }
      )
    }

    const email = await getSessionEmail()
    const [created] = await db
      .insert(companies)
      .values({ code, name, notes: body.notes ?? null, createdBy: email })
      .returning({ id: companies.id, code: companies.code, name: companies.name })

    // 作成と同時に店舗を紐づける場合（画面で人が選んだ店舗のみ）
    let assigned = 0
    if (Array.isArray(body.locationNames) && body.locationNames.length > 0) {
      const result = await db
        .update(stores)
        .set({ companyId: created.id, updatedAt: new Date() })
        .where(
          // 既に別の会社が確定している店舗は上書きしない
          and(inArray(stores.locationName, body.locationNames), isNull(stores.companyId))
        )
        .returning({ locationName: stores.locationName })
      assigned = result.length
    }

    return NextResponse.json({ success: true, company: created, assigned })
  } catch (e) {
    return errorResponse("Failed to create company", e)
  }
}
