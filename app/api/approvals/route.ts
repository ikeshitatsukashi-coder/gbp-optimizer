import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { approvalRequests, scheduledPosts, stores } from "@/lib/db/schema"
import { desc, eq } from "drizzle-orm"
import { errorResponse } from "@/lib/api-helpers"
import { getCurrentUser, requireRole } from "@/lib/services/authz"
import {
  createApprovalRequest,
  isWorkflowRequired,
  setWorkflowRequired,
} from "@/lib/services/approvals"

/**
 * ワークフロー承認
 * GET   申請一覧 + ワークフローON/OFF
 * POST  申請作成（編集者以上） / 承認・差し戻し（管理者のみ） / ワークフロー設定変更（管理者のみ）
 */

export async function GET(request: Request) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const status = new URL(request.url).searchParams.get("status")

  try {
    const base = db
      .select({
        id: approvalRequests.id,
        targetType: approvalRequests.targetType,
        targetId: approvalRequests.targetId,
        summary: approvalRequests.summary,
        locationName: approvalRequests.locationName,
        status: approvalRequests.status,
        requestedBy: approvalRequests.requestedBy,
        requestedAt: approvalRequests.requestedAt,
        decidedBy: approvalRequests.decidedBy,
        decidedAt: approvalRequests.decidedAt,
        comment: approvalRequests.comment,
        storeTitle: stores.title,
        scheduledFor: scheduledPosts.scheduledFor,
        postStatus: scheduledPosts.status,
      })
      .from(approvalRequests)
      .leftJoin(stores, eq(stores.locationName, approvalRequests.locationName))
      .leftJoin(scheduledPosts, eq(scheduledPosts.id, approvalRequests.targetId))
      .orderBy(desc(approvalRequests.requestedAt))
      .limit(500)

    const rows =
      status === "pending" || status === "approved" || status === "rejected"
        ? await base.where(eq(approvalRequests.status, status))
        : await base

    const counts = { pending: 0, approved: 0, rejected: 0 }
    const all = await db
      .select({ status: approvalRequests.status })
      .from(approvalRequests)
    for (const r of all) counts[r.status as keyof typeof counts]++

    return NextResponse.json({
      requests: rows,
      counts,
      workflowRequired: await isWorkflowRequired(),
      me,
    })
  } catch (e) {
    return errorResponse("Failed to list approval requests", e)
  }
}

export async function POST(request: Request) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  let body: {
    action?: string
    postId?: number
    postIds?: number[]
    id?: number
    ids?: number[]
    comment?: string
    required?: boolean
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  try {
    /* ---- ワークフローのON/OFF（管理者のみ） ---- */
    if (body.action === "set_workflow") {
      const denied = await requireRole("admin")
      if (denied) return denied
      await setWorkflowRequired(body.required === true, me.email)
      return NextResponse.json({ success: true, workflowRequired: body.required === true })
    }

    /* ---- 承認申請の作成（編集者以上） ---- */
    if (body.action === "request") {
      const denied = await requireRole("editor")
      if (denied) return denied
      const ids = body.postIds ?? (body.postId ? [body.postId] : [])
      if (ids.length === 0) {
        return NextResponse.json({ error: "postId が必要です" }, { status: 400 })
      }
      let created = 0
      let reused = 0
      for (const postId of ids) {
        const r = await createApprovalRequest(postId, me.email)
        r.reused ? reused++ : created++
      }
      return NextResponse.json({ success: true, created, reused })
    }

    /* ---- 承認・差し戻し（管理者のみ） ---- */
    if (body.action === "approve" || body.action === "reject") {
      const denied = await requireRole("admin")
      if (denied) return denied
      const ids = body.ids ?? (body.id ? [body.id] : [])
      if (ids.length === 0) {
        return NextResponse.json({ error: "id が必要です" }, { status: 400 })
      }
      const status = body.action === "approve" ? "approved" : "rejected"
      let updated = 0
      for (const id of ids) {
        // 申請者自身による自己承認は認めない（内部統制の基本）
        const [target] = await db
          .select({ requestedBy: approvalRequests.requestedBy })
          .from(approvalRequests)
          .where(eq(approvalRequests.id, id))
        if (!target) continue
        if (status === "approved" && target.requestedBy === me.email) {
          return NextResponse.json(
            { error: "自分が申請した投稿は自分では承認できません（別の管理者が承認してください）" },
            { status: 400 }
          )
        }
        await db
          .update(approvalRequests)
          .set({
            status,
            decidedBy: me.email,
            decidedAt: new Date(),
            comment: body.comment ?? null,
          })
          .where(eq(approvalRequests.id, id))
        updated++
      }
      return NextResponse.json({ success: true, updated })
    }

    return NextResponse.json({ error: "action が不正です" }, { status: 400 })
  } catch (e) {
    return errorResponse("Failed to process approval", e)
  }
}
