import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { scheduledPosts } from "@/lib/db/schema"
import { and, eq, isNotNull, sql } from "drizzle-orm"
import { getAccessToken } from "@/lib/get-session"
import { createGmbClient } from "@/lib/gbp-client"
import { errorResponse } from "@/lib/api-helpers"

export const maxDuration = 60

/**
 * POST /api/scheduled-posts/sync-state
 *
 * 投稿済みレコードについて、Google側の現在の状態を確認して DB に反映する。
 * 投稿直後は state=PROCESSING（Google の処理待ち）で、完了すると LIVE になる。
 * 404 は「Google上に存在しない」＝削除済み or 却下。
 *
 * 読み取りのみ（GBPへの書き込みは行わない）。
 */
export async function POST() {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    // 状態未確定（PROCESSING or 未確認）のものを対象に、最大30件
    const rows = await db
      .select({
        id: scheduledPosts.id,
        result: scheduledPosts.result,
        gbpState: scheduledPosts.gbpState,
      })
      .from(scheduledPosts)
      .where(
        and(
          eq(scheduledPosts.status, "posted"),
          isNotNull(scheduledPosts.result)
        )
      )
      .limit(30)

    const client = createGmbClient(accessToken)
    let live = 0
    let processing = 0
    let missing = 0
    let checked = 0

    for (const row of rows) {
      const postName = (row.result as { name?: string } | null)?.name
      if (!postName) continue
      // 既に LIVE 確定のものは再確認しない（API呼び出し節約）
      if (row.gbpState === "LIVE") {
        live++
        continue
      }
      try {
        const { state, notFound } = await client.getPostState(postName)
        checked++
        const newState = notFound ? "NOT_FOUND" : (state ?? "UNKNOWN")
        if (newState === "LIVE") live++
        else if (newState === "NOT_FOUND") missing++
        else processing++

        await db
          .update(scheduledPosts)
          .set({ gbpState: newState, gbpStateCheckedAt: new Date(), updatedAt: sql`now()` })
          .where(eq(scheduledPosts.id, row.id))
      } catch {
        // 一時的なAPIエラーは次回に回す
      }
    }

    return NextResponse.json({ ok: true, checked, live, processing, missing })
  } catch (e) {
    return errorResponse("Failed to sync post state", e)
  }
}
