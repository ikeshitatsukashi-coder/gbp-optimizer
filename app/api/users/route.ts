import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { appUsers } from "@/lib/db/schema"
import { desc, eq } from "drizzle-orm"
import { errorResponse } from "@/lib/api-helpers"
import { getCurrentUser, requireRole, type Role } from "@/lib/services/authz"

/**
 * 利用者・権限の管理
 * GET    一覧（ログイン中の自分の権限も返す）
 * PATCH  ロール変更・有効/無効の切替（管理者のみ）
 * DELETE 利用者の削除（管理者のみ・自分自身は不可）
 */

const VALID_ROLES = new Set<Role>(["admin", "editor", "viewer"])

export async function GET() {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  try {
    const rows = await db.select().from(appUsers).orderBy(desc(appUsers.createdAt))
    return NextResponse.json({ users: rows, me })
  } catch (e) {
    return errorResponse("Failed to list users", e)
  }
}

export async function PATCH(request: Request) {
  const denied = await requireRole("admin")
  if (denied) return denied

  let body: { email?: string; role?: string; disabled?: boolean; displayName?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const email = body.email?.toLowerCase()
  if (!email) return NextResponse.json({ error: "email が必要です" }, { status: 400 })

  const me = await getCurrentUser()
  // 自分自身を管理者から降格・無効化して締め出すのを防ぐ
  if (me?.email === email) {
    if ((body.role && body.role !== "admin") || body.disabled === true) {
      return NextResponse.json(
        { error: "自分自身の管理者権限を外す・無効化することはできません" },
        { status: 400 }
      )
    }
  }

  if (body.role && !VALID_ROLES.has(body.role as Role)) {
    return NextResponse.json({ error: "role が不正です" }, { status: 400 })
  }

  try {
    await db
      .update(appUsers)
      .set({
        ...(body.role ? { role: body.role as Role } : {}),
        ...(typeof body.disabled === "boolean" ? { disabled: body.disabled } : {}),
        ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
        updatedAt: new Date(),
      })
      .where(eq(appUsers.email, email))
    return NextResponse.json({ success: true })
  } catch (e) {
    return errorResponse("Failed to update user", e)
  }
}

export async function DELETE(request: Request) {
  const denied = await requireRole("admin")
  if (denied) return denied

  const email = new URL(request.url).searchParams.get("email")?.toLowerCase()
  if (!email) return NextResponse.json({ error: "email が必要です" }, { status: 400 })

  const me = await getCurrentUser()
  if (me?.email === email) {
    return NextResponse.json({ error: "自分自身は削除できません" }, { status: 400 })
  }

  try {
    await db.delete(appUsers).where(eq(appUsers.email, email))
    return NextResponse.json({ success: true })
  } catch (e) {
    return errorResponse("Failed to delete user", e)
  }
}
