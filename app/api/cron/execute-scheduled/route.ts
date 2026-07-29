import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { scheduledPosts, stores } from "@/lib/db/schema"
import { createGmbClient } from "@/lib/gbp-client"
import { and, eq, lte, sql } from "drizzle-orm"
import { getAccessToken } from "@/lib/get-session"
import { getServiceAccessToken } from "@/lib/services/cron-auth"
import { filterApprovedForExecution } from "@/lib/services/approvals"

/** 投稿実行に時間がかかるため延長（1回最大20件） */
export const maxDuration = 60

/**
 * GET /api/cron/execute-scheduled
 *
 * 定期実行（GitHub Actions 等）が呼び出すエンドポイント。
 * 認証: Authorization: Bearer ${CRON_SECRET} / ?secret=${CRON_SECRET} / x-vercel-cron ヘッダー。
 *
 * scheduled_posts から status='pending' かつ scheduled_for <= now() を取得して
 * v4 API へ投稿し、結果を DB に記録する。
 * アクセストークンは「自動実行を有効化」で保存されたリフレッシュトークンから都度発行。
 */

function isAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false
  const auth = request.headers.get("authorization")
  if (auth === `Bearer ${cronSecret}`) return true
  const url = new URL(request.url)
  if (url.searchParams.get("secret") === cronSecret) return true
  // Vercel Cron は内部的に "x-vercel-cron" ヘッダーを付ける
  if (request.headers.get("x-vercel-cron")) return true
  return false
}

async function executeOne(
  accessToken: string,
  post: {
    id: number
    locationName: string
    accountName: string
    postType: string
    summary: string
    mediaUrls: string[] | null
    callToAction: { actionType?: string; url?: string } | null
  }
): Promise<{ ok: boolean; error?: string; result?: unknown }> {
  const client = createGmbClient(accessToken)
  const body: Record<string, unknown> = {
    languageCode: "ja",
    summary: post.summary,
    topicType: post.postType,
  }
  if (post.callToAction?.actionType) {
    body.callToAction = post.callToAction
  }
  // Google の仕様上、1投稿に添付できる写真は1枚まで（複数送ると INVALID_ARGUMENT）
  if (post.mediaUrls && post.mediaUrls.length > 0) {
    body.media = [{ mediaFormat: "PHOTO", sourceUrl: post.mediaUrls[0] }]
  }
  try {
    const result = await client.createPost(post.accountName, post.locationName, body)
    return { ok: true, result }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // 保存済みリフレッシュトークンからアクセストークンを発行
  const svc = await getServiceAccessToken()
  if (!svc.accessToken) {
    return NextResponse.json({ ok: true, skipped: true, reason: svc.reason }, { status: 200 })
  }

  return runExecution(svc.accessToken)
}

/**
 * POST /api/cron/execute-scheduled
 * 認証済みユーザーが UI から「今すぐ実行」ボタンを押すと、自分のアクセストークンで
 * 実行できる。セッションがなければ保存済みトークンにフォールバック（CRON_SECRET必須）。
 */
export async function POST(request: Request) {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }
    const svc = await getServiceAccessToken()
    if (!svc.accessToken) {
      return NextResponse.json({ error: svc.reason }, { status: 500 })
    }
    return runExecution(svc.accessToken)
  }
  return runExecution(accessToken)
}

async function runExecution(accessToken: string) {
  const now = new Date()
  // 期日到来 + pending のものを最大 50 件取得
  const rows = await db
    .select({
      id: scheduledPosts.id,
      locationName: scheduledPosts.locationName,
      accountName: stores.accountName,
      postType: scheduledPosts.postType,
      summary: scheduledPosts.summary,
      mediaUrls: scheduledPosts.mediaUrls,
      callToAction: scheduledPosts.callToAction,
    })
    .from(scheduledPosts)
    .innerJoin(stores, eq(stores.locationName, scheduledPosts.locationName))
    .where(
      and(
        eq(scheduledPosts.status, "pending"),
        lte(scheduledPosts.scheduledFor, now)
      )
    )
    .limit(20) // 60秒制限内に収める（残りは次回実行で処理）

  // ワークフロー承認がONの場合、未承認の投稿は実行せず pending のまま残す
  const { allowed, blocked } = await filterApprovedForExecution(rows)

  const results: Array<{
    id: number
    status: "posted" | "failed"
    error?: string
  }> = []

  for (const post of allowed) {
    const r = await executeOne(accessToken, {
      id: post.id,
      locationName: post.locationName,
      accountName: post.accountName,
      postType: post.postType,
      summary: post.summary,
      mediaUrls: post.mediaUrls,
      callToAction: post.callToAction as { actionType?: string; url?: string } | null,
    })

    if (r.ok) {
      await db
        .update(scheduledPosts)
        .set({
          status: "posted",
          executedAt: new Date(),
          result: r.result as Record<string, unknown>,
          updatedAt: sql`now()`,
        })
        .where(eq(scheduledPosts.id, post.id))
      results.push({ id: post.id, status: "posted" })
    } else {
      await db
        .update(scheduledPosts)
        .set({
          status: "failed",
          executedAt: new Date(),
          errorMessage: r.error?.slice(0, 500),
          updatedAt: sql`now()`,
        })
        .where(eq(scheduledPosts.id, post.id))
      results.push({ id: post.id, status: "failed", error: r.error })
    }
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    posted: results.filter((r) => r.status === "posted").length,
    failed: results.filter((r) => r.status === "failed").length,
    /** 承認待ちのため実行しなかった件数 */
    awaitingApproval: blocked.length,
    results,
  })
}
