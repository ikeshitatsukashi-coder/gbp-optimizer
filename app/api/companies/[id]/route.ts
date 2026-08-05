import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { companies, stores } from "@/lib/db/schema"
import { asc, eq, sql } from "drizzle-orm"
import { getAccessToken } from "@/lib/get-session"
import { errorResponse } from "@/lib/api-helpers"
import { requireRole } from "@/lib/services/authz"

/**
 * 会社1件の取得・更新・削除
 *
 * GET    会社と所属店舗の一覧
 * PATCH  会社コード / 会社名 / メモ の変更
 * DELETE 削除（所属店舗がある場合は拒否し、先に紐づけを外させる）
 */

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = await getAccessToken()
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { id } = await params
  const companyId = parseInt(id, 10)
  if (!companyId) return NextResponse.json({ error: "id が不正です" }, { status: 400 })

  try {
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, companyId))
    if (!company) {
      return NextResponse.json({ error: "会社が見つかりません" }, { status: 404 })
    }
    const list = await db
      .select({
        locationName: stores.locationName,
        title: stores.title,
        status: stores.status,
      })
      .from(stores)
      .where(eq(stores.companyId, companyId))
      .orderBy(asc(stores.title))

    return NextResponse.json({ company, stores: list })
  } catch (e) {
    return errorResponse("Failed to fetch company", e)
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireRole("editor")
  if (denied) return denied

  const token = await getAccessToken()
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { id } = await params
  const companyId = parseInt(id, 10)
  if (!companyId) return NextResponse.json({ error: "id が不正です" }, { status: 400 })

  let body: { code?: string; name?: string; notes?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  try {
    if (body.code !== undefined) {
      const code = body.code.trim()
      if (!code) {
        return NextResponse.json({ error: "会社コードは空にできません" }, { status: 400 })
      }
      const [dup] = await db
        .select({ id: companies.id })
        .from(companies)
        .where(eq(companies.code, code))
      if (dup && dup.id !== companyId) {
        return NextResponse.json(
          { error: `会社コード「${code}」は既に使われています` },
          { status: 400 }
        )
      }
    }

    await db
      .update(companies)
      .set({
        ...(body.code !== undefined ? { code: body.code.trim() } : {}),
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        updatedAt: new Date(),
      })
      .where(eq(companies.id, companyId))

    return NextResponse.json({ success: true })
  } catch (e) {
    return errorResponse("Failed to update company", e)
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireRole("admin")
  if (denied) return denied

  const token = await getAccessToken()
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { id } = await params
  const companyId = parseInt(id, 10)
  if (!companyId) return NextResponse.json({ error: "id が不正です" }, { status: 400 })

  try {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(stores)
      .where(eq(stores.companyId, companyId))
    if (count > 0) {
      return NextResponse.json(
        {
          error: `この会社には${count}店舗が紐づいています。先に紐づけを解除してください（誤って全店舗の会社情報が消えるのを防ぐため）`,
        },
        { status: 400 }
      )
    }

    await db.delete(companies).where(eq(companies.id, companyId))
    return NextResponse.json({ success: true })
  } catch (e) {
    return errorResponse("Failed to delete company", e)
  }
}
