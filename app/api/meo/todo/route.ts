import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { meoSnapshots, stores } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { getAccessToken } from "@/lib/get-session"
import { errorResponse } from "@/lib/api-helpers"
import { requireRole } from "@/lib/services/authz"
import { MEO_CHECKS, type MeoSnapshot } from "@/lib/meo-types"
import { meoTargets, refreshMeoSnapshots, setDismissed } from "@/lib/services/meo-snapshot"

export const maxDuration = 60

/**
 * MEO やることリスト（社内・ログイン必須）
 *
 *   GET                              控えてある各店舗の状態（Googleには問い合わせない・速い）
 *   POST { action: "refresh", since } Google から読み直す（読み取りのみ）。時間で区切って進め、
 *                                     remaining が 0 になるまで画面側が続けて呼ぶ
 *   PATCH { locationName, checkId, dismissed }  この店舗ではこの項目を対象外にする／戻す
 */

/** 1回の呼び出しで使う時間。これを超えたら途中で返して、続きは次の呼び出しで行う */
const BUDGET_MS = 35_000

export async function GET() {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }
  try {
    const [targets, snaps] = await Promise.all([
      meoTargets(),
      db
        .select({
          locationName: meoSnapshots.locationName,
          data: meoSnapshots.data,
          dismissed: meoSnapshots.dismissed,
          checkedAt: meoSnapshots.checkedAt,
        })
        .from(meoSnapshots),
    ])
    const byLoc = new Map(snaps.map((s) => [s.locationName, s]))
    return NextResponse.json({
      now: new Date().toISOString(),
      stores: targets.map((t) => {
        const s = byLoc.get(t.locationName)
        return {
          locationName: t.locationName,
          title: t.title,
          checkedAt: s ? s.checkedAt.toISOString() : null,
          data: s ? (s.data as MeoSnapshot) : null,
          dismissed: s?.dismissed ?? [],
        }
      }),
    })
  } catch (e) {
    return errorResponse("やることリストを読み込めませんでした", e)
  }
}

export async function POST(request: Request) {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }
  let body: { action?: string; since?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  if (body.action !== "refresh") {
    return NextResponse.json({ error: "操作が指定されていません" }, { status: 400 })
  }
  // since = 「いま調べる」を押した時刻。それより前に読んだ店舗を、順に読み直す
  const since = body.since ? new Date(body.since) : new Date()
  if (Number.isNaN(since.getTime())) {
    return NextResponse.json({ error: "時刻の指定が正しくありません" }, { status: 400 })
  }
  try {
    const result = await refreshMeoSnapshots({ budgetMs: BUDGET_MS, olderThan: since })
    return NextResponse.json({ success: true, ...result })
  } catch (e) {
    return errorResponse("Google から読み取れませんでした", e)
  }
}

export async function PATCH(request: Request) {
  const denied = await requireRole("editor")
  if (denied) return denied

  let body: { locationName?: string; checkId?: string; dismissed?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const id = (body.locationName ?? "").replace(/^locations\//, "")
  if (
    !/^\d{1,30}$/.test(id) ||
    !MEO_CHECKS.some((c) => c.id === body.checkId) ||
    typeof body.dismissed !== "boolean"
  ) {
    return NextResponse.json({ error: "指定が正しくありません" }, { status: 400 })
  }
  try {
    const locationName = `locations/${id}`
    const [store] = await db
      .select({ locationName: stores.locationName })
      .from(stores)
      .where(eq(stores.locationName, locationName))
    if (!store) return NextResponse.json({ error: "店舗が見つかりません" }, { status: 404 })
    await setDismissed(locationName, body.checkId!, body.dismissed)
    return NextResponse.json({ success: true })
  } catch (e) {
    return errorResponse("変更できませんでした", e)
  }
}
