import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { scheduledPosts, stores } from "@/lib/db/schema"
import { createGmbClient } from "@/lib/gbp-client"
import { and, eq, lte, sql } from "drizzle-orm"
import { getAccessToken } from "@/lib/get-session"

/**
 * GET /api/cron/execute-scheduled
 *
 * Vercel Cron が呼び出すエンドポイント。
 * 認証: Authorization: Bearer ${CRON_SECRET} or Vercel が自動付与する x-vercel-cron ヘッダー。
 *
 * scheduled_posts から status='pending' かつ scheduled_for <= now() を取得して、
 * v4 API へ投稿し、結果を DB に記録する。
 *
 * 注意: OAuth ユーザーアクセストークンを使うので、各店舗のオーナー権限を持つ
 * ユーザーが過去に認可済みである必要がある。
 * 現状は store_owner_tokens 等のサービストークン管理は無いため、Authorization
 * ヘッダーで渡されたトークンを使う。Cron では設定不可なので、最初の MVP は
 * 「人がポチる」スタイル（このエンドポイントへ POST で発火）も併設する。
 */

function isAuthorized(request: Request): boolean {
  const auth = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true
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
  if (post.mediaUrls && post.mediaUrls.length > 0) {
    body.media = post.mediaUrls.map((url) => ({ mediaFormat: "PHOTO", sourceUrl: url }))
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

  // accessToken はクロン経由では入手できない（OAuth ユーザートークンが要る）。
  // ベスト方策: 専用のサービスアカウント or 「事前に保存したリフレッシュトークン」を使うが
  // 今の MVP では未実装。Cron での自動実行を機能させるには CRON_OAUTH_TOKEN を設定する。
  const cronToken = process.env.CRON_OAUTH_TOKEN
  if (!cronToken) {
    return NextResponse.json(
      {
        ok: true,
        skipped: true,
        reason:
          "CRON_OAUTH_TOKEN not configured. Skipping automatic execution. Use the UI Run button instead, or set CRON_OAUTH_TOKEN to a long-lived access token.",
      },
      { status: 200 }
    )
  }

  return runExecution(cronToken)
}

/**
 * POST /api/cron/execute-scheduled
 * 認証済みユーザーが UI から「今すぐ実行」ボタンを押すと、自分のアクセストークンで
 * 実行できる。Cron 経由ではなく手動トリガー用。
 */
export async function POST(request: Request) {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    // Cron 経由でも POST 可: Bearer 認証ヘッダーをチェック
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }
    const tk = process.env.CRON_OAUTH_TOKEN
    if (!tk) {
      return NextResponse.json(
        { error: "CRON_OAUTH_TOKEN not configured" },
        { status: 500 }
      )
    }
    return runExecution(tk)
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
    .limit(50)

  const results: Array<{
    id: number
    status: "posted" | "failed"
    error?: string
  }> = []

  for (const post of rows) {
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
    results,
  })
}
