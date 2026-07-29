import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { flagHistory, reviewsArchive } from "@/lib/db/schema"
import { eq, inArray } from "drizzle-orm"
import { errorResponse } from "@/lib/api-helpers"
import { requireRole } from "@/lib/services/authz"
import { getSessionEmail } from "@/lib/get-session"

/**
 * 手動でおこなった削除申請の記録
 *
 * Google には削除申請のAPIが無い（v4 の :flag は 404 を返す）。
 * 実際の申請はGBP管理画面やGoogleの「クチコミを報告」フォームから人が行うため、
 * 「いつ・誰が・どのクチコミを申請したか」をここに記録し、
 * クライアント報告（削除レポート）で結果と突き合わせられるようにする。
 *
 * POST   申請の記録（複数まとめて可）
 * PATCH  結果の更新（承認された / 却下された）
 * DELETE 記録の取り消し
 */

const VALID_METHODS = new Set(["gbp_ui", "google_form", "other"])

export async function POST(request: Request) {
  const denied = await requireRole("editor")
  if (denied) return denied

  let body: {
    reviewNames?: string[]
    requestMethod?: string
    note?: string
    flaggedAt?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const reviewNames = (body.reviewNames ?? []).filter(Boolean)
  if (reviewNames.length === 0) {
    return NextResponse.json({ error: "reviewNames が必要です" }, { status: 400 })
  }
  const method = body.requestMethod ?? "gbp_ui"
  if (!VALID_METHODS.has(method)) {
    return NextResponse.json(
      { error: `requestMethod は ${[...VALID_METHODS].join(" / ")} のいずれかです` },
      { status: 400 }
    )
  }

  const flaggedAt = body.flaggedAt ? new Date(body.flaggedAt) : new Date()
  if (Number.isNaN(flaggedAt.getTime())) {
    return NextResponse.json({ error: "申請日が不正です" }, { status: 400 })
  }

  try {
    const email = await getSessionEmail()

    // 申請時点の内容をスナップショットとして残す（後で消えても報告書に載せられる）
    const snapshots = await db
      .select({
        reviewName: reviewsArchive.reviewName,
        locationName: reviewsArchive.locationName,
        reviewer: reviewsArchive.reviewer,
        starRating: reviewsArchive.starRating,
        comment: reviewsArchive.comment,
      })
      .from(reviewsArchive)
      .where(inArray(reviewsArchive.reviewName, reviewNames))

    if (snapshots.length === 0) {
      return NextResponse.json(
        { error: "対象のクチコミが見つかりません（先にクチコミ同期を実行してください）" },
        { status: 400 }
      )
    }

    const inserted = await db
      .insert(flagHistory)
      .values(
        snapshots.map((s) => ({
          reviewName: s.reviewName,
          locationName: s.locationName,
          reviewerSnapshot: s.reviewer,
          starRatingSnapshot: s.starRating,
          commentSnapshot: s.comment,
          status: "manual" as const,
          requestMethod: method,
          requestedBy: email,
          note: body.note ?? null,
          flaggedAt,
        }))
      )
      .returning({ id: flagHistory.id })

    const missing = reviewNames.filter(
      (n) => !snapshots.some((s) => s.reviewName === n)
    )
    return NextResponse.json({
      success: true,
      recorded: inserted.length,
      skipped: missing.length,
      ...(missing.length > 0 ? { skippedReviewNames: missing } : {}),
    })
  } catch (e) {
    return errorResponse("Failed to record flag request", e)
  }
}

export async function PATCH(request: Request) {
  const denied = await requireRole("editor")
  if (denied) return denied

  let body: { id?: number; status?: string; note?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  if (!body.id) return NextResponse.json({ error: "id が必要です" }, { status: 400 })
  if (body.status && !["approved", "rejected", "manual"].includes(body.status)) {
    return NextResponse.json(
      { error: "status は approved / rejected / manual のいずれかです" },
      { status: 400 }
    )
  }

  try {
    await db
      .update(flagHistory)
      .set({
        ...(body.status ? { status: body.status as "approved" | "rejected" | "manual" } : {}),
        ...(body.status === "approved" ? { confirmedAt: new Date() } : {}),
        ...(body.note !== undefined ? { note: body.note } : {}),
      })
      .where(eq(flagHistory.id, body.id))
    return NextResponse.json({ success: true })
  } catch (e) {
    return errorResponse("Failed to update flag record", e)
  }
}

export async function DELETE(request: Request) {
  const denied = await requireRole("editor")
  if (denied) return denied

  const id = parseInt(new URL(request.url).searchParams.get("id") ?? "", 10)
  if (!id) return NextResponse.json({ error: "id が必要です" }, { status: 400 })
  try {
    await db.delete(flagHistory).where(eq(flagHistory.id, id))
    return NextResponse.json({ success: true })
  } catch (e) {
    return errorResponse("Failed to delete flag record", e)
  }
}
