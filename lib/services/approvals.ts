import { db } from "@/lib/db"
import { appSettings, approvalRequests, scheduledPosts } from "@/lib/db/schema"
import { and, eq, inArray } from "drizzle-orm"

/**
 * ワークフロー承認
 *
 * ONにすると、予約投稿は「承認済み」になるまで自動実行の対象外になる。
 * OFF（既定）のときは従来どおり時刻が来たら実行される。
 */

const WF_KEY = "workflow_required"

export type ApprovalState = "none" | "pending" | "approved" | "rejected"

/** ワークフロー承認が必須かどうか */
export async function isWorkflowRequired(): Promise<boolean> {
  try {
    const [row] = await db.select().from(appSettings).where(eq(appSettings.key, WF_KEY))
    return row?.value === "1"
  } catch {
    // 設定が読めない場合は従来動作（承認不要）を維持し、投稿を止めない
    return false
  }
}

export async function setWorkflowRequired(required: boolean, email: string | null) {
  await db
    .insert(appSettings)
    .values({ key: WF_KEY, value: required ? "1" : "0", updatedBy: email })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: required ? "1" : "0", updatedBy: email, updatedAt: new Date() },
    })
}

/**
 * 予約投稿IDごとの承認状態をまとめて取得（一覧表示用）
 * 同一対象に複数申請がある場合は最後の申請を採用する。
 */
export async function getApprovalStates(
  postIds: number[]
): Promise<Map<number, ApprovalState>> {
  const map = new Map<number, ApprovalState>()
  if (postIds.length === 0) return map
  const rows = await db
    .select({
      targetId: approvalRequests.targetId,
      status: approvalRequests.status,
      id: approvalRequests.id,
    })
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.targetType, "scheduled_post"),
        inArray(approvalRequests.targetId, postIds)
      )
    )
  // id の昇順で上書きし、最新の申請結果を残す
  for (const r of rows.sort((a, b) => a.id - b.id)) {
    map.set(r.targetId, r.status as ApprovalState)
  }
  return map
}

/**
 * 実行対象から「承認されていない投稿」を除外する。
 * ワークフローOFFのときは何も除外しない。
 */
export async function filterApprovedForExecution<T extends { id: number }>(
  posts: T[]
): Promise<{ allowed: T[]; blocked: T[] }> {
  if (posts.length === 0) return { allowed: [], blocked: [] }
  if (!(await isWorkflowRequired())) return { allowed: posts, blocked: [] }

  const states = await getApprovalStates(posts.map((p) => p.id))
  const allowed: T[] = []
  const blocked: T[] = []
  for (const p of posts) {
    if (states.get(p.id) === "approved") allowed.push(p)
    else blocked.push(p)
  }
  return { allowed, blocked }
}

/** 承認申請を作成（既に申請中なら再利用） */
export async function createApprovalRequest(
  postId: number,
  email: string | null
): Promise<{ id: number; reused: boolean }> {
  const existing = await db
    .select()
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.targetType, "scheduled_post"),
        eq(approvalRequests.targetId, postId),
        eq(approvalRequests.status, "pending")
      )
    )
  if (existing.length > 0) return { id: existing[0].id, reused: true }

  const [post] = await db
    .select({
      summary: scheduledPosts.summary,
      locationName: scheduledPosts.locationName,
    })
    .from(scheduledPosts)
    .where(eq(scheduledPosts.id, postId))

  const [created] = await db
    .insert(approvalRequests)
    .values({
      targetType: "scheduled_post",
      targetId: postId,
      summary: post?.summary?.slice(0, 500) ?? null,
      locationName: post?.locationName ?? null,
      requestedBy: email,
    })
    .returning({ id: approvalRequests.id })
  return { id: created.id, reused: false }
}
