import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { appUsers } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { getSessionEmail } from "@/lib/get-session"

/**
 * 権限判定（サーバー側で強制する）
 *
 * ログイン自体は従来どおり li-go.jp ドメインで許可し、
 * ここで「何ができるか」を決める。UIの出し分けだけでなく、
 * 書き込み系APIでも requireRole を通すことで実効性を持たせる。
 */

export type Role = "admin" | "editor" | "viewer"

/** 未登録ユーザーの既定ロール（日常運用は止めない） */
const DEFAULT_ROLE: Role = "editor"

/** 最初の管理者（ユーザー管理画面が空でもロックアウトされないための保険） */
const BOOTSTRAP_ADMINS = ["meo-support@li-go.jp", "ikeshita.tsukashi@li-go.jp"]

const ROLE_RANK: Record<Role, number> = { viewer: 1, editor: 2, admin: 3 }

export interface CurrentUser {
  email: string
  role: Role
  disabled: boolean
}

/**
 * 現在のユーザーを取得（未登録なら自動登録して既定ロールを付与）
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const email = (await getSessionEmail())?.toLowerCase()
  if (!email) return null

  const [row] = await db.select().from(appUsers).where(eq(appUsers.email, email))
  if (row) {
    // 最終ログイン時刻の更新（失敗しても致命的ではない）
    db.update(appUsers)
      .set({ lastLoginAt: new Date() })
      .where(eq(appUsers.email, email))
      .catch(() => {})
    return { email, role: row.role as Role, disabled: row.disabled }
  }

  const role: Role = BOOTSTRAP_ADMINS.includes(email) ? "admin" : DEFAULT_ROLE
  try {
    await db
      .insert(appUsers)
      .values({ email, role, lastLoginAt: new Date() })
      .onConflictDoNothing()
  } catch {
    /* 競合は無視 */
  }
  return { email, role, disabled: false }
}

/**
 * 必要ロールを満たしていなければ 401/403 のレスポンスを返す。
 * 満たしていれば null を返すので、呼び出し側は
 *   const denied = await requireRole("admin"); if (denied) return denied
 * の形で使う。
 */
export async function requireRole(
  minRole: Role
): Promise<NextResponse | null> {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }
  if (user.disabled) {
    return NextResponse.json(
      { error: "このアカウントは無効化されています。管理者にご連絡ください。" },
      { status: 403 }
    )
  }
  if (ROLE_RANK[user.role] < ROLE_RANK[minRole]) {
    const label = minRole === "admin" ? "管理者" : "編集"
    return NextResponse.json(
      { error: `この操作には${label}権限が必要です（現在: ${roleLabel(user.role)}）` },
      { status: 403 }
    )
  }
  return null
}

export function roleLabel(role: Role): string {
  return role === "admin" ? "管理者" : role === "editor" ? "編集者" : "閲覧のみ"
}
